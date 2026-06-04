/**
 * Tipos locales de la capa Electron.
 *
 * Reutiliza las entidades canónicas (Professor / Semester / PensumSubject) desde
 * @scheduler/shared y define las que son propias del modelo de datos actual
 * (bloques de horario, carga académica, logs). NOTA: shared aún exporta un
 * ScheduleBlock con el modelo viejo (startTime/endTime); por eso aquí usamos
 * ScheduleBlockData (modelo nuevo: day/startHour/duration/section/type).
 */
import type { Professor, Semester, PensumSubject } from '@scheduler/shared';

export type { Professor, Semester, PensumSubject };

export interface AcademicLoad {
  [subjectCode: string]: {
    theory?: string[]; // ids de profesores
    lab?: string[]; // ids de profesores
  };
}

export interface ScheduleBlockData {
  id: string;
  subjectCode: string;
  day: number; // 0 = Lunes
  startHour: number; // 7, 8, ...
  duration: number; // en horas
  color: string;
  type?: 'THEORY' | 'LAB';
  professorId?: string;
  section?: string;
  labGroupId?: string;
}

export interface LogEntry {
  id: string;
  action: string;
  details: string;
  timestamp: string; // ISO
}

export interface RestorePayload {
  professors?: Professor[];
  pensum?: Semester[];
  academicLoad?: AcademicLoad;
  scheduleBlocks?: ScheduleBlockData[];
}

/** Envoltura estándar de toda respuesta IPC. */
export type IpcResult<T> = { data: T } | { error: string };

// ── Sincronización / Historial de versiones ──────────────────────────────────

/** Snapshot completo del estado (= un "commit"). */
export interface AppSnapshot {
  professors: Professor[];
  pensum: Semester[];
  scheduleBlocks: ScheduleBlockData[];
  academicLoad: AcademicLoad;
  logs: LogEntry[];
}

/** Cambios de un dataset desde el último push. */
export interface DatasetDiff {
  added: number;
  modified: number;
  removed: number;
}

/** Resumen de cambios pendientes de subir. */
export interface PendingDiff {
  datasets: {
    professors: DatasetDiff;
    scheduleBlocks: DatasetDiff;
    subjects: DatasetDiff;
    academicLoad: DatasetDiff;
    logs: DatasetDiff;
  };
  total: number;
  summary: string; // "Horarios: +3 ~2 -1 · Profesores: +1"
}

/** Estado de sincronización para el indicador de la UI. */
export interface SyncStatus {
  configured: boolean; // hay credenciales de nube
  online: boolean; // la nube es alcanzable ahora
  lastSyncAt: string | null; // ISO del último push/pull
  pendingCount: number; // cambios sin subir
}

/** Metadatos de una versión del historial (sin el snapshot pesado). */
export interface VersionMeta {
  id: number;
  created_at: string;
  device: string | null;
  label: string | null;
  summary: string | null;
}

/** Estado persistido localmente del último estado sincronizado (para el diff). */
export interface SyncState {
  lastSyncAt: string;
  hashes: {
    professors: Record<string, string>;
    scheduleBlocks: Record<string, string>;
    subjects: Record<string, string>;
    academicLoad: Record<string, string>;
    logs: Record<string, string>;
  };
}
