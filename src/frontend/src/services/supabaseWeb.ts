/**
 * supabaseWeb — Capa de datos del modo WEB, directo a las tablas relacionales de
 * Supabase (las MISMAS que usa el .exe). Reemplaza al backend Express.
 *
 * Mapeo snake_case ↔ camelCase + stamping (updated_at / deleted_at) para que las
 * escrituras de la web sean consistentes con el merge offline-first del escritorio.
 */
import { requireSupabase } from './supabaseClient';
import type {
  Professor,
  PensumSubject,
  Semester,
  AcademicLoad,
  ScheduleBlockData,
  LogEntry,
  BackupData,
} from './BackendService';

const now = (): string => new Date().toISOString();

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
    const { profession: _omit, ...rest } = r;
    return rest;
  });
}

// schedule_blocks.semester también es columna nueva (tabla semesters + FK).
let blockSemesterSupported: boolean | null = null;
async function stripBlockSemester(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (blockSemesterSupported === null) {
    const { error } = await requireSupabase().from('schedule_blocks').select('semester').limit(1);
    blockSemesterSupported = !error;
  }
  if (blockSemesterSupported) return rows;
  return rows.map((r) => {
    const { semester: _omit, ...rest } = r;
    return rest;
  });
}

// ── Helpers de lectura ──────────────────────────────────────────────────────
async function fetchLinks(): Promise<{ byProf: Map<string, string[]>; bySubject: Map<string, string[]> }> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('professor_subjects').select('professor_id,subject_code');
  if (error) throw error;
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
  const sb = requireSupabase();
  const { data, error } = await sb.from('professors').select('*').is('deleted_at', null);
  if (error) throw error;
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
    deleted_at: null,
  };
}

async function setProfessorLinks(profId: string, subjectCodes: string[]): Promise<void> {
  const sb = requireSupabase();
  await sb.from('professor_subjects').delete().eq('professor_id', profId);
  if (subjectCodes.length) {
    const rows = subjectCodes.map((c) => ({ professor_id: profId, subject_code: c }));
    const { error } = await sb.from('professor_subjects').insert(rows);
    if (error) throw error;
  }
}

export async function createProfessor(data: Omit<Professor, 'id'>): Promise<Professor> {
  const sb = requireSupabase();
  const prof: Professor = { ...data, id: `prof-${Date.now()}` } as Professor;
  const { error } = await sb.from('professors').upsert(await stripProf([profRow(prof)]));
  if (error) throw error;
  await setProfessorLinks(prof.id, prof.subjects ?? []);
  return prof;
}

export async function updateProfessor(id: string, data: Partial<Professor>): Promise<Professor> {
  const sb = requireSupabase();
  // PATCH parcial: solo los campos enviados (no pisar profesión/cédula/etc. existentes).
  const patch: Record<string, unknown> = { updated_at: now() };
  if (data.fullName !== undefined) patch.full_name = data.fullName;
  if (data.title !== undefined) patch.title = data.title;
  if (data.email !== undefined) patch.email = data.email ?? null;
  if (data.cedula !== undefined) patch.cedula = data.cedula ?? null;
  if (data.profession !== undefined) patch.profession = data.profession ?? null;
  if (data.type !== undefined) patch.type = data.type;
  const safePatch = (await stripProf([patch]))[0];
  const { error } = await sb.from('professors').update(safePatch).eq('id', id);
  if (error) throw error;
  if (data.subjects) await setProfessorLinks(id, data.subjects);
  return { ...(data as Professor), id };
}

export async function deleteProfessor(id: string): Promise<void> {
  const sb = requireSupabase();
  await sb.from('professor_subjects').delete().eq('professor_id', id);
  await sb.from('academic_load').delete().eq('professor_id', id);
  const { error } = await sb.from('professors').update({ deleted_at: now() }).eq('id', id);
  if (error) throw error;
}

/** "Vaciar lista": borra enlaces + carga académica y marca como borrados (tombstone)
 *  a TODOS los profesores vivos. Antes sembraba 45 profesores hardcodeados. */
export async function resetProfessors(): Promise<Professor[]> {
  const sb = requireSupabase();
  await sb.from('professor_subjects').delete().not('professor_id', 'is', null);
  await sb.from('academic_load').delete().not('professor_id', 'is', null);
  const { error } = await sb.from('professors').update({ deleted_at: now() }).is('deleted_at', null);
  if (error) throw error;
  return [];
}

export async function bulkUpsertProfessors(incoming: Partial<Professor>[]): Promise<Professor[]> {
  const sb = requireSupabase();
  let i = 0;
  const profs: Professor[] = incoming.map((raw) => ({
    id: raw.id && String(raw.id).trim() ? String(raw.id).trim() : `prof-${Date.now()}-${i++}`,
    fullName: raw.fullName ?? 'Sin nombre',
    title: raw.title ?? 'Prof.',
    email: raw.email,
    cedula: raw.cedula,
    profession: raw.profession,
    subjects: raw.subjects ?? [],
    type: raw.type ?? 'both',
  }));
  if (profs.length) {
    const { error } = await sb.from('professors').upsert(await stripProf(profs.map((p) => profRow(p))));
    if (error) throw error;
    for (const p of profs) await setProfessorLinks(p.id, p.subjects ?? []);
  }
  return profs;
}

// ── Materias / Pensum ───────────────────────────────────────────────────────
export async function getSubjects(): Promise<Semester[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('subjects').select('*').is('deleted_at', null);
  if (error) throw error;
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
    prerequisites: s.prerequisites ?? [],
    updated_at: now(),
    deleted_at: null,
  };
}

export async function addSubject(data: PensumSubject & { semester: number }): Promise<PensumSubject> {
  const sb = requireSupabase();
  const { error } = await sb.from('subjects').upsert(subjRow(data, data.semester));
  if (error) throw error;
  const profs = data.professors ?? [];
  if (profs.length) {
    const rows = profs.map((pid) => ({ professor_id: pid, subject_code: data.code }));
    await sb.from('professor_subjects').upsert(rows);
  }
  return data;
}

export async function updateSubject(
  code: string,
  data: Partial<PensumSubject & { semester: number }>,
): Promise<PensumSubject> {
  const sb = requireSupabase();
  const patch: Record<string, unknown> = { updated_at: now() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.credits !== undefined) patch.credits = data.credits;
  if (data.hasLab !== undefined) patch.has_lab = data.hasLab;
  if (data.hoursTheory !== undefined) patch.hours_theory = data.hoursTheory;
  if (data.hoursLab !== undefined) patch.hours_lab = data.hoursLab;
  if (data.semester !== undefined) patch.semester = data.semester;
  if (data.labNumber !== undefined) patch.lab_number = data.labNumber;
  if (data.prerequisites !== undefined) patch.prerequisites = data.prerequisites;
  const { error } = await sb.from('subjects').update(patch).eq('code', code);
  if (error) throw error;
  return { ...(data as PensumSubject), code };
}

export async function updateSubjectProfessors(subjectCode: string, professorIds: string[]): Promise<void> {
  const sb = requireSupabase();
  await sb.from('professor_subjects').delete().eq('subject_code', subjectCode);
  if (professorIds.length) {
    const rows = professorIds.map((pid) => ({ professor_id: pid, subject_code: subjectCode }));
    const { error } = await sb.from('professor_subjects').insert(rows);
    if (error) throw error;
  }
}

export async function deleteSubject(code: string): Promise<void> {
  const sb = requireSupabase();
  await sb.from('professor_subjects').delete().eq('subject_code', code);
  await sb.from('academic_load').delete().eq('subject_code', code);
  const { error } = await sb.from('subjects').update({ deleted_at: now() }).eq('code', code);
  if (error) throw error;
}

export async function bulkUpsertSubjects(
  incoming: (Partial<PensumSubject> & { code: string; semester: number | string })[],
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
    const { error } = await sb.from('subjects').upsert(rows);
    if (error) throw error;
  }
  return getSubjects();
}

// ── Carga académica ─────────────────────────────────────────────────────────
export async function getAcademicLoad(): Promise<AcademicLoad> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('academic_load').select('*');
  if (error) throw error;
  const out: AcademicLoad = {};
  for (const r of data ?? []) {
    if (!out[r.subject_code]) out[r.subject_code] = { theory: [], lab: [] };
    if (r.role === 'lab') out[r.subject_code].lab!.push(r.professor_id);
    else out[r.subject_code].theory!.push(r.professor_id);
  }
  return out;
}

export async function saveAcademicLoad(load: AcademicLoad): Promise<void> {
  const sb = requireSupabase();
  const rows: { subject_code: string; professor_id: string; role: string; updated_at: string }[] = [];
  for (const [code, v] of Object.entries(load)) {
    for (const pid of v.theory ?? []) rows.push({ subject_code: code, professor_id: pid, role: 'theory', updated_at: now() });
    for (const pid of v.lab ?? []) rows.push({ subject_code: code, professor_id: pid, role: 'lab', updated_at: now() });
  }
  // Reemplazo completo de la carga (es un mapa cerrado): borrar todo y reinsertar.
  await sb.from('academic_load').delete().not('subject_code', 'is', null);
  if (rows.length) {
    const { error } = await sb.from('academic_load').insert(rows);
    if (error) throw error;
  }
}

// ── Bloques de horario ──────────────────────────────────────────────────────
export async function getScheduleBlocks(): Promise<ScheduleBlockData[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from('schedule_blocks').select('*').is('deleted_at', null);
  if (error) throw error;
  return (data ?? []).map((r) => ({
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
  })) as ScheduleBlockData[];
}

export async function saveScheduleBlocks(blocks: ScheduleBlockData[]): Promise<void> {
  const sb = requireSupabase();
  const rows = blocks.map((b) => ({
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
    updated_at: now(),
    deleted_at: null,
  }));
  if (rows.length) {
    const { error } = await sb.from('schedule_blocks').upsert(await stripBlockSemester(rows));
    if (error) throw error;
  }
  // Tombstone de los bloques que ya no están en el set.
  const keep = new Set(blocks.map((b) => b.id));
  const { data: existing } = await sb.from('schedule_blocks').select('id').is('deleted_at', null);
  const stale = (existing ?? []).map((r) => r.id).filter((id: string) => !keep.has(id));
  if (stale.length) await sb.from('schedule_blocks').update({ deleted_at: now() }).in('id', stale);
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
  const { error } = await sb
    .from('logs')
    .insert({ ...log, updated_at: now(), deleted_at: null });
  if (error) throw error;
  return log;
}

// ── Restore (backup completo) ───────────────────────────────────────────────
export async function restoreData(data: BackupData): Promise<void> {
  const sb = requireSupabase();
  if (data.professors) {
    await sb.from('professors').upsert(await stripProf(data.professors.map((p) => profRow(p))));
    for (const p of data.professors) await setProfessorLinks(p.id, p.subjects ?? []);
  }
  if (data.pensum) {
    const rows = data.pensum.flatMap((sem) => sem.subjects.map((s) => subjRow(s, sem.number)));
    if (rows.length) await sb.from('subjects').upsert(rows);
  }
  if (data.academicLoad) await saveAcademicLoad(data.academicLoad);
  if (data.scheduleBlocks) await saveScheduleBlocks(data.scheduleBlocks);
  await createLog('Restauración de Sistema', 'Se restauró una copia de seguridad completa.');
}
