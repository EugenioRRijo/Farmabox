import { describe, it, expect } from 'vitest';
import { restampBlocksFromLoad } from './restampBlocksFromLoad';

describe('restampBlocksFromLoad', () => {
  it('stamps a theory block with the first theory professor of its subject', () => {
    const blocks = [{ id: 'b1', subjectCode: 'MAT', type: 'THEORY' as const, professorId: undefined }];
    const load = { MAT: { theory: ['p-theory'], lab: ['p-lab'] } };
    const res = restampBlocksFromLoad(blocks, load);
    expect(res[0].professorId).toBe('p-theory');
  });

  it('stamps a lab block with the first lab professor of its subject', () => {
    const blocks = [{ id: 'b1', subjectCode: 'MAT', type: 'LAB' as const, professorId: undefined }];
    const load = { MAT: { theory: ['p-theory'], lab: ['p-lab'] } };
    const res = restampBlocksFromLoad(blocks, load);
    expect(res[0].professorId).toBe('p-lab');
  });

  it('treats a block with no type as theory', () => {
    const blocks = [{ id: 'b1', subjectCode: 'MAT', professorId: undefined }];
    const load = { MAT: { theory: ['p-theory'], lab: ['p-lab'] } };
    const res = restampBlocksFromLoad(blocks, load);
    expect(res[0].professorId).toBe('p-theory');
  });

  it('clears the professor when the role has nobody assigned', () => {
    const blocks = [{ id: 'b1', subjectCode: 'MAT', type: 'THEORY' as const, professorId: 'old' }];
    const load = { MAT: { theory: [], lab: ['p-lab'] } };
    const res = restampBlocksFromLoad(blocks, load);
    expect(res[0].professorId).toBeUndefined();
  });

  it('clears the professor when the subject is missing from the load', () => {
    const blocks = [{ id: 'b1', subjectCode: 'OTHER', type: 'THEORY' as const, professorId: 'old' }];
    const load = { MAT: { theory: ['p-theory'] } };
    const res = restampBlocksFromLoad(blocks, load);
    expect(res[0].professorId).toBeUndefined();
  });

  it('picks the first professor when the role has several', () => {
    const blocks = [{ id: 'b1', subjectCode: 'MAT', type: 'THEORY' as const, professorId: undefined }];
    const load = { MAT: { theory: ['p1', 'p2', 'p3'] } };
    const res = restampBlocksFromLoad(blocks, load);
    expect(res[0].professorId).toBe('p1');
  });

  it('returns the same block reference when nothing changes (idempotent)', () => {
    const blocks = [{ id: 'b1', subjectCode: 'MAT', type: 'THEORY' as const, professorId: 'p1' }];
    const load = { MAT: { theory: ['p1'] } };
    const res = restampBlocksFromLoad(blocks, load);
    expect(res[0]).toBe(blocks[0]);
  });

  it('does not mutate the input blocks', () => {
    const blocks = [{ id: 'b1', subjectCode: 'MAT', type: 'THEORY' as const, professorId: 'old' }];
    restampBlocksFromLoad(blocks, { MAT: { theory: ['new'] } });
    expect(blocks[0].professorId).toBe('old');
  });

  it('preserves other block fields when re-stamping', () => {
    const blocks = [
      { id: 'b1', subjectCode: 'MAT', type: 'LAB' as const, professorId: undefined, day: 2, startHour: 9 },
    ];
    const res = restampBlocksFromLoad(blocks, { MAT: { lab: ['p-lab'] } });
    expect(res[0]).toMatchObject({ id: 'b1', day: 2, startHour: 9, professorId: 'p-lab' });
  });
});
