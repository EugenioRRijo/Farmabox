/**
 * professorSchedule — Lógica PURA del horario semanal de UN profesor.
 *
 * Es la fuente de verdad compartida entre la vista en pantalla
 * (ProfessorScheduleGrid) y el PDF docente (PdfExportService.buildProfessorPage),
 * para que se vean idénticos. Consolida TODAS las clases del profesor (todos los
 * semestres y secciones) en una sola semana y reparte en columnas las clases que
 * caen en la misma franja (choques), sin ocultar ninguna.
 */
import type { ScheduleBlock } from '@/types/schedule';
import type { PensumSubject } from '../../../shared/src/index';

export interface ProfWeekCell {
  block: ScheduleBlock;
  /** Nombre de la materia (o el código si no está en el pensum). */
  name: string;
  /** Aula de teoría (si la materia la tiene). */
  aula?: string;
  isLab: boolean;
  /** Columna asignada dentro del día (para repartir choques lado a lado). */
  col: number;
  /** Total de columnas usadas ese día (ancho = 100/colCount %). */
  colCount: number;
}

export interface ProfessorWeek {
  /** Lista para el encabezado: "Nombre (T-L) (sem°sec)". */
  subjects: string[];
  /** Suma de las duraciones de todos sus bloques. */
  totalHours: number;
  /** Celdas por día, índice 0..4 = Lunes..Viernes. */
  days: ProfWeekCell[][];
}

/** Materias que dicta el profesor, formateadas "Nombre (T-L) (sem°sec)". */
export function professorSubjectsList(
  professorId: string,
  blocks: ScheduleBlock[],
  subjects: PensumSubject[],
): string[] {
  const byCode = new Map(subjects.map((s) => [s.code, s]));
  const map = new Map<string, { name: string; t: boolean; l: boolean; sem?: number; sec?: string }>();
  for (const b of blocks) {
    if (b.professorId !== professorId) continue;
    let e = map.get(b.subjectCode);
    if (!e) {
      e = {
        name: byCode.get(b.subjectCode)?.name ?? b.subjectCode,
        t: false,
        l: false,
        sem: b.semester,
        sec: b.section,
      };
      map.set(b.subjectCode, e);
    }
    if (b.type === 'LAB') e.l = true;
    else e.t = true;
  }
  return [...map.values()].map(
    (s) => `${s.name} (${s.t && s.l ? 'T-L' : s.l ? 'L' : 'T'}) (${s.sem ?? '?'}°${s.sec ?? 'A'})`,
  );
}

/** Total de horas semanales del profesor (suma de duraciones de sus bloques). */
export function professorWeeklyHours(professorId: string, blocks: ScheduleBlock[]): number {
  return blocks
    .filter((b) => b.professorId === professorId)
    .reduce((sum, b) => sum + (b.duration || 0), 0);
}

/** Texto de la celda como en el PDF: teoría "Nombre / Aula X"; lab "Laboratorio / Nombre". */
export function blockCellText(block: ScheduleBlock, subjects: PensumSubject[]): string {
  const s = subjects.find((x) => x.code === block.subjectCode);
  const nm = s?.name ?? block.subjectCode;
  // Salón por bloque (block.aula) con prioridad; si no, el aula de la materia (teoría).
  const room = block.aula ?? (block.type === 'LAB' ? undefined : s?.aula);
  return block.type === 'LAB'
    ? `Laboratorio\n${nm}${block.aula ? '\n' + block.aula : ''}`
    : `${nm}\nAula${room ? ' ' + room : ''}`;
}

/**
 * Reparte en columnas los bloques de un día: dos clases que se solapan en el tiempo
 * van en columnas distintas (lado a lado). Empaquetado por intervalos (greedy).
 */
function assignColumns(
  dayBlocks: ScheduleBlock[],
): { block: ScheduleBlock; col: number; colCount: number }[] {
  const sorted = [...dayBlocks].sort((a, b) => a.startHour - b.startHour || b.duration - a.duration);
  const colEnds: number[] = []; // fin (startHour+duration) del último bloque de cada columna
  const placed = sorted.map((b) => {
    const end = b.startHour + b.duration;
    let col = colEnds.findIndex((e) => e <= b.startHour);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(end);
    } else {
      colEnds[col] = end;
    }
    return { block: b, col };
  });
  const colCount = colEnds.length || 1;
  return placed.map((p) => ({ ...p, colCount }));
}

/** Construye la semana consolidada del profesor (todas sus clases, todos los semestres). */
export function buildProfessorWeek(
  professorId: string,
  blocks: ScheduleBlock[],
  subjects: PensumSubject[],
): ProfessorWeek {
  const byCode = new Map(subjects.map((s) => [s.code, s]));
  const mine = blocks.filter((b) => b.professorId === professorId);
  const days: ProfWeekCell[][] = [[], [], [], [], []];
  for (let d = 0; d < 5; d++) {
    days[d] = assignColumns(mine.filter((b) => b.day === d)).map(({ block, col, colCount }) => {
      const s = byCode.get(block.subjectCode);
      return {
        block,
        name: s?.name ?? block.subjectCode,
        aula: s?.aula,
        isLab: block.type === 'LAB',
        col,
        colCount,
      };
    });
  }
  return {
    subjects: professorSubjectsList(professorId, blocks, subjects),
    totalHours: professorWeeklyHours(professorId, blocks),
    days,
  };
}
