/**
 * CloudStorageService — Proxy de almacenamiento offline-first con sync a Supabase.
 *
 * Modelo automático (sin UI de sincronización):
 *   - Lecturas/escrituras inmediatas a local (cero latencia, funciona sin internet).
 *   - Cada save SELLA los ítems (updatedAt / deletedAt), guarda local y AGENDA un
 *     auto-guardado a Supabase (app_data, con debounce). Ver pushDataOnly()/flush().
 *   - RECIBIR (pull+merge) es automático al abrir: syncFromCloud().
 *
 * El merge por ítem (newest-wins + tombstones, ver sync/merge.ts con tests) evita
 * perder datos al combinar lo de varias PCs.
 *
 * pushSession()/getVersionHistory()/restoreVersion() (historial en la tabla
 * app_versions) quedan en el código pero NO se usan desde la UI: la sincronización
 * manual con historial se retiró por no estar la tabla creada.
 *
 * Implementa IStorageService → sustituye a StorageService en el grafo de servicios.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import log from 'electron-log';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { ENV } from '../config/env';
import { mergeRaw, mergeMaps, type Stamped } from '../sync/merge';
import { diffKeyed, totalChanges, describeDiff } from '../sync/diff';
import type { IStorageService } from './IStorageService';
import type { Professor, Semester, PensumSubject } from '@scheduler/shared';
import type {
  AcademicLoad,
  ScheduleBlockData,
  LogEntry,
  AppSnapshot,
  PendingDiff,
  SyncStatus,
  VersionMeta,
  SyncState,
} from '../types';

type SProfessor = Professor & Stamped;
type SBlock = ScheduleBlockData & Stamped;
type SLog = LogEntry & Stamped;
type SSubject = PensumSubject & Stamped & { _sem?: number };
type SLoadVal = AcademicLoad[string] & Stamped;
type SSemester = { number: number; subjects: SSubject[] };

interface RawDatasets {
  professors: SProfessor[];
  pensum: SSemester[];
  scheduleBlocks: SBlock[];
  academicLoad: Record<string, SLoadVal>;
  logs: SLog[];
}

/** JSON estable (orden de claves) ignorando la metadata de sync. */
function stableStringify(o: unknown): string {
  if (o === null || typeof o !== 'object') return JSON.stringify(o) ?? 'null';
  if (Array.isArray(o)) return '[' + o.map(stableStringify).join(',') + ']';
  const obj = o as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => k !== 'updatedAt' && k !== 'deletedAt')
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}
function sameContent(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/**
 * Electron empaqueta Node 18 (sin WebSocket nativo). supabase-js inicializa su
 * cliente realtime —que exige WebSocket— aunque aquí solo usemos la API REST.
 * Proveemos un polyfill con el paquete 'ws'. (No usamos realtime.)
 */
function ensureWebSocket(): void {
  const g = globalThis as unknown as { WebSocket?: unknown };
  if (typeof g.WebSocket === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ws = require('ws');
    g.WebSocket = ws.WebSocket ?? ws;
  }
}

export class CloudStorageService implements IStorageService {
  private client: SupabaseClient | null = null;
  private autoPushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly local: IStorageService) {
    if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
      log.warn('[Cloud] Sin credenciales — modo offline (solo local).');
      return;
    }
    try {
      ensureWebSocket();
      this.client = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });
      log.info('[Cloud] Modo nube activo →', ENV.SUPABASE_URL);
    } catch (e) {
      log.error('[Cloud] No se pudo inicializar el cliente; se opera offline:', e);
      this.client = null;
    }
  }

  isCloudEnabled(): boolean {
    return !!this.client;
  }
  getDataDir(): string {
    return this.local.getDataDir();
  }

  private now(): string {
    return new Date().toISOString();
  }

  /** Sella un array con clave: nuevos/cambiados → updatedAt=now; removidos → tombstone. */
  private stampArray<T extends Stamped>(prev: T[], next: T[], keyOf: (i: T) => string): T[] {
    const ts = this.now();
    const prevByKey = new Map(prev.map((i) => [keyOf(i), i]));
    const out: T[] = [];
    const seen = new Set<string>();
    for (const item of next) {
      const k = keyOf(item);
      seen.add(k);
      const p = prevByKey.get(k);
      if (p && sameContent(p, item)) {
        out.push({ ...item, updatedAt: p.updatedAt ?? ts, deletedAt: undefined });
      } else {
        out.push({ ...item, updatedAt: ts, deletedAt: undefined });
      }
    }
    for (const [k, p] of prevByKey) {
      if (seen.has(k)) continue;
      out.push(p.deletedAt ? p : { ...p, deletedAt: ts });
    }
    return out;
  }

  private live<T extends Stamped>(arr: T[]): T[] {
    return arr.filter((i) => !i.deletedAt);
  }

  // ── Persistencia (offline-first, SIN subir solo) ─────────────────────────
  loadProfessors(): Professor[] {
    return this.live(this.local.loadProfessors() as SProfessor[]);
  }
  saveProfessors(professors: Professor[]): void {
    const stamped = this.stampArray(
      this.local.loadProfessors() as SProfessor[],
      professors as SProfessor[],
      (p) => p.id,
    );
    this.local.saveProfessors(stamped);
    this.scheduleAutoPush();
  }

  loadScheduleBlocks(): ScheduleBlockData[] {
    return this.live(this.local.loadScheduleBlocks() as SBlock[]);
  }
  saveScheduleBlocks(blocks: ScheduleBlockData[]): void {
    const stamped = this.stampArray(
      this.local.loadScheduleBlocks() as SBlock[],
      blocks as SBlock[],
      (b) => b.id,
    );
    this.local.saveScheduleBlocks(stamped);
    this.scheduleAutoPush();
  }

  loadLogs(): LogEntry[] {
    return this.live(this.local.loadLogs() as SLog[]);
  }
  saveLogs(logs: LogEntry[]): void {
    const stamped = this.stampArray(
      this.local.loadLogs() as SLog[],
      logs as SLog[],
      (l) => l.id,
    );
    this.local.saveLogs(stamped);
    this.scheduleAutoPush();
  }

  loadAcademicLoad(): AcademicLoad {
    const raw = this.local.loadAcademicLoad() as Record<string, SLoadVal>;
    const out: AcademicLoad = {};
    for (const [k, v] of Object.entries(raw)) if (!v.deletedAt) out[k] = v;
    return out;
  }
  saveAcademicLoad(load: AcademicLoad): void {
    const prev = this.local.loadAcademicLoad() as Record<string, SLoadVal>;
    const ts = this.now();
    const out: Record<string, SLoadVal> = {};
    for (const [k, v] of Object.entries(load)) {
      const p = prev[k];
      out[k] =
        p && sameContent(p, v)
          ? { ...v, updatedAt: p.updatedAt ?? ts }
          : { ...(v as SLoadVal), updatedAt: ts };
    }
    for (const [k, p] of Object.entries(prev)) {
      if (k in load) continue;
      out[k] = p.deletedAt ? p : { ...p, deletedAt: ts };
    }
    this.local.saveAcademicLoad(out);
    this.scheduleAutoPush();
  }

  loadPensum(): Semester[] {
    return this.stripPensum(this.local.loadPensum() as SSemester[]);
  }
  savePensum(pensum: Semester[]): void {
    const prev = this.local.loadPensum() as SSemester[];
    const prevByCode = new Map<string, SSubject>();
    for (const s of prev) for (const sub of s.subjects) prevByCode.set(sub.code, sub);
    const ts = this.now();
    const seen = new Set<string>();
    const stamped: SSemester[] = pensum.map((s) => ({
      number: s.number,
      subjects: (s.subjects as SSubject[]).map((sub) => {
        seen.add(sub.code);
        const p = prevByCode.get(sub.code);
        if (p && sameContent(p, sub)) return { ...sub, updatedAt: p.updatedAt ?? ts, deletedAt: undefined };
        return { ...sub, updatedAt: ts, deletedAt: undefined };
      }),
    }));
    for (const s of prev) {
      for (const sub of s.subjects) {
        if (seen.has(sub.code)) continue;
        let target = stamped.find((x) => x.number === s.number);
        if (!target) {
          target = { number: s.number, subjects: [] };
          stamped.push(target);
        }
        target.subjects.push(sub.deletedAt ? sub : { ...sub, deletedAt: ts });
      }
    }
    stamped.sort((a, b) => a.number - b.number);
    this.local.savePensum(stamped);
    this.scheduleAutoPush();
  }
  private stripPensum(sems: SSemester[]): Semester[] {
    return sems
      .map((s) => ({ number: s.number, subjects: s.subjects.filter((x) => !x.deletedAt) }))
      .filter((s) => s.subjects.length > 0);
  }
  private mergePensum(local: SSemester[], remote: SSemester[]): SSemester[] {
    const localFlat: SSubject[] = [];
    const remoteFlat: SSubject[] = [];
    for (const s of local) for (const sub of s.subjects) localFlat.push({ ...sub, _sem: s.number });
    for (const s of remote) for (const sub of s.subjects) remoteFlat.push({ ...sub, _sem: s.number });
    const merged = mergeRaw(localFlat, remoteFlat, (x) => x.code);
    const bySem = new Map<number, SSubject[]>();
    for (const sub of merged) {
      const n = sub._sem ?? 0;
      const { _sem, ...clean } = sub;
      void _sem;
      if (!bySem.has(n)) bySem.set(n, []);
      bySem.get(n)!.push(clean as SSubject);
    }
    return [...bySem.entries()].sort((a, b) => a[0] - b[0]).map(([number, subjects]) => ({ number, subjects }));
  }

  // ── Estado / diff de pendientes ──────────────────────────────────────────
  private localRaw(): RawDatasets {
    return {
      professors: this.local.loadProfessors() as SProfessor[],
      pensum: this.local.loadPensum() as SSemester[],
      scheduleBlocks: this.local.loadScheduleBlocks() as SBlock[],
      academicLoad: this.local.loadAcademicLoad() as Record<string, SLoadVal>,
      logs: this.local.loadLogs() as SLog[],
    };
  }

  private hashContent(item: unknown): string {
    const s = stableStringify(item);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
  }

  private hashMapsFromRaw(raw: RawDatasets): SyncState['hashes'] {
    const arrH = <T extends Stamped>(items: T[], keyOf: (i: T) => string): Record<string, string> => {
      const m: Record<string, string> = {};
      for (const it of items) if (!it.deletedAt) m[keyOf(it)] = this.hashContent(it);
      return m;
    };
    const subjects: Record<string, string> = {};
    for (const s of raw.pensum) for (const sub of s.subjects) if (!sub.deletedAt) subjects[sub.code] = this.hashContent(sub);
    const academicLoad: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.academicLoad)) if (!v.deletedAt) academicLoad[k] = this.hashContent(v);
    return {
      professors: arrH(raw.professors, (p) => p.id),
      scheduleBlocks: arrH(raw.scheduleBlocks, (b) => b.id),
      subjects,
      academicLoad,
      logs: arrH(raw.logs, (l) => l.id),
    };
  }

  private syncStatePath(): string {
    return path.join(this.local.getDataDir(), 'sync-state.json');
  }
  private readSyncState(): SyncState | null {
    try {
      return JSON.parse(fs.readFileSync(this.syncStatePath(), 'utf-8')) as SyncState;
    } catch {
      return null;
    }
  }
  private writeSyncState(state: SyncState): void {
    try {
      fs.writeFileSync(this.syncStatePath(), JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
      log.error('[Cloud] No se pudo guardar sync-state:', e);
    }
  }

  getPendingDiff(): PendingDiff {
    const cur = this.hashMapsFromRaw(this.localRaw());
    const empty: Record<string, string> = {};
    const last = this.readSyncState()?.hashes ?? {
      professors: empty,
      scheduleBlocks: empty,
      subjects: empty,
      academicLoad: empty,
      logs: empty,
    };
    const datasets = {
      professors: diffKeyed(cur.professors, last.professors ?? {}),
      scheduleBlocks: diffKeyed(cur.scheduleBlocks, last.scheduleBlocks ?? {}),
      subjects: diffKeyed(cur.subjects, last.subjects ?? {}),
      academicLoad: diffKeyed(cur.academicLoad, last.academicLoad ?? {}),
      logs: diffKeyed(cur.logs, last.logs ?? {}),
    };
    const total = Object.values(datasets).reduce((a, d) => a + totalChanges(d), 0);
    const labels: [keyof typeof datasets, string][] = [
      ['scheduleBlocks', 'Horarios'],
      ['professors', 'Profesores'],
      ['subjects', 'Materias'],
      ['academicLoad', 'Carga'],
      ['logs', 'Registros'],
    ];
    const summary = labels
      .filter(([k]) => totalChanges(datasets[k]) > 0)
      .map(([k, label]) => `${label}: ${describeDiff(datasets[k])}`)
      .join(' · ');
    return { datasets, total, summary };
  }

  private device(): string {
    try {
      return os.hostname() || 'PC';
    } catch {
      return 'PC';
    }
  }

  private checkOnline(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const u = new URL('/rest/v1/', ENV.SUPABASE_URL);
        const req = https.request(
          {
            hostname: u.hostname,
            path: u.pathname,
            method: 'HEAD',
            headers: { apikey: ENV.SUPABASE_ANON_KEY },
            timeout: 3500,
          },
          (res) => {
            res.resume();
            resolve((res.statusCode ?? 0) < 500);
          },
        );
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.on('error', () => resolve(false));
        req.end();
      } catch {
        resolve(false);
      }
    });
  }

  async getSyncStatus(): Promise<SyncStatus> {
    const configured = this.isCloudEnabled();
    const state = this.readSyncState();
    const pendingCount = this.getPendingDiff().total;
    const online = configured ? await this.checkOnline() : false;
    return { configured, online, lastSyncAt: state?.lastSyncAt ?? null, pendingCount };
  }

  private liveSnapshot(): AppSnapshot {
    return {
      professors: this.loadProfessors(),
      pensum: this.loadPensum(),
      scheduleBlocks: this.loadScheduleBlocks(),
      academicLoad: this.loadAcademicLoad(),
      logs: this.loadLogs(),
    };
  }

  // ── Guardado automático a la nube (app_data, SIN historial) ──────────────
  /** Programa un guardado a Supabase tras un pequeño debounce (coalesce de ráfagas). */
  private scheduleAutoPush(): void {
    if (!this.client) return;
    if (this.autoPushTimer) clearTimeout(this.autoPushTimer);
    this.autoPushTimer = setTimeout(() => {
      this.autoPushTimer = null;
      void this.pushDataOnly();
    }, 2000);
  }

  /** Sube los 5 datasets a app_data (upsert). No toca app_versions. */
  async pushDataOnly(): Promise<{ ok: boolean; error?: string }> {
    if (!this.client) return { ok: false, error: 'Nube no configurada' };
    try {
      const rows = [
        { id: 'professors', data: this.local.loadProfessors() },
        { id: 'pensum', data: this.local.loadPensum() },
        { id: 'schedule-blocks', data: this.local.loadScheduleBlocks() },
        { id: 'academic-load', data: this.local.loadAcademicLoad() },
        { id: 'logs', data: this.local.loadLogs() },
      ].map((r) => ({ ...r, updated_at: this.now() }));
      const { error } = await this.client.from('app_data').upsert(rows);
      if (error) throw error;
      this.writeSyncState({ lastSyncAt: this.now(), hashes: this.hashMapsFromRaw(this.localRaw()) });
      log.info('[Cloud] Auto-guardado en la nube OK.');
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Error al guardar en la nube';
      log.error('[Cloud] Auto-guardado FALLÓ (se mantiene local):', error);
      return { ok: false, error };
    }
  }

  /** Fuerza un guardado pendiente inmediato (p. ej. al cerrar la app). */
  async flush(): Promise<void> {
    if (this.autoPushTimer) {
      clearTimeout(this.autoPushTimer);
      this.autoPushTimer = null;
    }
    if (this.client) await this.pushDataOnly();
  }

  // ── Subir (manual, con versión) ──────────────────────────────────────────
  async pushSession(label?: string): Promise<{ ok: boolean; summary: string; error?: string }> {
    if (!this.client) return { ok: false, summary: '', error: 'Nube no configurada' };
    try {
      const diff = this.getPendingDiff();
      // 1. Upsert de los 5 datasets crudos (con stamps/tombstones → preserva el merge).
      const rows = [
        { id: 'professors', data: this.local.loadProfessors() },
        { id: 'pensum', data: this.local.loadPensum() },
        { id: 'schedule-blocks', data: this.local.loadScheduleBlocks() },
        { id: 'academic-load', data: this.local.loadAcademicLoad() },
        { id: 'logs', data: this.local.loadLogs() },
      ].map((r) => ({ ...r, updated_at: this.now() }));
      const { error: upErr } = await this.client.from('app_data').upsert(rows);
      if (upErr) throw upErr;

      // 2. Guardar una versión (snapshot limpio = "commit").
      const { error: vErr } = await this.client.from('app_versions').insert({
        device: this.device(),
        label: label ?? null,
        summary: diff.summary || 'Sin cambios',
        snapshot: this.liveSnapshot(),
      });
      if (vErr) throw vErr;

      // 3. Podar historial a las últimas 50.
      await this.pruneVersions(50);

      // 4. Actualizar el estado sincronizado (pending vuelve a 0).
      this.writeSyncState({ lastSyncAt: this.now(), hashes: this.hashMapsFromRaw(this.localRaw()) });
      log.info('[Cloud] pushSession OK:', diff.summary || 'sin cambios');
      return { ok: true, summary: diff.summary };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Error al subir';
      log.error('[Cloud] pushSession FALLÓ:', error);
      return { ok: false, summary: '', error };
    }
  }

  private async pruneVersions(keep: number): Promise<void> {
    if (!this.client) return;
    const { data } = await this.client
      .from('app_versions')
      .select('id')
      .order('created_at', { ascending: false })
      .range(keep, keep + 500);
    const ids = (data ?? []).map((r) => (r as { id: number }).id);
    if (ids.length) await this.client.from('app_versions').delete().in('id', ids);
  }

  async getVersionHistory(): Promise<VersionMeta[]> {
    if (!this.client) return [];
    const { data, error } = await this.client
      .from('app_versions')
      .select('id, created_at, device, label, summary')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      log.error('[Cloud] getVersionHistory FALLÓ:', error.message);
      return [];
    }
    return (data ?? []) as VersionMeta[];
  }

  async restoreVersion(id: number): Promise<{ ok: boolean; error?: string }> {
    if (!this.client) return { ok: false, error: 'Nube no configurada' };
    try {
      const { data, error } = await this.client
        .from('app_versions')
        .select('snapshot')
        .eq('id', id)
        .single();
      if (error) throw error;
      const snap = (data as { snapshot: AppSnapshot }).snapshot;
      // Aplicar el snapshot al local (los save* sellan: todo a now, lo que falta se tombstonea).
      if (snap.professors) this.saveProfessors(snap.professors);
      if (snap.pensum) this.savePensum(snap.pensum);
      if (snap.scheduleBlocks) this.saveScheduleBlocks(snap.scheduleBlocks);
      if (snap.academicLoad) this.saveAcademicLoad(snap.academicLoad);
      if (snap.logs) this.saveLogs(snap.logs);
      // Subir como versión nueva (no borra las intermedias).
      const res = await this.pushSession(`Restauración de versión #${id}`);
      return { ok: res.ok, error: res.error };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Error al restaurar';
      log.error('[Cloud] restoreVersion FALLÓ:', error);
      return { ok: false, error };
    }
  }

  async pullNow(): Promise<{ ok: boolean; merged: string[] }> {
    return this.syncFromCloud();
  }

  // ── Recibir (pull + merge, automático al abrir) ──────────────────────────
  async syncFromCloud(): Promise<{ ok: boolean; merged: string[] }> {
    if (!this.client) return { ok: false, merged: [] };
    const done: string[] = [];
    try {
      const { data: rows, error } = await this.client.from('app_data').select('id, data');
      if (error) throw error;
      const remote = new Map<string, unknown>((rows ?? []).map((r) => [r.id as string, r.data]));

      const remoteRaw: RawDatasets = {
        professors: (remote.get('professors') as SProfessor[]) ?? [],
        pensum: (remote.get('pensum') as SSemester[]) ?? [],
        scheduleBlocks: (remote.get('schedule-blocks') as SBlock[]) ?? [],
        academicLoad: (remote.get('academic-load') as Record<string, SLoadVal>) ?? {},
        logs: (remote.get('logs') as SLog[]) ?? [],
      };

      this.local.saveProfessors(
        mergeRaw(this.local.loadProfessors() as SProfessor[], remoteRaw.professors, (p) => p.id),
      );
      done.push('professors');
      this.local.saveScheduleBlocks(
        mergeRaw(this.local.loadScheduleBlocks() as SBlock[], remoteRaw.scheduleBlocks, (b) => b.id),
      );
      done.push('schedule-blocks');
      this.local.saveLogs(
        mergeRaw(this.local.loadLogs() as SLog[], remoteRaw.logs, (l) => l.id),
      );
      done.push('logs');
      this.local.saveAcademicLoad(
        mergeMaps(
          this.local.loadAcademicLoad() as Record<string, SLoadVal>,
          remoteRaw.academicLoad,
          (v) => v.updatedAt ?? v.deletedAt ?? '',
        ),
      );
      done.push('academic-load');
      this.local.savePensum(
        this.mergePensum(this.local.loadPensum() as SSemester[], remoteRaw.pensum),
      );
      done.push('pensum');

      // El estado sincronizado refleja lo que hay EN LA NUBE → pending = cambios locales no subidos.
      this.writeSyncState({ lastSyncAt: this.now(), hashes: this.hashMapsFromRaw(remoteRaw) });
      log.info('[Cloud] syncFromCloud OK:', done.join(', '));
      return { ok: true, merged: done };
    } catch (e) {
      log.error('[Cloud] syncFromCloud FALLÓ (se mantiene local):', e);
      return { ok: false, merged: done };
    }
  }
}
