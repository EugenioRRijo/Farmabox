/**
 * CloudStorageService — Proxy de almacenamiento offline-first con sync a Supabase.
 *
 * Envuelve un IStorageService local (JSON en disco):
 *   - Lecturas/escrituras inmediatas a local (cero latencia, funciona sin internet).
 *   - Sella cada ítem con `updatedAt` (y `deletedAt` para borrados) al guardar.
 *   - Push "fire-and-forget" a la nube tras cada guardado.
 *   - syncFromCloud(): pull + MERGE POR ÍTEM (newest-wins) + guardado + push.
 *
 * El merge por ítem (no por dataset completo) elimina la pérdida de datos: si dos
 * PC editan offline, sus cambios se UNEN. Ver sync/merge.ts (con tests).
 *
 * Implementa IStorageService → es sustituible donde antes iba StorageService.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import log from 'electron-log';
import { ENV } from '../config/env';
import { mergeRaw, mergeMaps, type Stamped } from '../sync/merge';
import type { IStorageService } from './IStorageService';
import type { Professor, Semester, PensumSubject } from '@scheduler/shared';
import type { AcademicLoad, ScheduleBlockData, LogEntry } from '../types';

type SProfessor = Professor & Stamped;
type SBlock = ScheduleBlockData & Stamped;
type SLog = LogEntry & Stamped;
type SSubject = PensumSubject & Stamped & { _sem?: number };
type SLoadVal = AcademicLoad[string] & Stamped;
type SSemester = { number: number; subjects: SSubject[] };

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

  /** Push asíncrono a la nube (no bloquea la UI). */
  private push(id: string, data: unknown): void {
    if (!this.client) return;
    void this.client
      .from('app_data')
      .upsert({ id, data, updated_at: this.now() })
      .then(({ error }) => {
        if (error) log.error(`[Cloud] push ${id} FAILED:`, error.message);
        else log.info(`[Cloud] push ${id} OK`);
      });
  }

  // ── Professors ───────────────────────────────────────────────────────────
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
    this.push('professors', stamped);
  }

  // ── Schedule blocks ──────────────────────────────────────────────────────
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
    this.push('schedule-blocks', stamped);
  }

  // ── Logs (append-only, unión por id) ─────────────────────────────────────
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
    this.push('logs', stamped);
  }

  // ── Academic load (mapa por código de materia) ───────────────────────────
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
    this.push('academic-load', out);
  }

  // ── Pensum (merge a nivel de materia, preservando semestres) ──────────────
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
    this.push('pensum', stamped);
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

  // ── Sincronización (pull + merge + guardado + push) ───────────────────────
  async syncFromCloud(): Promise<{ ok: boolean; merged: string[] }> {
    if (!this.client) return { ok: false, merged: [] };
    const done: string[] = [];
    try {
      const { data: rows, error } = await this.client.from('app_data').select('id, data');
      if (error) throw error;
      const remote = new Map<string, unknown>((rows ?? []).map((r) => [r.id as string, r.data]));

      {
        const merged = mergeRaw(
          this.local.loadProfessors() as SProfessor[],
          (remote.get('professors') as SProfessor[]) ?? [],
          (p) => p.id,
        );
        this.local.saveProfessors(merged);
        this.push('professors', merged);
        done.push('professors');
      }
      {
        const merged = mergeRaw(
          this.local.loadScheduleBlocks() as SBlock[],
          (remote.get('schedule-blocks') as SBlock[]) ?? [],
          (b) => b.id,
        );
        this.local.saveScheduleBlocks(merged);
        this.push('schedule-blocks', merged);
        done.push('schedule-blocks');
      }
      {
        const merged = mergeRaw(
          this.local.loadLogs() as SLog[],
          (remote.get('logs') as SLog[]) ?? [],
          (l) => l.id,
        );
        this.local.saveLogs(merged);
        this.push('logs', merged);
        done.push('logs');
      }
      {
        const merged = mergeMaps(
          this.local.loadAcademicLoad() as Record<string, SLoadVal>,
          (remote.get('academic-load') as Record<string, SLoadVal>) ?? {},
          (v) => v.updatedAt ?? v.deletedAt ?? '',
        );
        this.local.saveAcademicLoad(merged);
        this.push('academic-load', merged);
        done.push('academic-load');
      }
      {
        const merged = this.mergePensum(
          this.local.loadPensum() as SSemester[],
          (remote.get('pensum') as SSemester[]) ?? [],
        );
        this.local.savePensum(merged);
        this.push('pensum', merged);
        done.push('pensum');
      }

      log.info('[Cloud] syncFromCloud OK:', done.join(', '));
      return { ok: true, merged: done };
    } catch (e) {
      log.error('[Cloud] syncFromCloud FALLÓ (se mantiene local):', e);
      return { ok: false, merged: done };
    }
  }
}
