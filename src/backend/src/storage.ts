import * as fs from 'fs';
import * as path from 'path';
import { PROFESSORS_DATA, Professor, PENSUM_DATA, Semester } from '../../shared/src/index';
import { AcademicLoad, ScheduleBlockData, CourseInfoData } from './types';

const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJSON<T>(filename: string, fallback: T): T {
  ensureDataDir();
  const filepath = path.join(DATA_DIR, filename);
  if (fs.existsSync(filepath)) {
    try {
      const raw = fs.readFileSync(filepath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function saveJSON<T>(filename: string, data: T): void {
  ensureDataDir();
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

// ── Professors ─────────────────────────────────────────
export function loadProfessors(): Professor[] {
  return loadJSON<Professor[]>('professors.json', PROFESSORS_DATA);
}

export function saveProfessors(professors: Professor[]): void {
  saveJSON('professors.json', professors);
}

// ── Pensum (semesters + subjects) ──────────────────────
export function loadPensum(): Semester[] {
  return loadJSON<Semester[]>('pensum.json', PENSUM_DATA);
}

export function savePensum(pensum: Semester[]): void {
  saveJSON('pensum.json', pensum);
}

// ── Academic Load ──────────────────────────────────────
export function loadAcademicLoad(): AcademicLoad {
  return loadJSON<AcademicLoad>('academic-load.json', {});
}

export function saveAcademicLoad(load: AcademicLoad): void {
  saveJSON('academic-load.json', load);
}

// ── Schedule Blocks ────────────────────────────────────
export function loadScheduleBlocks(): ScheduleBlockData[] {
  return loadJSON<ScheduleBlockData[]>('schedule-blocks.json', []);
}

export function saveScheduleBlocks(blocks: ScheduleBlockData[]): void {
  saveJSON('schedule-blocks.json', blocks);
}

// ── Course Info (Per Section) ──────────────────────────
export function loadCourseInfo(): CourseInfoData {
  return loadJSON<CourseInfoData>('course-info.json', {});
}

export function saveCourseInfo(info: CourseInfoData): void {
  saveJSON('course-info.json', info);
}

// ── Logs / Reports ─────────────────────────────────────
export interface LogEntry {
  id: string;
  action: string;
  details: string;
  timestamp: string;
}

export function loadLogs(): LogEntry[] {
  return loadJSON<LogEntry[]>('logs.json', []);
}

export function saveLogs(logs: LogEntry[]): void {
  saveJSON('logs.json', logs);
}
