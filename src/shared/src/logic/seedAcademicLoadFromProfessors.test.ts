import { describe, it, expect } from 'vitest';
import { seedAcademicLoadFromProfessors } from './seedAcademicLoadFromProfessors';

describe('seedAcademicLoadFromProfessors (#fix "sin rol")', () => {
  it('siembra el rol de un profesor importado (materias pero sin carga)', () => {
    const profs = [{ id: 'p1', type: 'both' as const, subjects: ['MAT1', 'FIS1'] }];
    const load = seedAcademicLoadFromProfessors({}, profs, new Set(['MAT1'])); // MAT1 tiene lab
    expect(load.MAT1.theory).toContain('p1');
    expect(load.MAT1.lab).toContain('p1');         // ambos + tiene lab
    expect(load.FIS1.theory).toContain('p1');
    expect(load.FIS1.lab ?? []).not.toContain('p1'); // FIS1 sin lab → no lab
  });

  it('profesor de teoría → solo teoría', () => {
    const profs = [{ id: 'p2', type: 'theory' as const, subjects: ['MAT1'] }];
    const load = seedAcademicLoadFromProfessors({}, profs, new Set(['MAT1']));
    expect(load.MAT1.theory).toContain('p2');
    expect(load.MAT1.lab ?? []).not.toContain('p2');
  });

  it('es idempotente: no duplica si ya está', () => {
    const profs = [{ id: 'p1', type: 'both' as const, subjects: ['MAT1'] }];
    const once = seedAcademicLoadFromProfessors({}, profs, new Set(['MAT1']));
    const twice = seedAcademicLoadFromProfessors(once, profs, new Set(['MAT1']));
    expect(twice.MAT1.theory).toEqual(['p1']);
  });

  it('respeta a otros profesores ya cargados (solo agrega)', () => {
    const load0 = { MAT1: { theory: ['otro'], lab: [] } };
    const profs = [{ id: 'p1', type: 'theory' as const, subjects: ['MAT1'] }];
    const load = seedAcademicLoadFromProfessors(load0, profs, new Set(['MAT1']));
    expect(load.MAT1.theory).toEqual(['otro', 'p1']);
  });

  it('ignora profesores sin materias', () => {
    const profs = [{ id: 'p3', type: 'both' as const, subjects: [] as string[] }];
    expect(seedAcademicLoadFromProfessors({}, profs, new Set())).toEqual({});
  });

  it('NO re-siembra un rol que el usuario quitó por toggle (respeta lo ya cargado)', () => {
    // p1 ("ambos") en MAT1 (con lab); el usuario dejó solo lab y quitó teoría.
    // El seed NO debe re-agregar teoría: ya tiene presencia, es decisión explícita.
    const load0 = { MAT1: { theory: [] as string[], lab: ['p1'] } };
    const profs = [{ id: 'p1', type: 'both' as const, subjects: ['MAT1'] }];
    const out = seedAcademicLoadFromProfessors(load0, profs, new Set(['MAT1']));
    expect(out.MAT1.theory).toEqual([]); // no re-añade teoría
    expect(out.MAT1.lab).toEqual(['p1']);
  });

  it('un profesor "unassigned" (sin tipo) no recibe rol', () => {
    const profs = [{ id: 'p9', type: 'unassigned' as const, subjects: ['MAT1'] }];
    const out = seedAcademicLoadFromProfessors({}, profs, new Set(['MAT1']));
    expect(out.MAT1?.theory ?? []).not.toContain('p9');
    expect(out.MAT1?.lab ?? []).not.toContain('p9');
  });
});
