import { describe, it, expect } from 'vitest';
import {
  normalizeSubjectName,
  normalizeType,
  isLabMarked,
  detectNaturalColumns,
  mapGroupedList,
  type SubjectLite,
} from './professorImport';

const CATALOG: SubjectLite[] = [
  { code: '3307047105', name: 'Metodología de la Investigación', hasLab: false },
  { code: '3307057103', name: 'Diseño de Proyectos I', hasLab: false },
  { code: '3307095101', name: 'Bromatología I', hasLab: true },
  { code: '3307105102', name: 'Bromatología II', hasLab: true },
  { code: '3307032107', name: 'Química Orgánica I', hasLab: true },
  { code: '3307032103', name: 'Química Inorgánica I', hasLab: true },
];

describe('normalizeSubjectName', () => {
  it('quita acentos y la marca (Lab)', () => {
    expect(normalizeSubjectName('Bromatología I (Lab)')).toBe('bromatologia i');
    expect(normalizeSubjectName('Biofarmacia I (LAB)')).toBe('biofarmacia i');
    expect(normalizeSubjectName('Metodologia de la investigacion')).toBe('metodologia de la investigacion');
  });
});

describe('normalizeType', () => {
  it('reconoce TEORÍA y sus sinónimos (sin acentos/mayúsculas)', () => {
    expect(normalizeType('theory')).toBe('theory');
    expect(normalizeType('Teoría')).toBe('theory');
    expect(normalizeType('TEORIA')).toBe('theory');
    expect(normalizeType(' te ')).toBe('theory');
    expect(normalizeType('t')).toBe('theory');
  });

  it('reconoce LABORATORIO/práctica y sus sinónimos', () => {
    expect(normalizeType('practice')).toBe('practice');
    expect(normalizeType('Laboratorio')).toBe('practice');
    expect(normalizeType('laboratorios')).toBe('practice');
    expect(normalizeType('lab')).toBe('practice');
    expect(normalizeType('Práctica')).toBe('practice');
    expect(normalizeType('p')).toBe('practice');
  });

  it('reconoce AMBOS y sus sinónimos', () => {
    expect(normalizeType('both')).toBe('both');
    expect(normalizeType('Ambos')).toBe('both');
    expect(normalizeType('ambas')).toBe('both');
    expect(normalizeType('teoria-laboratorio')).toBe('both');
    expect(normalizeType('Teoría-Laboratorios')).toBe('both');
    expect(normalizeType('teoria/lab')).toBe('both');
  });

  it('devuelve null si la celda está vacía o no se reconoce (no adivina)', () => {
    expect(normalizeType('')).toBeNull();
    expect(normalizeType('   ')).toBeNull();
    expect(normalizeType(undefined as unknown as string)).toBeNull();
    expect(normalizeType('xyz')).toBeNull();
    expect(normalizeType('profesor')).toBeNull();
  });
});

describe('isLabMarked', () => {
  it('detecta (Lab)/(LAB)', () => {
    expect(isLabMarked('Bromatologia I (Lab)')).toBe(true);
    expect(isLabMarked('Biofarmacia I (LAB)')).toBe(true);
    expect(isLabMarked('Bromatologia I')).toBe(false);
  });
});

describe('detectNaturalColumns', () => {
  it('reconoce los encabezados de la lista cruda', () => {
    expect(detectNaturalColumns(['Apellido nombre', 'Unidad curricular '])).toEqual({
      nameKey: 'Apellido nombre',
      subjectKey: 'Unidad curricular ',
    });
  });
  it('devuelve null si no es ese formato', () => {
    expect(detectNaturalColumns(['fullName', 'title', 'type', 'subjects'])).toBeNull();
  });
  it('detecta la columna tipo cuando está presente (opcional)', () => {
    expect(detectNaturalColumns(['Apellido nombre', 'Unidad curricular', 'Tipo'])).toEqual({
      nameKey: 'Apellido nombre',
      subjectKey: 'Unidad curricular',
      typeKey: 'Tipo',
    });
  });
});

describe('mapGroupedList', () => {
  const rows = [
    { 'Apellido nombre': 'Alviarez Omar', 'Unidad curricular': 'Metodologia de la investigacion' },
    { 'Apellido nombre': '', 'Unidad curricular': 'Diseño de proyectos I' },
    { 'Apellido nombre': 'Figuera Romily', 'Unidad curricular': 'Bromatologia I (Lab)' },
    { 'Apellido nombre': '', 'Unidad curricular': 'Bromatologia II (Lab)' },
    { 'Apellido nombre': 'Hernandez Irene', 'Unidad curricular': 'Quimica Organica I (Lab)' },
    { 'Apellido nombre': '', 'Unidad curricular': 'Quimica Inorganica I' },
    { 'Apellido nombre': 'Paulo Luxz', 'Unidad curricular': 'Bromatologia I' },
    { 'Apellido nombre': '', 'Unidad curricular': 'Materia Inexistente' },
  ];
  const out = mapGroupedList(rows, 'Apellido nombre', 'Unidad curricular', CATALOG);

  it('rellena el nombre y agrupa las materias por profesor', () => {
    expect(out.map((p) => p.fullName)).toEqual([
      'Alviarez Omar',
      'Figuera Romily',
      'Hernandez Irene',
      'Paulo Luxz',
    ]);
  });

  it('mapea nombres de materia a códigos', () => {
    expect(out[0].subjects).toEqual(['3307047105', '3307057103']);
    expect(out[1].subjects).toEqual(['3307095101', '3307105102']);
  });

  it('deduce el tipo: solo lab → practice', () => {
    expect(out[1].type).toBe('practice'); // Figuera: ambas (Lab)
  });

  it('deduce el tipo: lab + teoría → both', () => {
    expect(out[2].type).toBe('both'); // Hernandez: Orgánica (Lab) + Inorgánica (sin marca)
    expect(out[2].subjects).toEqual(['3307032107', '3307032103']);
  });

  it('deduce el tipo: sin marca de lab → theory', () => {
    expect(out[0].type).toBe('theory');
    expect(out[3].type).toBe('theory'); // Paulo: Bromatología I (sin marca)
  });

  it('reporta materias no encontradas en unmatched (no las inventa)', () => {
    expect(out[3].unmatched).toEqual(['Materia Inexistente']);
    expect(out[3].subjects).toEqual(['3307095101']);
  });
});

describe('mapGroupedList con columna tipo (tipo manda, (Lab) es respaldo)', () => {
  it('el tipo explícito de la fila del profesor gana sobre la marca (Lab)', () => {
    const rows = [
      // Alpha: tipo "teoria" aunque la materia esté marcada (Lab) → manda el tipo.
      { Nombre: 'Alpha', Materia: 'Bromatologia I (Lab)', tipo: 'teoria' },
      // Beta: sin tipo → cae al respaldo (Lab) → practice.
      { Nombre: 'Beta', Materia: 'Quimica Organica I (Lab)', tipo: '' },
    ];
    const out = mapGroupedList(rows, 'Nombre', 'Materia', CATALOG, 'tipo');
    expect(out[0].type).toBe('theory'); // tipo manda
    expect(out[1].type).toBe('practice'); // respaldo (Lab)
  });

  it('sin columna tipo se comporta como antes (deduce por (Lab))', () => {
    const rows = [{ Nombre: 'Gamma', Materia: 'Bromatologia I (Lab)' }];
    const out = mapGroupedList(rows, 'Nombre', 'Materia', CATALOG);
    expect(out[0].type).toBe('practice');
  });
});
