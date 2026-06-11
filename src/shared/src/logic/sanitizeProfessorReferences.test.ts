import { describe, it, expect } from 'vitest';
import { sanitizeProfessorReferences } from './sanitizeProfessorReferences';

describe('sanitizeProfessorReferences', () => {
  it('clears professorId on blocks whose professor no longer exists ("libera" la clase)', () => {
    const blocks = [
      { id: 'b1', professorId: 'prof-live' },
      { id: 'b2', professorId: 'prof-ghost' },
      { id: 'b3' },
    ];
    const res = sanitizeProfessorReferences(['prof-live'], {}, blocks);
    expect(res.blocks[0].professorId).toBe('prof-live');
    expect(res.blocks[1].professorId).toBeUndefined();
    expect(res.blocks[2].professorId).toBeUndefined();
  });

  it('removes ghost ids from academic load theory/lab arrays', () => {
    const load = { MAT: { theory: ['prof-live', 'prof-ghost'], lab: ['prof-ghost'] } };
    const res = sanitizeProfessorReferences(['prof-live'], load, []);
    expect(res.academicLoad.MAT.theory).toEqual(['prof-live']);
    expect(res.academicLoad.MAT.lab).toEqual([]);
  });

  it('keeps blocks of live professors untouched (same reference)', () => {
    const blocks = [{ id: 'b1', professorId: 'prof-live' }];
    const res = sanitizeProfessorReferences(['prof-live'], {}, blocks);
    expect(res.blocks[0]).toBe(blocks[0]);
  });

  it('does not mutate the input blocks array or items', () => {
    const blocks = [{ id: 'b2', professorId: 'ghost' }];
    sanitizeProfessorReferences([], {}, blocks);
    expect(blocks[0].professorId).toBe('ghost');
  });

  it('accepts a Set of live ids', () => {
    const res = sanitizeProfessorReferences(new Set(['p1']), { X: { theory: ['p1', 'p2'] } }, []);
    expect(res.academicLoad.X.theory).toEqual(['p1']);
  });
});
