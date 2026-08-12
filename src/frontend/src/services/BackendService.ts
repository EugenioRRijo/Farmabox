/**
 * BackendService — Capa de transporte única del frontend.
 *
 * Detecta el entorno en tiempo de ejecución:
 *   - En Electron (window.electronAPI presente) → usa IPC (proceso de Electron).
 *   - En web/dev (sin electronAPI)               → usa Supabase directo (supabaseWeb).
 *
 * En ambos casos los datos terminan en las MISMAS tablas relacionales de Supabase:
 * un solo backend, sin duplicar lógica (ya no hay servidor Express).
 */

import * as web from './supabaseWeb';

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

// ── Professor types (mirrors backend) ──────────────────
export interface Professor {
  id: string;
  fullName: string;
  title: 'Prof.' | 'Dr.' | 'Dra.' | 'MSc.' | 'Lic.';
  email?: string;
  cedula?: string;
  profession?: string;
  subjects: string[];
  // 'unassigned' = importado sin tipo (sin rol hasta asignarlo con los toggles).
  type: 'theory' | 'practice' | 'both' | 'unassigned';
}

export interface PensumSubject {
  code: string;
  name: string;
  credits: number;
  hasLab: boolean;
  hoursTheory: number;
  hoursLab: number;
  prerequisites: string[];
  professors?: string[];
  labNumber?: string;
  /** Aula de teoría (ej. "209"). Sale en el PDF como "Aula 209". */
  aula?: string;
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
  semester?: number;
  day: number;
  startHour: number;
  duration: number;
  color: string;
  type?: 'THEORY' | 'LAB';
  professorId?: string;
  section?: string;
  labGroupId?: string;
  aula?: string;
}

// ── Professors ─────────────────────────────────────────
export async function getProfessors(): Promise<Professor[]> {
  if (ipc) return unwrap(ipc.professors.getAll());
  return web.getProfessors();
}

export async function createProfessor(data: Omit<Professor, 'id'>): Promise<Professor> {
  if (ipc) return unwrap(ipc.professors.create(data));
  return web.createProfessor(data);
}

export async function updateProfessor(id: string, data: Partial<Professor>): Promise<Professor> {
  if (ipc) return unwrap(ipc.professors.update(id, data));
  return web.updateProfessor(id, data);
}

export async function deleteProfessor(id: string): Promise<void> {
  if (ipc) {
    await unwrap(ipc.professors.delete(id));
    return;
  }
  await web.deleteProfessor(id);
}

export async function resetProfessors(): Promise<Professor[]> {
  if (ipc) return unwrap(ipc.professors.reset());
  return web.resetProfessors();
}

export async function bulkUpsertProfessors(data: Partial<Professor>[]): Promise<Professor[]> {
  if (ipc) return unwrap(ipc.professors.bulkUpsert(data));
  return web.bulkUpsertProfessors(data);
}

// ── Subjects / Pensum ──────────────────────────────────
export async function getSubjects(): Promise<Semester[]> {
  if (ipc) return unwrap(ipc.subjects.getAll());
  return web.getSubjects();
}

export async function addSubject(data: PensumSubject & { semester: number }): Promise<PensumSubject> {
  if (ipc) return unwrap(ipc.subjects.create(data));
  return web.addSubject(data);
}

export async function updateSubject(code: string, data: Partial<PensumSubject>): Promise<PensumSubject> {
  if (ipc) return unwrap(ipc.subjects.update(code, data));
  return web.updateSubject(code, data);
}

export async function updateSubjectProfessors(
  subjectCode: string,
  professorIds: string[],
): Promise<void> {
  if (ipc) {
    await unwrap(ipc.subjects.updateProfessors(subjectCode, professorIds));
    return;
  }
  await web.updateSubjectProfessors(subjectCode, professorIds);
}

export async function deleteSubject(code: string): Promise<void> {
  if (ipc) {
    await unwrap(ipc.subjects.delete(code));
    return;
  }
  await web.deleteSubject(code);
}

export async function bulkUpsertSubjects(
  data: Array<Partial<PensumSubject> & { code: string; semester: number | string }>,
): Promise<Semester[]> {
  if (ipc) return unwrap(ipc.subjects.bulkUpsert(data));
  return web.bulkUpsertSubjects(data);
}

// ── Academic Load ──────────────────────────────────────
export async function getAcademicLoad(): Promise<AcademicLoad> {
  if (ipc) return unwrap(ipc.schedule.getLoad());
  return web.getAcademicLoad();
}

export async function saveAcademicLoad(load: AcademicLoad): Promise<void> {
  if (ipc) {
    await unwrap(ipc.schedule.saveLoad(load));
    return;
  }
  await web.saveAcademicLoad(load);
}

// ── Schedule Blocks ────────────────────────────────────
export async function getScheduleBlocks(): Promise<ScheduleBlockData[]> {
  if (ipc) return unwrap(ipc.schedule.getBlocks());
  return web.getScheduleBlocks();
}

export async function saveScheduleBlocks(blocks: ScheduleBlockData[]): Promise<void> {
  if (ipc) {
    await unwrap(ipc.schedule.saveBlocks(blocks));
    return;
  }
  await web.saveScheduleBlocks(blocks);
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
  return web.getLogs();
}

export async function createLog(action: string, details: string): Promise<LogEntry> {
  if (ipc) return unwrap(ipc.logs.create(action, details));
  return web.createLog(action, details);
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
  await web.restoreData(data);
}

// ── Configuración de almacenamiento (solo escritorio/IPC) ──────────────────
export interface StorageInfo {
  mode: 'cloud' | 'shared';
  sharedDir: string | null;
}

/** La configuración de almacenamiento es una feature de escritorio (Electron). */
export function isStorageConfigAvailable(): boolean {
  return !!ipc;
}
function configApi() {
  if (!ipc) throw new Error('La configuración solo está disponible en la app de escritorio.');
  return ipc.config;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  return unwrap(configApi().getStorage());
}
export async function setSharedDir(
  dir: string | null,
): Promise<{ ok: boolean; sharedDir: string | null }> {
  return unwrap(configApi().setSharedDir(dir));
}
export async function pickSharedFolder(): Promise<{ path: string | null }> {
  return unwrap(configApi().pickFolder());
}

/** Se dispara cuando otra PC cambia datos. Devuelve unsubscribe.
 *  - Escritorio (Electron): vía IPC 'data-changed' (pull periódico + realtime del main).
 *  - Web: suscripción directa a Supabase Realtime. */
export function onRemoteDataChanged(callback: () => void): () => void {
  if (ipc && typeof ipc.onDataChanged === 'function') {
    return ipc.onDataChanged(callback);
  }
  // Modo web: realtime directo a Supabase (el poll de 30 s queda como red de seguridad).
  return web.subscribeRealtime(callback);
}

// ── Sincronización manual ("Sincronizar ahora") ────────────────────────────
export interface SyncResult {
  ok: boolean;
  changed: boolean;
  online: boolean;
  at?: string;
}
export interface SyncStatus {
  online: boolean;
  mode: 'cloud' | 'folder';
  device?: string; // nombre del equipo (.exe: os.hostname(); web: "este navegador")
}

/** Fuerza subir lo pendiente + bajar cambios (.exe). En web no hay nada que subir
 *  (las escrituras ya van directo a Supabase); el caller re-lee con reload(). */
export async function syncNow(): Promise<SyncResult> {
  if (ipc) return unwrap(ipc.sync.now());
  return { ok: true, changed: false, online: typeof navigator !== 'undefined' ? navigator.onLine : true };
}

export async function getSyncStatus(): Promise<SyncStatus> {
  if (ipc) return unwrap(ipc.sync.status());
  return {
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    mode: 'cloud',
    device: 'este navegador',
  };
}

// ── Vista previa de sincronización (tipos espejo del DTO del main) ──────────
// Contrato normativo: docs/superpowers/specs/2026-08-12-preview-sincronizacion-design.md
export type SyncPreviewKind = 'nuevo' | 'actualizado' | 'eliminado' | 'subes';

export interface SyncPreviewItem {
  kind: SyncPreviewKind;
  label: string;
  detail?: string;
}

export interface SyncPreviewSection {
  dataset: 'professors' | 'subjects' | 'academicLoad' | 'scheduleBlocks';
  title: string; // "Profesores" | "Materias" | "Carga académica" | "Bloques de horario"
  items: SyncPreviewItem[]; // solo secciones con items van en el payload
}

export interface SyncPreview {
  ok: boolean;
  online: boolean;
  at: string; // ISO
  sections: SyncPreviewSection[];
  totals: { nuevos: number; actualizados: number; eliminados: number; subes: number };
}

/** Vista previa del sync (solo .exe). En web devuelve null (el botón usa el diálogo genérico). */
export async function previewSync(): Promise<SyncPreview | null> {
  if (ipc) return unwrap(ipc.sync.preview());
  return null;
}
