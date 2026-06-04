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
