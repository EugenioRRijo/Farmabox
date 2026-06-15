import { describe, it, expect } from 'vitest';
import {
  professorSubjectsList,
  professorWeeklyHours,
  blockCellText,
  buildProfessorWeek,
} from './professorSchedule';
import type { ScheduleBlock } from '@/types/schedule';
import type { PensumSubject } from '../../../shared/src/index';

// ── Fixtures mínimos ────────────────────────────────────────────────────────
const subj = (over: Partial<PensumSubject> & { code: string; name: string }): PensumSubject => ({
  credits: 0,
  hasLab: false,
  hoursTheory: 0,
  hoursLab: 0,
  prerequisites: [],
  ...over,
});

const block = (over: Partial<ScheduleBlock> & { id: string }): ScheduleBlock => ({
  subjectCode: 'MAT1',
  day: 0,
  startHour: 0,
  duration: 1,
  color: '#ccc',
  ...over,
});

const SUBJECTS: PensumSubject[] = [
  subj({ code: 'FAR1', name: 'Farmacología', aula: '209' }),
  subj({ code: 'QUI1', name: 'Química Orgánica', hasLab: true, aula: '210' }),
];

describe('professorSubjectsList', () => {
  it('formatea teoría como "Nombre (T) (sem°sec)"', () => {
    const blocks = [block({ id: 'b1', subjectCode: 'FAR1', type: 'THEORY', semester: 3, section: 'A', professorId: 'p1' })];
    expect(professorSubjectsList('p1', blocks, SUBJECTS)).toEqual(['Farmacología (T) (3°A)']);
  });

  it('marca T-L cuando el profe da teoría y laboratorio de la misma materia', () => {
    const blocks = [
      block({ id: 'b1', subjectCode: 'QUI1', type: 'THEORY', semester: 3, section: 'A', professorId: 'p1' }),
      block({ id: 'b2', subjectCode: 'QUI1', type: 'LAB', semester: 3, section: 'A', professorId: 'p1', day: 1 }),
    ];
    expect(professorSubjectsList('p1', blocks, SUBJECTS)).toEqual(['Química Orgánica (T-L) (3°A)']);
  });

  it('solo incluye materias del profesor pedido', () => {
    const blocks = [
      block({ id: 'b1', subjectCode: 'FAR1', type: 'THEORY', semester: 3, section: 'A', professorId: 'p1' }),
      block({ id: 'b2', subjectCode: 'QUI1', type: 'THEORY', semester: 3, section: 'A', professorId: 'p2' }),
    ];
    expect(professorSubjectsList('p1', blocks, SUBJECTS)).toEqual(['Farmacología (T) (3°A)']);
  });
});

describe('professorWeeklyHours', () => {
  it('suma las duraciones de los bloques del profesor', () => {
    const blocks = [
      block({ id: 'b1', professorId: 'p1', duration: 2 }),
      block({ id: 'b2', professorId: 'p1', duration: 3, day: 1 }),
      block({ id: 'b3', professorId: 'p2', duration: 5, day: 2 }),
    ];
    expect(professorWeeklyHours('p1', blocks)).toBe(5);
  });
});

describe('blockCellText', () => {
  it('teoría → "Nombre / Aula X"', () => {
    const b = block({ id: 'b1', subjectCode: 'FAR1', type: 'THEORY' });
    expect(blockCellText(b, SUBJECTS)).toBe('Farmacología\nAula 209');
  });

  it('laboratorio → "Laboratorio / Nombre"', () => {
    const b = block({ id: 'b1', subjectCode: 'QUI1', type: 'LAB' });
    expect(blockCellText(b, SUBJECTS)).toBe('Laboratorio\nQuímica Orgánica');
  });

  it('sin materia en el pensum usa el código como nombre', () => {
    const b = block({ id: 'b1', subjectCode: 'ZZZ', type: 'THEORY' });
    expect(blockCellText(b, SUBJECTS)).toBe('ZZZ\nAula');
  });
});

describe('buildProfessorWeek', () => {
  it('ubica los bloques del profesor por día y suma horas/materias', () => {
    const blocks = [
      block({ id: 'b1', subjectCode: 'FAR1', type: 'THEORY', day: 0, startHour: 1, duration: 2, semester: 3, section: 'A', professorId: 'p1' }),
      block({ id: 'b2', subjectCode: 'QUI1', type: 'LAB', day: 2, startHour: 4, duration: 2, semester: 3, section: 'A', professorId: 'p1' }),
      block({ id: 'bX', subjectCode: 'FAR1', type: 'THEORY', day: 0, startHour: 1, duration: 2, professorId: 'p2' }),
    ];
    const week = buildProfessorWeek('p1', blocks, SUBJECTS);

    expect(week.days).toHaveLength(5);
    expect(week.days[0].map(c => c.block.id)).toEqual(['b1']); // no incluye los de p2
    expect(week.days[1]).toEqual([]);
    expect(week.days[2].map(c => c.block.id)).toEqual(['b2']);
    expect(week.totalHours).toBe(4);
    expect(week.subjects).toEqual(['Farmacología (T) (3°A)', 'Química Orgánica (L) (3°A)']);
  });

  it('sin choques, cada día usa una sola columna (ancho completo)', () => {
    const blocks = [
      block({ id: 'b1', day: 0, startHour: 1, duration: 1, professorId: 'p1' }),
      block({ id: 'b2', day: 0, startHour: 3, duration: 1, professorId: 'p1' }),
    ];
    const week = buildProfessorWeek('p1', blocks, SUBJECTS);
    expect(week.days[0].every(c => c.colCount === 1 && c.col === 0)).toBe(true);
  });

  it('dos clases que se solapan en el mismo día → 2 columnas con índices distintos', () => {
    const blocks = [
      block({ id: 'b1', subjectCode: 'FAR1', day: 0, startHour: 1, duration: 2, professorId: 'p1' }),
      block({ id: 'b2', subjectCode: 'QUI1', day: 0, startHour: 1, duration: 2, professorId: 'p1' }),
    ];
    const week = buildProfessorWeek('p1', blocks, SUBJECTS);
    expect(week.days[0]).toHaveLength(2);
    expect(week.days[0].every(c => c.colCount === 2)).toBe(true);
    expect(new Set(week.days[0].map(c => c.col))).toEqual(new Set([0, 1]));
  });
});
