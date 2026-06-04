/**
 * Tipado de la API expuesta por el preload de Electron (window.electronAPI).
 * Cada canal devuelve la envoltura { data } | { error }.
 * Si window.electronAPI es undefined → la app corre en modo web (HTTP a Express).
 */
import type {
  Professor,
  PensumSubject,
  Semester,
  AcademicLoad,
  ScheduleBlockData,
  LogEntry,
  BackupData,
  StorageInfo,
} from '../services/BackendService';

type Envelope<T> = { data: T } | { error: string };
type Ok = { success: boolean };

export interface ElectronAPI {
  getAppVersion(): Promise<string>;
  getDataPath(): Promise<string>;

  professors: {
    getAll(): Promise<Envelope<Professor[]>>;
    create(data: Omit<Professor, 'id'>): Promise<Envelope<Professor>>;
    update(id: string, data: Partial<Professor>): Promise<Envelope<Professor>>;
    delete(id: string): Promise<Envelope<Ok>>;
    reset(): Promise<Envelope<Professor[]>>;
  };

  subjects: {
    getAll(): Promise<Envelope<Semester[]>>;
    create(data: PensumSubject & { semester: number }): Promise<Envelope<PensumSubject>>;
    update(code: string, data: Partial<PensumSubject>): Promise<Envelope<PensumSubject>>;
    delete(code: string): Promise<Envelope<Ok>>;
    updateProfessors(code: string, professorIds: string[]): Promise<Envelope<Ok>>;
    resetPensum(): Promise<Envelope<Semester[]>>;
  };

  schedule: {
    getBlocks(): Promise<Envelope<ScheduleBlockData[]>>;
    saveBlocks(blocks: ScheduleBlockData[]): Promise<Envelope<Ok>>;
    getLoad(): Promise<Envelope<AcademicLoad>>;
    saveLoad(load: AcademicLoad): Promise<Envelope<Ok>>;
  };

  logs: {
    getAll(): Promise<Envelope<LogEntry[]>>;
    create(action: string, details: string): Promise<Envelope<LogEntry>>;
  };

  system: {
    restore(payload: BackupData): Promise<Envelope<{ success: boolean; message: string }>>;
  };

  chat: {
    send(
      messages: { role: 'user' | 'model'; text: string }[],
    ): Promise<Envelope<{ reply: string; offline: boolean }>>;
  };

  config: {
    getStorage(): Promise<Envelope<StorageInfo>>;
    setSharedDir(dir: string | null): Promise<Envelope<{ ok: boolean; sharedDir: string | null }>>;
    pickFolder(): Promise<Envelope<{ path: string | null }>>;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
