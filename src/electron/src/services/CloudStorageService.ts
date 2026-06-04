/**
 * CloudStorageService — Backend de sincronización contra Supabase.
 *
 * Extiende SyncStorageBase (sellado + merge offline-first) y solo define el
 * transporte: lee/escribe las tablas relacionales normalizadas
 * (ver docs/supabase-schema.sql): professors, subjects, professor_subjects (M:N),
 * academic_load, schedule_blocks, logs. Cada tabla con updated_at / deleted_at.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import log from 'electron-log';
import { ENV } from '../config/env';
import {
  SyncStorageBase,
  type RawDatasets,
  type SProfessor,
  type SBlock,
  type SLog,
  type SSubject,
  type SLoadVal,
  type SSemester,
} from './SyncStorageBase';
import type { IStorageService } from './IStorageService';
import type { Professor } from '@scheduler/shared';

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

export class CloudStorageService extends SyncStorageBase {
  private client: SupabaseClient | null = null;

  constructor(local: IStorageService) {
    super(local);
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

  isRemoteEnabled(): boolean {
    return !!this.client;
  }

  // ── Subir: estado local → tablas relacionales ────────────────────────────
  protected async pushRemote(raw: RawDatasets): Promise<void> {
    if (!this.client) throw new Error('Nube no configurada');
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
      const key = `${pid} ${code}`;
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
  }

  // ── Bajar: tablas relacionales → datasets sellados ───────────────────────
  protected async pullRemote(): Promise<RawDatasets> {
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
