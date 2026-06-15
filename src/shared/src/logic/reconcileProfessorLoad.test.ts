import { describe, it, expect } from 'vitest';
import { reconcileProfessorLoad } from './reconcileProfessorLoad';

const prof = (over: Partial<{ id: string; type: 'theory' | 'practice' | 'both'; subjects: string[] }> = {}) => ({
  id: 'p1',
  type: 'both' as 'theory' | 'practice' | 'both',
  subjects: [] as string[],
  ...over,
});

describe('reconcileProfessorLoad', () => {
  it('adds a "both" professor to theory and lab of a newly assigned subject with lab', () => {
    const res = reconcileProfessorLoad({}, prof({ subjects: ['MAT'] }), [], ['MAT']);
    expect(res.MAT.theory).toEqual(['p1']);
    expect(res.MAT.lab).toEqual(['p1']);
  });

  it('adds a "both" professor only to theory when the subject has no lab', () => {
    const res = reconcileProfessorLoad({}, prof({ subjects: ['MAT'] }), [], []);
    expect(res.MAT.theory).toEqual(['p1']);
    expect(res.MAT.lab ?? []).toEqual([]);
  });

  it('adds a "theory" professor only to theory, never to lab', () => {
    const res = reconcileProfessorLoad({}, prof({ type: 'theory', subjects: ['MAT'] }), [], ['MAT']);
    expect(res.MAT.theory).toEqual(['p1']);
    expect(res.MAT.lab ?? []).toEqual([]);
  });

  it('adds a "practice" professor only to lab (when the subject has lab)', () => {
    const res = reconcileProfessorLoad({}, prof({ type: 'practice', subjects: ['MAT'] }), [], ['MAT']);
    expect(res.MAT.theory ?? []).toEqual([]);
    expect(res.MAT.lab).toEqual(['p1']);
  });

  it('does not assign a "practice" professor anywhere on a no-lab subject', () => {
    const res = reconcileProfessorLoad({}, prof({ type: 'practice', subjects: ['MAT'] }), [], []);
    expect(res.MAT?.theory ?? []).toEqual([]);
    expect(res.MAT?.lab ?? []).toEqual([]);
  });

  it('removes the professor from theory and lab of a subject no longer assigned', () => {
    const load = { MAT: { theory: ['p1', 'p2'], lab: ['p1'] } };
    const res = reconcileProfessorLoad(load, prof({ subjects: [] }), ['MAT'], ['MAT']);
    expect(res.MAT.theory).toEqual(['p2']);
    expect(res.MAT.lab).toEqual([]);
  });

  it('preserves other professors when adding', () => {
    const load = { MAT: { theory: ['p2'], lab: [] } };
    const res = reconcileProfessorLoad(load, prof({ subjects: ['MAT'] }), [], ['MAT']);
    expect(res.MAT.theory).toEqual(['p2', 'p1']);
  });

  it('leaves unchanged subjects intact (respects manual toggle state)', () => {
    // MAT is in both prev and new → untouched, even though p1 is absent from its theory.
    const load = { MAT: { theory: [], lab: ['p1'] } };
    const res = reconcileProfessorLoad(load, prof({ subjects: ['MAT'] }), ['MAT'], ['MAT']);
    expect(res.MAT.theory).toEqual([]);
    expect(res.MAT.lab).toEqual(['p1']);
  });

  it('does not duplicate the professor if already present', () => {
    const load = { MAT: { theory: ['p1'], lab: [] } };
    const res = reconcileProfessorLoad(load, prof({ type: 'theory', subjects: ['MAT'] }), [], ['MAT']);
    expect(res.MAT.theory).toEqual(['p1']);
  });

  it('does not mutate the input load', () => {
    const load = { MAT: { theory: ['p2'], lab: [] } };
    reconcileProfessorLoad(load, prof({ subjects: ['MAT'] }), [], ['MAT']);
    expect(load.MAT.theory).toEqual(['p2']);
  });
});
