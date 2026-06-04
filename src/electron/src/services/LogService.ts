/**
 * LogService — Registro de auditoría de acciones del sistema.
 */
import type { LogEntry } from '../types';
import type { IStorageService } from './IStorageService';

export class LogService {
  constructor(private readonly storage: IStorageService) {}

  getAll(): LogEntry[] {
    return this.storage.loadLogs();
  }

  create(action: string, details: string): LogEntry {
    const logs = this.storage.loadLogs();
    const newLog: LogEntry = {
      id: `log-${Date.now()}`,
      action,
      details,
      timestamp: new Date().toISOString(),
    };
    logs.unshift(newLog);
    this.storage.saveLogs(logs);
    return newLog;
  }
}
