/**
 * supabaseWeb — Capa de datos del modo WEB, directo a las tablas relacionales de
 * Supabase (las MISMAS que usa el .exe). Reemplaza al backend Express.
 *
 * Mapeo snake_case ↔ camelCase + stamping (updated_at / deleted_at) para que las
 * escrituras de la web sean consistentes con el merge offline-first del escritorio.
 */
import { requireSupabase, supabase } from './supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  Professor,
  PensumSubject,
  Semester,
  AcademicLoad,
  ScheduleBlockData,
  LogEntry,
  BackupData,
} from './BackendService';
import { findProfessorIdByIdentity } from '../../../shared/src/logic/professorIdentity';
import {
  diffByFingerprint,
  diffKeySets,
  blockFingerprint,
} from '../../../shared/src/logic/webSetDiff';
import { fetchAllPages } from '../../../shared/src/logic/paginate';

const now = (): string => new Date().toISOString();

/** Fila cruda de Supabase. El proyecto no genera tipos de la base, así que las
 *  columnas se leen sueltas — es lo mismo que devolvía `select('*')` antes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawRow = Record<string, any>;

/**
 * Lectura COMPLETA de una tabla, paginada. PostgREST corta en 1000 filas y un
 * `select('*')` a secas devolvía una nube truncada sin avisar (el escritorio ya lo
 * cerró con `CloudStorageService.pullAll`; esto es lo mismo para el camino web).
 * `orderCols` tiene que ser determinista o `.range()` repite o saltea filas.
 */
async function selectAll<T = RawRow>(
  table: string,
  orderCols: string[],
  opts: { liveOnly?: boolean; columns?: string } = {}
): Promise<T[]> {
  return fetchAllPages<T>(async (from, to) => {
    let q = requireSupabase()
      .from(table)
      .select(opts.columns ?? '*');
    if (opts.liveOnly) q = q.is('deleted_at', null);
    for (const col of orderCols) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, to);
    if (error) throw error;
    return (data ?? []) as T[];
  });
}

// ── Nombre del equipo en modo WEB (atribución por equipo, spec 2026-08-13) ──
// La web firma sus escrituras con un nombre guardado en localStorage; en el .exe
// esto NO se usa (allá firma el main con la config deviceName / os.hostname()).
const DEVICE_NAME_KEY = 'farmabox.deviceName';
const DEVICE_NAME_DEFAULT = 'Navegador';

export function getWebDeviceName(): string {
  try {
    return localStorage.getItem(DEVICE_NAME_KEY)?.trim() || DEVICE_NAME_DEFAULT;
  } catch {
    return DEVICE_NAME_DEFAULT;
  }
}

/** Guarda el nombre (trim, máx. 40 chars; vacío → vuelve al default). Devuelve el nombre final. */
export function setWebDeviceName(name: string): string {
  const trimmed = name.trim().slice(0, 40);
  try {
    if (trimmed) localStorage.setItem(DEVICE_NAME_KEY, trimmed);
    else localStorage.removeItem(DEVICE_NAME_KEY);
  } catch {
    /* almacenamiento no disponible: no se persiste (las firmas usarán el default) */
  }
  return trimmed || DEVICE_NAME_DEFAULT;
}

// ── Estado "visto por este cliente" (anti-pisado del guardado por set) ───────
// El guardado web recibe el SET completo, pero re-sellar todo y tombstonear lo
// ausente pisa el trabajo de otras PCs. Recordamos lo que este cliente vio en su
// último pull y guardamos solo el DIFF (ver shared/logic/webSetDiff).
const seenBlocks: Record<string, string> = {}; // id → fingerprint de contenido
const seenLoadKeys = new Set<string>(); // "subject_code professor_id role"

// ── Realtime (#7): cambios de otras PCs en vivo (modo web) ──────────────────
// Suscribe a las tablas sincronizadas y llama `onChange` cuando alguien más edita.
// Requiere habilitar la publicación supabase_realtime en la base (ver
// docs/migracion-2.3-concurrencia.sql). Si no está habilitada, simplemente no
// llegan eventos y el poll de 30 s sigue como red de seguridad.
let realtimeChannel: RealtimeChannel | null = null;
export function subscribeRealtime(onChange: () => void): () => void {
  if (!supabase || realtimeChannel) return () => {};
  // `logs`, `professor_subjects` y `academic_load` quedan FUERA del tiempo real:
  // los logs son historial (nadie los mira en vivo) y los vinculos cambian junto
  // con profesores/materias, que si estan suscritas — notificar las tres cosas por
  // separado triplicaba los mensajes del mismo evento. Siguen llegando por el pull.
  const tables = ['professors', 'subjects', 'schedule_blocks'];
  const ch = supabase.channel('farmabox-web-sync');
  for (const table of tables) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange());
  }
  ch.subscribe();
  realtimeChannel = ch;
  return () => {
    if (realtimeChannel && supabase) {
      void supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  };
}

// La columna `profession` es nueva. Si la base todavía no la tiene, la omitimos en
// las escrituras para no romper el guardado (se proba una vez y se cachea).
let professionSupported: boolean | null = null;
async function stripProf(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (professionSupported === null) {
    const { error } = await requireSupabase().from('professors').select('profession').limit(1);
    professionSupported = !error;
  }
  if (professionSupported) return rows;
  return rows.map((r) => {
    const rest = { ...r };
    delete rest.profession;
    return rest;
  });
}

// schedule_blocks.semester también es columna nueva (tabla semesters + FK).
let blockSemesterSupported: boolean | null = null;
async function stripBlockSemester(
  rows: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (blockSemesterSupported === null) {
    const { error } = await requireSupabase().from('schedule_blocks').select('semester').limit(1);
    blockSemesterSupported = !error;
  }
  if (blockSemesterSupported) return rows;
  return rows.map((r) => {
    const rest = { ...r };
    delete rest.semester;
    return rest;
  });
}

// schedule_blocks.aula: salón por bloque (columna nueva). Se omite si la base no la tiene.
let blockAulaSupported: boolean | null = null;
async function stripBlockAula(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (blockAulaSupported === null) {
    const { error } = await requireSupabase().from('schedule_blocks').select('aula').limit(1);
    blockAulaSupported = !error;
  }
  if (blockAulaSupported) return rows;
  return rows.map((r) => {
    const rest = { ...r };
    delete rest.aula;
    return rest;
  });
}

// updated_by (atribución por equipo, migración 2.8) es columna nueva en varias tablas.
// Helper genérico: se prueba UNA vez por tabla y se cachea; sin migración se omite la
// columna (degradación: todo sigue funcionando, solo sin atribución).
const updatedByPorTabla: Record<string, boolean> = {};
async function tableHasUpdatedBy(table: string): Promise<boolean> {
  if (!(table in updatedByPorTabla)) {
    const { error } = await requireSupabase().from(table).select('updated_by').limit(1);
    updatedByPorTabla[table] = !error;
  }
  return updatedByPorTabla[table];
}
/** Quita `updated_by` de las filas si la tabla aún no tiene la columna. */
async function stripUpdatedBy(
  table: string,
  rows: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (await tableHasUpdatedBy(table)) return rows;
  return rows.map((r) => {
    const rest = { ...r };
    delete rest.updated_by;
    return rest;
  });
}

// subjects.aula es columna nueva (aula de teoría). Si la base todavía no la tiene, se
// omite en las escrituras para no romper el guardado (se prueba una vez y se cachea).
let subjectAulaSupported: boolean | null = null;
async function stripAula(obj: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (subjectAulaSupported === null) {
    const { error } = await requireSupabase().from('subjects').select('aula').limit(1);
    subjectAulaSupported = !error;
  }
  if (subjectAulaSupported) return obj;
  const rest = { ...obj };
  delete rest.aula;
  return rest;
}

// ── Helpers de lectura ──────────────────────────────────────────────────────
async function fetchLinks(): Promise<{
  byProf: Map<string, string[]>;
  bySubject: Map<string, string[]>;
}> {
  const data = await selectAll<{ professor_id: string; subject_code: string }>(
    'professor_subjects',
    ['subject_code', 'professor_id'],
    { columns: 'professor_id,subject_code' }
  );
  const byProf = new Map<string, string[]>();
  const bySubject = new Map<string, string[]>();
  for (const l of data ?? []) {
    if (!byProf.has(l.professor_id)) byProf.set(l.professor_id, []);
    byProf.get(l.professor_id)!.push(l.subject_code);
    if (!bySubject.has(l.subject_code)) bySubject.set(l.subject_code, []);
    bySubject.get(l.subject_code)!.push(l.professor_id);
  }
  return { byProf, bySubject };
}

// ── Profesores ──────────────────────────────────────────────────────────────
export async function getProfessors(): Promise<Professor[]> {
  const data = await selectAll('professors', ['id'], { liveOnly: true });
  const { byProf } = await fetchLinks();
  return (data ?? []).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    title: r.title,
    email: r.email ?? undefined,
    cedula: r.cedula ?? undefined,
    profession: r.profession ?? undefined,
    subjects: byProf.get(r.id) ?? [],
    type: r.type,
  })) as Professor[];
}

function profRow(p: Professor): Record<string, unknown> {
  return {
    id: p.id,
    full_name: p.fullName,
    title: p.title,
    email: p.email ?? null,
    cedula: p.cedula ?? null,
    profession: p.profession ?? null,
    type: p.type,
    updated_at: now(),
    updated_by: getWebDeviceName(), // firma del equipo: viaja con el sello (regla de oro)
    deleted_at: null,
  };
}

async function setProfessorLinks(profId: string, subjectCodes: string[]): Promise<void> {
  const sb = requireSupabase();
  const { error: delError } = await sb
    .from('professor_subjects')
    .delete()
    .eq('professor_id', profId);
  if (delError) throw delError; // no tragar el fallo: los enlaces viejos seguirían vivos
  if (subjectCodes.length) {
    const rows = subjectCodes.map((c) => ({ professor_id: profId, subject_code: c }));
    const { error } = await sb.from('professor_subjects').insert(rows);
    if (error) throw error;
  }
}

export async function createProfessor(data: Omit<Professor, 'id'>): Promise<Professor> {
  const sb = requireSupabase();
  // Fusionar por identidad (cédula → nombre): si ya existe, actualiza en vez de duplicar.
  const existing = await getProfessors();
  const matchId = findProfessorIdByIdentity(existing, data);
  const prev = matchId ? existing.find((e) => e.id === matchId) : undefined;
  const prof: Professor = {
    id: matchId ?? `prof-${Date.now()}`,
    fullName: data.fullName ?? prev?.fullName ?? 'Sin nombre',
    title: data.title ?? prev?.title ?? 'Prof.',
    email: data.email ?? prev?.email,
    cedula: data.cedula ?? prev?.cedula,
    profession: data.profession ?? prev?.profession,
    subjects: data.subjects ?? prev?.subjects ?? [],
    type: data.type ?? prev?.type ?? 'both',
  };
  const { error } = await sb
    .from('professors')
    .upsert(await stripProf(await stripUpdatedBy('professors', [profRow(prof)])));
  if (error) throw error;
  await setProfessorLinks(prof.id, prof.subjects ?? []);
  return prof;
}

export async function updateProfessor(id: string, data: Partial<Professor>): Promise<Professor> {
  const sb = requireSupabase();
  // PATCH parcial: solo los campos enviados (no pisar profesión/cédula/etc. existentes).
  const patch: Record<string, unknown> = { updated_at: now(), updated_by: getWebDeviceName() };
  if (data.fullName !== undefined) patch.full_name = data.fullName;
  if (data.title !== undefined) patch.title = data.title;
  if (data.email !== undefined) patch.email = data.email ?? null;
  if (data.cedula !== undefined) patch.cedula = data.cedula ?? null;
  if (data.profession !== undefined) patch.profession = data.profession ?? null;
  if (data.type !== undefined) patch.type = data.type;
  const safePatch = (await stripProf(await stripUpdatedBy('professors', [patch])))[0];
  const { error } = await sb.from('professors').update(safePatch).eq('id', id);
  if (error) throw error;
  if (data.subjects) await setProfessorLinks(id, data.subjects);
  return { ...(data as Professor), id };
}

export async function deleteProfessor(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error: linksError } = await sb.from('professor_subjects').delete().eq('professor_id', id);
  if (linksError) throw linksError;
  const { error: loadError } = await sb.from('academic_load').delete().eq('professor_id', id);
  if (loadError) throw loadError;
  // Liberar las clases: el bloque se conserva pero queda sin profesor (evita
  // bloques "fantasma" que disparan un falso choque al reconstruir el horario).
  // Ambas escrituras re-sellan → van firmadas con el equipo (si hay migración 2.8).
  const freeBlocks: Record<string, unknown> = { professor_id: null, updated_at: now() };
  if (await tableHasUpdatedBy('schedule_blocks')) freeBlocks.updated_by = getWebDeviceName();
  const { error: blocksError } = await sb
    .from('schedule_blocks')
    .update(freeBlocks)
    .eq('professor_id', id);
  if (blocksError) throw blocksError;
  const tomb: Record<string, unknown> = { deleted_at: now() };
  if (await tableHasUpdatedBy('professors')) tomb.updated_by = getWebDeviceName();
  const { error } = await sb.from('professors').update(tomb).eq('id', id);
  if (error) throw error;
}

/** "Vaciar lista": borra enlaces + carga académica y marca como borrados (tombstone)
 *  a TODOS los profesores vivos. Antes sembraba 45 profesores hardcodeados. */
export async function resetProfessors(): Promise<Professor[]> {
  const sb = requireSupabase();
  const { error: linksError } = await sb
    .from('professor_subjects')
    .delete()
    .not('professor_id', 'is', null);
  if (linksError) throw linksError;
  const { error: loadError } = await sb
    .from('academic_load')
    .delete()
    .not('professor_id', 'is', null);
  if (loadError) throw loadError;
  const tomb: Record<string, unknown> = { deleted_at: now() };
  if (await tableHasUpdatedBy('professors')) tomb.updated_by = getWebDeviceName();
  const { error } = await sb.from('professors').update(tomb).is('deleted_at', null);
  if (error) throw error;
  return [];
}

export async function bulkUpsertProfessors(incoming: Partial<Professor>[]): Promise<Professor[]> {
  const sb = requireSupabase();
  // FUSIONA por identidad (cédula → nombre) contra la lista actual + la que va creciendo,
  // así re-importar la misma lista NO duplica (bug histórico de los `prof-<timestamp>`).
  const acc: Professor[] = await getProfessors();
  const profs: Professor[] = [];
  let seq = 0;
  for (const raw of incoming) {
    const matchId = findProfessorIdByIdentity(acc, raw);
    const prev = matchId ? acc.find((e) => e.id === matchId) : undefined;
    const prof: Professor = {
      id:
        matchId ??
        (raw.id && String(raw.id).trim() ? String(raw.id).trim() : `prof-${Date.now()}-${seq++}`),
      fullName: raw.fullName ?? prev?.fullName ?? 'Sin nombre',
      title: raw.title ?? prev?.title ?? 'Prof.',
      email: raw.email ?? prev?.email,
      cedula: raw.cedula ?? prev?.cedula,
      profession: raw.profession ?? prev?.profession,
      subjects: raw.subjects ?? prev?.subjects ?? [],
      type: raw.type ?? prev?.type ?? 'both',
    };
    const ai = acc.findIndex((e) => e.id === prof.id);
    if (ai >= 0) acc[ai] = prof;
    else acc.push(prof);
    profs.push(prof);
  }
  if (profs.length) {
    const rows = await stripProf(
      await stripUpdatedBy(
        'professors',
        profs.map((p) => profRow(p))
      )
    );
    const { error } = await sb.from('professors').upsert(rows);
    if (error) throw error;
    for (const p of profs) await setProfessorLinks(p.id, p.subjects ?? []);
  }
  return profs;
}

// ── Materias / Pensum ───────────────────────────────────────────────────────
export async function getSubjects(): Promise<Semester[]> {
  const data = await selectAll('subjects', ['code'], { liveOnly: true });
  const { bySubject } = await fetchLinks();
  const bySem = new Map<number, PensumSubject[]>();
  for (const r of data ?? []) {
    const sub: PensumSubject = {
      code: r.code,
      name: r.name,
      credits: r.credits ?? 0,
      hasLab: !!r.has_lab,
      hoursTheory: r.hours_theory ?? 0,
      hoursLab: r.hours_lab ?? 0,
      prerequisites: r.prerequisites ?? [],
      professors: bySubject.get(r.code) ?? [],
      labNumber: r.lab_number ?? undefined,
      aula: r.aula ?? undefined,
    };
    const n = r.semester ?? 1;
    if (!bySem.has(n)) bySem.set(n, []);
    bySem.get(n)!.push(sub);
  }
  return [...bySem.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, subjects]) => ({ number, subjects }));
}

function subjRow(s: PensumSubject, semester: number): Record<string, unknown> {
  return {
    code: s.code,
    name: s.name,
    credits: s.credits ?? 0,
    has_lab: !!s.hasLab,
    hours_theory: s.hoursTheory ?? 0,
    hours_lab: s.hoursLab ?? 0,
    semester,
    lab_number: s.labNumber ?? null,
    aula: s.aula ?? null,
    prerequisites: s.prerequisites ?? [],
    updated_at: now(),
    updated_by: getWebDeviceName(), // firma del equipo: viaja con el sello (regla de oro)
    deleted_at: null,
  };
}

export async function addSubject(
  data: PensumSubject & { semester: number }
): Promise<PensumSubject> {
  const sb = requireSupabase();
  const row = (await stripUpdatedBy('subjects', [subjRow(data, data.semester)]))[0];
  const { error } = await sb.from('subjects').upsert(await stripAula(row));
  if (error) throw error;
  const profs = data.professors ?? [];
  if (profs.length) {
    const rows = profs.map((pid) => ({ professor_id: pid, subject_code: data.code }));
    const { error: linksError } = await sb.from('professor_subjects').upsert(rows);
    if (linksError) throw linksError;
  }
  return data;
}

export async function updateSubject(
  code: string,
  data: Partial<PensumSubject & { semester: number }>
): Promise<PensumSubject> {
  const sb = requireSupabase();
  const patch: Record<string, unknown> = { updated_at: now(), updated_by: getWebDeviceName() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.credits !== undefined) patch.credits = data.credits;
  if (data.hasLab !== undefined) patch.has_lab = data.hasLab;
  if (data.hoursTheory !== undefined) patch.hours_theory = data.hoursTheory;
  if (data.hoursLab !== undefined) patch.hours_lab = data.hoursLab;
  if (data.semester !== undefined) patch.semester = data.semester;
  if (data.labNumber !== undefined) patch.lab_number = data.labNumber;
  if (data.aula !== undefined) patch.aula = data.aula;
  if (data.prerequisites !== undefined) patch.prerequisites = data.prerequisites;
  const safePatch = (await stripUpdatedBy('subjects', [patch]))[0];
  const { error } = await sb
    .from('subjects')
    .update(await stripAula(safePatch))
    .eq('code', code);
  if (error) throw error;
  return { ...(data as PensumSubject), code };
}

export async function updateSubjectProfessors(
  subjectCode: string,
  professorIds: string[]
): Promise<void> {
  const sb = requireSupabase();
  const { error: delError } = await sb
    .from('professor_subjects')
    .delete()
    .eq('subject_code', subjectCode);
  if (delError) throw delError; // no tragar el fallo: los enlaces viejos seguirían vivos
  if (professorIds.length) {
    const rows = professorIds.map((pid) => ({ professor_id: pid, subject_code: subjectCode }));
    const { error } = await sb.from('professor_subjects').insert(rows);
    if (error) throw error;
  }
}

export async function deleteSubject(code: string): Promise<void> {
  const sb = requireSupabase();
  const { error: linksError } = await sb
    .from('professor_subjects')
    .delete()
    .eq('subject_code', code);
  if (linksError) throw linksError;
  const { error: loadError } = await sb.from('academic_load').delete().eq('subject_code', code);
  if (loadError) throw loadError;
  const tomb: Record<string, unknown> = { deleted_at: now() };
  if (await tableHasUpdatedBy('subjects')) tomb.updated_by = getWebDeviceName();
  const { error } = await sb.from('subjects').update(tomb).eq('code', code);
  if (error) throw error;
}

export async function bulkUpsertSubjects(
  incoming: (Partial<PensumSubject> & { code: string; semester: number | string })[]
): Promise<Semester[]> {
  const sb = requireSupabase();
  const rows = incoming
    .filter((r) => r.code)
    .map((raw) => {
      const sub: PensumSubject = {
        code: String(raw.code).trim(),
        name: raw.name ?? String(raw.code),
        credits: Number(raw.credits) || 0,
        hasLab: Number(raw.hoursLab) > 0 || !!raw.hasLab,
        hoursTheory: Number(raw.hoursTheory) || 0,
        hoursLab: Number(raw.hoursLab) || 0,
        prerequisites: raw.prerequisites ?? [],
        labNumber: raw.labNumber ? String(raw.labNumber) : undefined,
      };
      return subjRow(sub, Number(raw.semester) || 1);
    });
  if (rows.length) {
    const { error } = await sb.from('subjects').upsert(await stripUpdatedBy('subjects', rows));
    if (error) throw error;
  }
  return getSubjects();
}

// ── Carga académica ─────────────────────────────────────────────────────────
export async function getAcademicLoad(): Promise<AcademicLoad> {
  const data = await selectAll('academic_load', ['subject_code', 'professor_id', 'role']);
  seenLoadKeys.clear();
  const out: AcademicLoad = {};
  for (const r of data ?? []) {
    seenLoadKeys.add(`${r.subject_code} ${r.professor_id} ${r.role}`);
    if (!out[r.subject_code]) out[r.subject_code] = { theory: [], lab: [] };
    if (r.role === 'lab') out[r.subject_code].lab!.push(r.professor_id);
    else out[r.subject_code].theory!.push(r.professor_id);
  }
  return out;
}

export async function saveAcademicLoad(load: AcademicLoad): Promise<void> {
  const sb = requireSupabase();
  type LoadKeyParts = { subject_code: string; professor_id: string; role: string };
  const parts = new Map<string, LoadKeyParts>();
  for (const [code, v] of Object.entries(load)) {
    for (const pid of v.theory ?? [])
      parts.set(`${code} ${pid} theory`, { subject_code: code, professor_id: pid, role: 'theory' });
    for (const pid of v.lab ?? [])
      parts.set(`${code} ${pid} lab`, { subject_code: code, professor_id: pid, role: 'lab' });
  }
  // Diff contra lo VISTO por este cliente (anti-pisado): solo se insertan las
  // asignaciones nuevas (las existentes conservan su sello updated_at) y solo se
  // borra lo que este cliente vio y quitó — nunca lo que otra PC agregó y este
  // cliente aún no conoce. Nada de borrar-todo-e-insertar (incidente de junio).
  const { added, removed } = diffKeySets(seenLoadKeys, [...parts.keys()]);
  if (added.length) {
    const ts = now();
    // Solo las filas NUEVAS llevan sello + firma del equipo (las intactas no se tocan).
    const rows = added.map((k) => ({
      ...parts.get(k)!,
      updated_at: ts,
      updated_by: getWebDeviceName(),
    }));
    const { error } = await sb
      .from('academic_load')
      .upsert(await stripUpdatedBy('academic_load', rows));
    if (error) throw error;
  }
  // Lo removido se conoce solo por la clave; sus partes se reconstruyen del último
  // pull (getAcademicLoad las agregó a seenLoadKeys con el MISMO formato de clave).
  for (const k of removed) {
    const toks = k.split(' ');
    const role = toks.pop()!;
    const professor_id = toks.pop()!;
    const subject_code = toks.join(' '); // por si un código trajera espacios
    const { error } = await sb
      .from('academic_load')
      .delete()
      .eq('subject_code', subject_code)
      .eq('professor_id', professor_id)
      .eq('role', role);
    if (error) throw error;
  }
  for (const k of removed) seenLoadKeys.delete(k);
  for (const k of added) seenLoadKeys.add(k);
}

// ── Bloques de horario ──────────────────────────────────────────────────────
export async function getScheduleBlocks(): Promise<ScheduleBlockData[]> {
  const data = await selectAll('schedule_blocks', ['id'], {
    liveOnly: true,
  });
  const mapped = (data ?? []).map((r) => ({
    id: r.id,
    subjectCode: r.subject_code ?? '',
    semester: r.semester ?? undefined,
    day: r.day,
    startHour: r.start_hour,
    duration: r.duration,
    color: r.color ?? '',
    type: r.type ?? undefined,
    professorId: r.professor_id ?? undefined,
    section: r.section ?? undefined,
    labGroupId: r.lab_group_id ?? undefined,
    aula: r.aula ?? undefined,
  })) as ScheduleBlockData[];
  // Registrar lo que este cliente vio: base del diff anti-pisado al guardar.
  for (const k of Object.keys(seenBlocks)) delete seenBlocks[k];
  for (const b of mapped) seenBlocks[b.id] = blockFingerprint(b);
  return mapped;
}

export async function saveScheduleBlocks(blocks: ScheduleBlockData[]): Promise<void> {
  const sb = requireSupabase();
  // Diff contra lo VISTO en el último pull (anti-pisado, sellado POR ÍTEM):
  //   - solo se suben (re-sellados) los bloques nuevos o realmente cambiados; los
  //     intactos conservan su updated_at → el trigger newest-wins puede proteger
  //     las ediciones más recientes de otras PCs;
  //   - solo se tombstonea lo que este cliente vio y quitó — nunca bloques que
  //     otra PC creó y este cliente aún no bajó (antes se borraban: raíz del
  //     "desaparecen bloques" multi-PC). Nota: un restore sin pull previo solo
  //     upsertea (no borra nada), que es el comportamiento seguro.
  const { changed, removedIds } = diffByFingerprint(seenBlocks, blocks, blockFingerprint);
  const ts = now();
  if (changed.length) {
    const rows = changed.map((b) => ({
      id: b.id,
      subject_code: b.subjectCode ?? null,
      semester: b.semester ?? null,
      day: b.day,
      start_hour: b.startHour,
      duration: b.duration,
      color: b.color ?? null,
      type: b.type ?? null,
      professor_id: b.professorId ?? null,
      section: b.section ?? null,
      lab_group_id: b.labGroupId ?? null,
      aula: b.aula ?? null,
      updated_at: ts,
      updated_by: getWebDeviceName(), // solo filas CAMBIADAS: la firma viaja con el sello
      deleted_at: null,
    }));
    const stripped = await stripBlockAula(
      await stripBlockSemester(await stripUpdatedBy('schedule_blocks', rows))
    );
    const { error } = await sb.from('schedule_blocks').upsert(stripped);
    if (error) throw error;
  }
  if (removedIds.length) {
    // updated_at fresco: el tombstone es una edición y compite en el newest-wins
    // (y como toda edición, va firmada con el equipo si hay migración 2.8).
    const tomb: Record<string, unknown> = { deleted_at: ts, updated_at: ts };
    if (await tableHasUpdatedBy('schedule_blocks')) tomb.updated_by = getWebDeviceName();
    const { error } = await sb.from('schedule_blocks').update(tomb).in('id', removedIds);
    if (error) throw error;
  }
  // Lo visto pasa a ser el estado que acabamos de dejar.
  for (const id of removedIds) delete seenBlocks[id];
  for (const b of changed) seenBlocks[b.id] = blockFingerprint(b);
}

// ── Logs ────────────────────────────────────────────────────────────────────
export async function getLogs(): Promise<LogEntry[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('logs')
    .select('*')
    .is('deleted_at', null)
    .order('timestamp', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    details: r.details ?? '',
    timestamp: r.timestamp,
  })) as LogEntry[];
}

export async function createLog(action: string, details: string): Promise<LogEntry> {
  const sb = requireSupabase();
  const log: LogEntry = { id: `log-${Date.now()}`, action, details, timestamp: now() };
  const { error } = await sb.from('logs').insert({ ...log, updated_at: now(), deleted_at: null });
  if (error) throw error;
  return log;
}

// ── Restore (backup completo) ───────────────────────────────────────────────
export async function restoreData(data: BackupData): Promise<void> {
  const sb = requireSupabase();
  if (data.professors) {
    const rows = await stripProf(
      await stripUpdatedBy(
        'professors',
        data.professors.map((p) => profRow(p))
      )
    );
    const { error: profError } = await sb.from('professors').upsert(rows);
    if (profError) throw profError;
    for (const p of data.professors) await setProfessorLinks(p.id, p.subjects ?? []);
  }
  if (data.pensum) {
    const rows = data.pensum.flatMap((sem) => sem.subjects.map((s) => subjRow(s, sem.number)));
    if (rows.length) {
      const { error: subjError } = await sb
        .from('subjects')
        .upsert(await stripUpdatedBy('subjects', rows));
      if (subjError) throw subjError;
    }
  }
  if (data.academicLoad) await saveAcademicLoad(data.academicLoad);
  if (data.scheduleBlocks) await saveScheduleBlocks(data.scheduleBlocks);
  await createLog('Restauración de Sistema', 'Se restauró una copia de seguridad completa.');
}
