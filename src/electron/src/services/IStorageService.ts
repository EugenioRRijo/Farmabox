/**
 * IStorageService — Contrato de persistencia (Dependency Inversion).
 *
 * Los servicios de dominio dependen de esta abstracción, no de una implementación
 * concreta (JSON en disco hoy; SQLite/cifrado o nube en el futuro).
 */
import type { Professor, Semester } from '@scheduler/shared';
import type { AcademicLoad, ScheduleBlockData, LogEntry } from '../types';

export interface IStorageService {
  getDataDir(): string;

  loadProfessors(): Professor[];
  saveProfessors(professors: Professor[]): void;

  loadPensum(): Semester[];
  savePensum(pensum: Semester[]): void;

  loadAcademicLoad(): AcademicLoad;
  saveAcademicLoad(load: AcademicLoad): void;

  loadScheduleBlocks(): ScheduleBlockData[];
  saveScheduleBlocks(blocks: ScheduleBlockData[]): void;

  loadLogs(): LogEntry[];
  saveLogs(logs: LogEntry[]): void;
}
