/**
 * StorageService — Implementación de IStorageService usando JSON en disco.
 *
 * Ruta de datos: app.getPath('userData')/data/  (persiste entre actualizaciones).
 */
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';
import { PROFESSORS_DATA, PENSUM_DATA } from '@scheduler/shared';
import type { Professor, Semester } from '@scheduler/shared';
import type { AcademicLoad, ScheduleBlockData, LogEntry } from '../types';
import type { IStorageService } from './IStorageService';

export class StorageService implements IStorageService {
  private readonly dataDir: string;

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'data');
    this.ensureDataDir();
    log.info(`[StorageService] Data directory: ${this.dataDir}`);
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private loadJSON<T>(filename: string, fallback: T): T {
    const filepath = path.join(this.dataDir, filename);
    if (fs.existsSync(filepath)) {
      try {
        return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as T;
      } catch (err) {
        log.warn(`[StorageService] Failed to parse ${filename}, using fallback:`, err);
        return fallback;
      }
    }
    return fallback;
  }

  private saveJSON<T>(filename: string, data: T): void {
    this.ensureDataDir();
    fs.writeFileSync(path.join(this.dataDir, filename), JSON.stringify(data, null, 2), 'utf-8');
  }

  loadProfessors(): Professor[] {
    return this.loadJSON<Professor[]>('professors.json', PROFESSORS_DATA);
  }
  saveProfessors(professors: Professor[]): void {
    this.saveJSON('professors.json', professors);
  }

  loadPensum(): Semester[] {
    return this.loadJSON<Semester[]>('pensum.json', PENSUM_DATA);
  }
  savePensum(pensum: Semester[]): void {
    this.saveJSON('pensum.json', pensum);
  }

  loadAcademicLoad(): AcademicLoad {
    return this.loadJSON<AcademicLoad>('academic-load.json', {});
  }
  saveAcademicLoad(load: AcademicLoad): void {
    this.saveJSON('academic-load.json', load);
  }

  loadScheduleBlocks(): ScheduleBlockData[] {
    return this.loadJSON<ScheduleBlockData[]>('schedule-blocks.json', []);
  }
  saveScheduleBlocks(blocks: ScheduleBlockData[]): void {
    this.saveJSON('schedule-blocks.json', blocks);
  }

  loadLogs(): LogEntry[] {
    return this.loadJSON<LogEntry[]>('logs.json', []);
  }
  saveLogs(logs: LogEntry[]): void {
    this.saveJSON('logs.json', logs);
  }

  getDataDir(): string {
    return this.dataDir;
  }
}
