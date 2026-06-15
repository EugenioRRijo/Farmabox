/**
 * Integración #1: "asigno un profesor a una materia en Profesores → el horario lo
 * muestra". Verifica la cadena real:
 *   reconcileProfessorLoad (al asignar la materia, define la carga por tipo)
 *     → restampBlocksFromLoad (cada bloque toma su profesor de la carga).
 *
 * Es la única vía de asignación tras quitar los toggles (#4): basta agregar la
 * materia al profesor y el bloque del horario queda vinculado.
 */
import { describe, it, expect } from 'vitest';
import { reconcileProfessorLoad } from './reconcileProfessorLoad';
import { restampBlocksFromLoad } from './restampBlocksFromLoad';

type Block = { id: string; subjectCode: string; type?: 'THEORY' | 'LAB'; professorId?: string };

describe('asignar profesor en Profesores → el horario lo muestra (#1)', () => {
  it('profesor "ambos": sus bloques de teoría Y de lab toman su id', () => {
    const prof = { id: 'p1', type: 'both' as const, subjects: ['MAT1'] };
    const load = reconcileProfessorLoad({}, prof, [], new Set(['MAT1']));

    const blocks: Block[] = [
      { id: 'b-teo', subjectCode: 'MAT1', type: 'THEORY' },
      { id: 'b-lab', subjectCode: 'MAT1', type: 'LAB' },
    ];
    const stamped = restampBlocksFromLoad(blocks, load);

    expect(stamped.find((b) => b.id === 'b-teo')!.professorId).toBe('p1');
    expect(stamped.find((b) => b.id === 'b-lab')!.professorId).toBe('p1');
  });

  it('profesor de "teoría": toma los bloques de teoría, NO los de lab', () => {
    const prof = { id: 'p2', type: 'theory' as const, subjects: ['MAT1'] };
    const load = reconcileProfessorLoad({}, prof, [], new Set(['MAT1']));

    const blocks: Block[] = [
      { id: 'b-teo', subjectCode: 'MAT1', type: 'THEORY' },
      { id: 'b-lab', subjectCode: 'MAT1', type: 'LAB' },
    ];
    const stamped = restampBlocksFromLoad(blocks, load);

    expect(stamped.find((b) => b.id === 'b-teo')!.professorId).toBe('p2');
    expect(stamped.find((b) => b.id === 'b-lab')!.professorId).toBeUndefined();
  });

  it('quitar la materia del profesor lo desvincula del bloque', () => {
    const prof = { id: 'p1', type: 'both' as const, subjects: ['MAT1'] };
    const load = reconcileProfessorLoad({}, prof, [], new Set(['MAT1']));
    const blocks: Block[] = [{ id: 'b-teo', subjectCode: 'MAT1', type: 'THEORY', professorId: 'p1' }];
    expect(restampBlocksFromLoad(blocks, load)[0].professorId).toBe('p1');

    // Ahora el profesor deja de dictar MAT1 (prevSubjects tenía MAT1, ahora vacío).
    const profSin = { id: 'p1', type: 'both' as const, subjects: [] as string[] };
    const load2 = reconcileProfessorLoad(load, profSin, ['MAT1'], new Set(['MAT1']));
    expect(restampBlocksFromLoad(blocks, load2)[0].professorId).toBeUndefined();
  });
});
