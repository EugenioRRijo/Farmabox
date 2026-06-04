/**
 * BackendService — Capa de transporte única del frontend.
 *
 * Detecta el entorno en tiempo de ejecución:
 *   - En Electron (window.electronAPI presente) → usa IPC (sin Express).
 *   - En web/dev (sin electronAPI)               → usa HTTP al Express local.
 *
 * Toda operación de profesores, materias, carga académica y bloques de horario
 * pasa por aquí, de modo que los consumidores (AppDataContext, componentes) no
 * cambian al alternar de transporte.
 */

const API_BASE = 'http://localhost:3001/api';

// Referencia al puente IPC (undefined en modo web).
const ipc = typeof window !== 'undefined' ? window.electronAPI : undefined;

/** Desempaqueta la envoltura IPC { data } | { error } o lanza el error. */
async function unwrap<T>(p: Promise<{ data: T } | { error: string }>): Promise<T> {
  const res = await p;
  if (res && typeof res === 'object' && 'error' in res) {
    throw new Error((res as { error: string }).error);
  }
  return (res as { data: T }).data;
}

/** Cliente HTTP para el modo web (Express). */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `API error: ${res.status}`);
  }
  return res.json();
}

// ── Professor types (mirrors backend) ──────────────────
export interface Professor {
  id: string;
  fullName: string;
  title: 'Prof.' | 'Dr.' | 'Dra.' | 'MSc.' | 'Lic.';
  email?: string;
  cedula?: string;
  subjects: string[];
  type: 'theory' | 'practice' | 'both';
}

export interface PensumSubject {
  code: string;
  name: string;
  credits: number;
  hasLab: boolean;
  hoursTheory: number;
  hoursLab: number;
  prerequisites: string[];
  labNumber?: string;
}

export interface Semester {
  number: number;
  subjects: PensumSubject[];
}

export interface AcademicLoad {
  [subjectCode: string]: {
    theory?: string[];
    lab?: string[];
  };
}

export interface ScheduleBlockData {
  id: string;
  subjectCode: string;
  day: number;
  startHour: number;
  duration: number;
  color: string;
  type?: 'THEORY' | 'LAB';
  professorId?: string;
  section?: string;
  labGroupId?: string;
}

// ── Professors ─────────────────────────────────────────
export async function getProfessors(): Promise<Professor[]> {
  if (ipc) return unwrap(ipc.professors.getAll());
  return request<Professor[]>('/professors');
}

export async function createProfessor(data: Omit<Professor, 'id'>): Promise<Professor> {
  if (ipc) return unwrap(ipc.professors.create(data));
  return request<Professor>('/professors', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateProfessor(id: string, data: Partial<Professor>): Promise<Professor> {
  if (ipc) return unwrap(ipc.professors.update(id, data));
  return request<Professor>(`/professors/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteProfessor(id: string): Promise<void> {
  if (ipc) {
    await unwrap(ipc.professors.delete(id));
    return;
  }
  await request(`/professors/${id}`, { method: 'DELETE' });
}

export async function resetProfessors(): Promise<Professor[]> {
  if (ipc) return unwrap(ipc.professors.reset());
  return request<Professor[]>('/professors/reset', { method: 'POST' });
}

// ── Subjects / Pensum ──────────────────────────────────
export async function getSubjects(): Promise<Semester[]> {
  if (ipc) return unwrap(ipc.subjects.getAll());
  return request<Semester[]>('/subjects');
}

export async function addSubject(data: PensumSubject & { semester: number }): Promise<PensumSubject> {
  if (ipc) return unwrap(ipc.subjects.create(data));
  return request<PensumSubject>('/subjects', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSubject(code: string, data: Partial<PensumSubject>): Promise<PensumSubject> {
  if (ipc) return unwrap(ipc.subjects.update(code, data));
  return request<PensumSubject>(`/subjects/${encodeURIComponent(code)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function updateSubjectProfessors(
  subjectCode: string,
  professorIds: string[],
): Promise<void> {
  if (ipc) {
    await unwrap(ipc.subjects.updateProfessors(subjectCode, professorIds));
    return;
  }
  await request(`/subjects/${subjectCode}/professors`, {
    method: 'PUT',
    body: JSON.stringify({ professorIds }),
  });
}

export async function deleteSubject(code: string): Promise<void> {
  if (ipc) {
    await unwrap(ipc.subjects.delete(code));
    return;
  }
  await request(`/subjects/${code}`, { method: 'DELETE' });
}

// ── Academic Load ──────────────────────────────────────
export async function getAcademicLoad(): Promise<AcademicLoad> {
  if (ipc) return unwrap(ipc.schedule.getLoad());
  return request<AcademicLoad>('/academic-load');
}

export async function saveAcademicLoad(load: AcademicLoad): Promise<void> {
  if (ipc) {
    await unwrap(ipc.schedule.saveLoad(load));
    return;
  }
  await request('/academic-load', { method: 'PUT', body: JSON.stringify(load) });
}

// ── Schedule Blocks ────────────────────────────────────
export async function getScheduleBlocks(): Promise<ScheduleBlockData[]> {
  if (ipc) return unwrap(ipc.schedule.getBlocks());
  return request<ScheduleBlockData[]>('/schedule-blocks');
}

export async function saveScheduleBlocks(blocks: ScheduleBlockData[]): Promise<void> {
  if (ipc) {
    await unwrap(ipc.schedule.saveBlocks(blocks));
    return;
  }
  await request('/schedule-blocks', { method: 'PUT', body: JSON.stringify(blocks) });
}

// ── Logs / Reports ─────────────────────────────────────
export interface LogEntry {
  id: string;
  action: string;
  details: string;
  timestamp: string;
}

export async function getLogs(): Promise<LogEntry[]> {
  if (ipc) return unwrap(ipc.logs.getAll());
  return request<LogEntry[]>('/logs');
}

export async function createLog(action: string, details: string): Promise<LogEntry> {
  if (ipc) return unwrap(ipc.logs.create(action, details));
  return request<LogEntry>('/logs', { method: 'POST', body: JSON.stringify({ action, details }) });
}

// ── Admin / Restore ────────────────────────────────────
export interface BackupData {
  professors?: Professor[];
  pensum?: Semester[];
  academicLoad?: AcademicLoad;
  scheduleBlocks?: ScheduleBlockData[];
}

export async function restoreData(data: BackupData): Promise<void> {
  if (ipc) {
    await unwrap(ipc.system.restore(data));
    return;
  }
  await request('/admin/restore', { method: 'POST', body: JSON.stringify(data) });
}

// ── Sincronización / Historial de versiones (solo escritorio/IPC) ──────────
export interface SyncStatus {
  configured: boolean;
  online: boolean;
  lastSyncAt: string | null;
  pendingCount: number;
}
export interface DatasetDiff {
  added: number;
  modified: number;
  removed: number;
}
export interface PendingDiff {
  datasets: {
    professors: DatasetDiff;
    scheduleBlocks: DatasetDiff;
    subjects: DatasetDiff;
    academicLoad: DatasetDiff;
    logs: DatasetDiff;
  };
  total: number;
  summary: string;
}
export interface VersionMeta {
  id: number;
  created_at: string;
  device: string | null;
  label: string | null;
  summary: string | null;
}

/** La sincronización es una feature de escritorio (Electron). En web no aplica. */
export function isSyncAvailable(): boolean {
  return !!ipc;
}
function syncApi() {
  if (!ipc) throw new Error('La sincronización solo está disponible en la app de escritorio.');
  return ipc.sync;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  return unwrap(syncApi().status());
}
export async function getSyncDiff(): Promise<PendingDiff> {
  return unwrap(syncApi().diff());
}
export async function pushSession(label?: string): Promise<{ summary: string }> {
  return unwrap(syncApi().push(label));
}
export async function pullNow(): Promise<{ ok: boolean; merged: string[] }> {
  return unwrap(syncApi().pull());
}
export async function getVersionHistory(): Promise<VersionMeta[]> {
  return unwrap(syncApi().history());
}
export async function restoreVersion(id: number): Promise<void> {
  await unwrap(syncApi().restore(id));
}
