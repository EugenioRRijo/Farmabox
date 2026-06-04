/**
 * CloudStorageService — Almacenamiento offline-first con sync a Supabase.
 *
 * Modelo automático (sin UI de sincronización):
 *   - Lecturas/escrituras inmediatas a local (cero latencia, funciona sin internet).
 *   - Cada save SELLA los ítems (updatedAt / deletedAt), guarda local y AGENDA un
 *     auto-guardado a Supabase (debounced). Ver pushDataOnly()/flush().
 *   - RECIBIR (pull + merge por fila, newest-wins) es automático al abrir: syncFromCloud().
 *
 * La nube usa un ESQUEMA RELACIONAL NORMALIZADO (ver docs/supabase-schema.sql):
 *   professors, subjects, professor_subjects (M:N), academic_load, schedule_blocks, logs.
 * Cada tabla tiene updated_at / deleted_at (borrado lógico) → el merge por ítem
 * (sync/merge.ts, con tests) evita perder datos al combinar lo de varias PCs.
 *
 * Implementa IStorageService → sustituye a StorageService en el grafo de servicios.
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

interface RawDatasets {
  professors: SProfessor[];
  pensum: SSemester[];
  scheduleBlocks: SBlock[];
  academicLoad: Record<string, SLoadVal>;
  logs: SLog[];
}

// ── Filas tal como vienen/van a Postgres ───────────────────────────────────
interface ProfRow {
  id: string;
  full_name: string;
  title: string;
  email: string | null;
  cedula: string | null;
  type: string;
  updated_at: string | null;
  deleted_at: string | null;
}
interface SubjRow {
  code: string;
  name: string;
  credits: number;
  has_lab: boolean;
  hours_theory: number;
  hours_lab: number;
  semester: number;
  lab_number: string | null;
  prerequisites: string[] | null;
  updated_at: string | null;
  deleted_at: string | null;
}
interface LinkRow {
  professor_id: string;
  subject_code: string;
}
interface LoadRow {
  subject_code: string;
  professor_id: string;
  role: string;
  updated_at: string | null;
}
interface BlockRow {
  id: string;
  subject_code: string | null;
  day: number;
  start_hour: number;
  duration: number;
  color: string | null;
  type: string | null;
  professor_id: string | null;
  section: string | null;
  lab_group_id: string | null;
  updated_at: string | null;
  deleted_at: string | null;
}
interface LogRow {
  id: string;
  action: string;
  details: string | null;
  timestamp: string | null;
  updated_at: string | null;
  deleted_at: string | null;
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

  // ── Persistencia (offline-first; agenda auto-guardado a la nube) ─────────
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

  private localRaw(): RawDatasets {
    return {
      professors: this.local.loadProfessors() as SProfessor[],
      pensum: this.local.loadPensum() as SSemester[],
      scheduleBlocks: this.local.loadScheduleBlocks() as SBlock[],
      academicLoad: this.local.loadAcademicLoad() as Record<string, SLoadVal>,
      logs: this.local.loadLogs() as SLog[],
    };
  }

  // ── Guardado automático a la nube (tablas relacionales) ──────────────────
  /** Programa un guardado a Supabase tras un pequeño debounce (coalesce de ráfagas). */
  private scheduleAutoPush(): void {
    if (!this.client) return;
    if (this.autoPushTimer) clearTimeout(this.autoPushTimer);
    this.autoPushTimer = setTimeout(() => {
      this.autoPushTimer = null;
      void this.pushDataOnly();
    }, 2000);
  }

  /** Fuerza un guardado pendiente inmediato (p. ej. al cerrar la app). */
  async flush(): Promise<void> {
    if (this.autoPushTimer) {
      clearTimeout(this.autoPushTimer);
      this.autoPushTimer = null;
    }
    if (this.client) await this.pushDataOnly();
  }

  /** Escribe el estado local completo (incluidos tombstones) a las tablas relacionales. */
  async pushDataOnly(): Promise<{ ok: boolean; error?: string }> {
    if (!this.client) return { ok: false, error: 'Nube no configurada' };
    try {
      const raw = this.localRaw();
      const profs = raw.professors;
      const subsFlat: SSubject[] = raw.pensum.flatMap((s) =>
        s.subjects.map((sub) => ({ ...sub, _sem: s.number })),
      );
      const allProfIds = new Set(profs.map((p) => p.id));
      const allSubjCodes = new Set(subsFlat.map((s) => s.code));

      // 1. Profesores (incluye tombstoned, con deleted_at).
      const profRows: ProfRow[] = profs.map((p) => ({
        id: p.id,
        full_name: p.fullName,
        title: p.title,
        email: p.email ?? null,
        cedula: p.cedula ?? null,
        type: p.type,
        updated_at: p.updatedAt ?? this.now(),
        deleted_at: p.deletedAt ?? null,
      }));
      if (profRows.length) {
        const { error } = await this.client.from('professors').upsert(profRows);
        if (error) throw error;
      }

      // 2. Materias (incluye tombstoned).
      const subjRows: SubjRow[] = subsFlat.map((s) => ({
        code: s.code,
        name: s.name,
        credits: s.credits ?? 0,
        has_lab: !!s.hasLab,
        hours_theory: s.hoursTheory ?? 0,
        hours_lab: s.hoursLab ?? 0,
        semester: s._sem ?? 1,
        lab_number: s.labNumber ?? null,
        prerequisites: s.prerequisites ?? [],
        updated_at: s.updatedAt ?? this.now(),
        deleted_at: s.deletedAt ?? null,
      }));
      if (subjRows.length) {
        const { error } = await this.client.from('subjects').upsert(subjRows);
        if (error) throw error;
      }

      // 3. professor_subjects: reconstruir desde la unión de ambos lados (solo vivos).
      const linkSet = new Set<string>();
      const links: LinkRow[] = [];
      const addLink = (pid: string, code: string): void => {
        if (!allProfIds.has(pid) || !allSubjCodes.has(code)) return; // respeta las FKs
        const key = `${pid} ${code}`;
        if (linkSet.has(key)) return;
        linkSet.add(key);
        links.push({ professor_id: pid, subject_code: code });
      };
      for (const p of this.live(profs)) for (const code of p.subjects ?? []) addLink(p.id, code);
      for (const s of subsFlat) {
        if (s.deletedAt) continue;
        for (const pid of s.professors ?? []) addLink(pid, s.code);
      }
      await this.client.from('professor_subjects').delete().not('professor_id', 'is', null);
      if (links.length) {
        const { error } = await this.client.from('professor_subjects').insert(links);
        if (error) throw error;
      }

      // 4. academic_load: reemplazar por las asignaciones vivas.
      const loadInsert: LoadRow[] = [];
      for (const [code, v] of Object.entries(raw.academicLoad)) {
        if (v.deletedAt || !allSubjCodes.has(code)) continue;
        const ts = v.updatedAt ?? this.now();
        for (const pid of v.theory ?? [])
          if (allProfIds.has(pid)) loadInsert.push({ subject_code: code, professor_id: pid, role: 'theory', updated_at: ts });
        for (const pid of v.lab ?? [])
          if (allProfIds.has(pid)) loadInsert.push({ subject_code: code, professor_id: pid, role: 'lab', updated_at: ts });
      }
      await this.client.from('academic_load').delete().not('subject_code', 'is', null);
      if (loadInsert.length) {
        const { error } = await this.client.from('academic_load').insert(loadInsert);
        if (error) throw error;
      }

      // 5. Bloques de horario (incluye tombstoned).
      const blockRows: BlockRow[] = raw.scheduleBlocks.map((b) => ({
        id: b.id,
        subject_code: b.subjectCode ?? null,
        day: b.day,
        start_hour: b.startHour,
        duration: b.duration,
        color: b.color ?? null,
        type: b.type ?? null,
        professor_id: b.professorId ?? null,
        section: b.section ?? null,
        lab_group_id: b.labGroupId ?? null,
        updated_at: b.updatedAt ?? this.now(),
        deleted_at: b.deletedAt ?? null,
      }));
      if (blockRows.length) {
        const { error } = await this.client.from('schedule_blocks').upsert(blockRows);
        if (error) throw error;
      }

      // 6. Logs (incluye tombstoned).
      const logRows: LogRow[] = raw.logs.map((l) => ({
        id: l.id,
        action: l.action,
        details: l.details ?? null,
        timestamp: l.timestamp ?? this.now(),
        updated_at: l.updatedAt ?? this.now(),
        deleted_at: l.deletedAt ?? null,
      }));
      if (logRows.length) {
        const { error } = await this.client.from('logs').upsert(logRows);
        if (error) throw error;
      }

      log.info('[Cloud] Auto-guardado en la nube OK.');
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Error al guardar en la nube';
      log.error('[Cloud] Auto-guardado FALLÓ (se mantiene local):', error);
      return { ok: false, error };
    }
  }

  // ── Recibir (pull + merge por fila, automático al abrir) ─────────────────
  async syncFromCloud(): Promise<{ ok: boolean; merged: string[] }> {
    if (!this.client) return { ok: false, merged: [] };
    const done: string[] = [];
    try {
      const remote = await this.cloudReadAll();

      this.local.saveProfessors(
        mergeRaw(this.local.loadProfessors() as SProfessor[], remote.professors, (p) => p.id),
      );
      done.push('professors');
      this.local.saveScheduleBlocks(
        mergeRaw(this.local.loadScheduleBlocks() as SBlock[], remote.scheduleBlocks, (b) => b.id),
      );
      done.push('schedule-blocks');
      this.local.saveLogs(mergeRaw(this.local.loadLogs() as SLog[], remote.logs, (l) => l.id));
      done.push('logs');
      this.local.saveAcademicLoad(
        mergeMaps(
          this.local.loadAcademicLoad() as Record<string, SLoadVal>,
          remote.academicLoad,
          (v) => v.updatedAt ?? v.deletedAt ?? '',
        ),
      );
      done.push('academic-load');
      this.local.savePensum(this.mergePensum(this.local.loadPensum() as SSemester[], remote.pensum));
      done.push('pensum');

      log.info('[Cloud] syncFromCloud OK:', done.join(', '));
      return { ok: true, merged: done };
    } catch (e) {
      log.error('[Cloud] syncFromCloud FALLÓ (se mantiene local):', e);
      return { ok: false, merged: done };
    }
  }

  /** Lee todas las tablas relacionales y reconstruye los datasets sellados. */
  private async cloudReadAll(): Promise<RawDatasets> {
    if (!this.client) throw new Error('Nube no configurada');
    const [profsRes, subjsRes, linksRes, loadRes, blocksRes, logsRes] = await Promise.all([
      this.client.from('professors').select('*'),
      this.client.from('subjects').select('*'),
      this.client.from('professor_subjects').select('*'),
      this.client.from('academic_load').select('*'),
      this.client.from('schedule_blocks').select('*'),
      this.client.from('logs').select('*'),
    ]);
    for (const r of [profsRes, subjsRes, linksRes, loadRes, blocksRes, logsRes]) {
      if (r.error) throw r.error;
    }
    const links = (linksRes.data ?? []) as LinkRow[];
    const subjectsByProf = new Map<string, string[]>();
    const profsBySubject = new Map<string, string[]>();
    for (const l of links) {
      if (!subjectsByProf.has(l.professor_id)) subjectsByProf.set(l.professor_id, []);
      subjectsByProf.get(l.professor_id)!.push(l.subject_code);
      if (!profsBySubject.has(l.subject_code)) profsBySubject.set(l.subject_code, []);
      profsBySubject.get(l.subject_code)!.push(l.professor_id);
    }

    const professors: SProfessor[] = ((profsRes.data ?? []) as ProfRow[]).map((r) => ({
      id: r.id,
      fullName: r.full_name,
      title: r.title as Professor['title'],
      email: r.email ?? undefined,
      cedula: r.cedula ?? undefined,
      type: r.type as Professor['type'],
      subjects: subjectsByProf.get(r.id) ?? [],
      updatedAt: r.updated_at ?? undefined,
      deletedAt: r.deleted_at ?? undefined,
    }));

    const bySem = new Map<number, SSubject[]>();
    for (const r of (subjsRes.data ?? []) as SubjRow[]) {
      const sub: SSubject = {
        code: r.code,
        name: r.name,
        credits: r.credits ?? 0,
        hasLab: !!r.has_lab,
        hoursTheory: r.hours_theory ?? 0,
        hoursLab: r.hours_lab ?? 0,
        prerequisites: r.prerequisites ?? [],
        professors: profsBySubject.get(r.code) ?? [],
        labNumber: r.lab_number ?? undefined,
        updatedAt: r.updated_at ?? undefined,
        deletedAt: r.deleted_at ?? undefined,
      };
      const n = r.semester ?? 1;
      if (!bySem.has(n)) bySem.set(n, []);
      bySem.get(n)!.push(sub);
    }
    const pensum: SSemester[] = [...bySem.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([number, subjects]) => ({ number, subjects }));

    const academicLoad: Record<string, SLoadVal> = {};
    for (const r of (loadRes.data ?? []) as LoadRow[]) {
      if (!academicLoad[r.subject_code]) academicLoad[r.subject_code] = { theory: [], lab: [] };
      const entry = academicLoad[r.subject_code];
      if (r.role === 'lab') entry.lab!.push(r.professor_id);
      else entry.theory!.push(r.professor_id);
      if (r.updated_at && (!entry.updatedAt || r.updated_at > entry.updatedAt)) entry.updatedAt = r.updated_at;
    }

    const scheduleBlocks: SBlock[] = ((blocksRes.data ?? []) as BlockRow[]).map((r) => ({
      id: r.id,
      subjectCode: r.subject_code ?? '',
      day: r.day,
      startHour: r.start_hour,
      duration: r.duration,
      color: r.color ?? '',
      type: (r.type as SBlock['type']) ?? undefined,
      professorId: r.professor_id ?? undefined,
      section: r.section ?? undefined,
      labGroupId: r.lab_group_id ?? undefined,
      updatedAt: r.updated_at ?? undefined,
      deletedAt: r.deleted_at ?? undefined,
    }));

    const logs: SLog[] = ((logsRes.data ?? []) as LogRow[]).map((r) => ({
      id: r.id,
      action: r.action,
      details: r.details ?? '',
      timestamp: r.timestamp ?? this.now(),
      updatedAt: r.updated_at ?? undefined,
      deletedAt: r.deleted_at ?? undefined,
    }));

    return { professors, pensum, scheduleBlocks, academicLoad, logs };
  }
}
