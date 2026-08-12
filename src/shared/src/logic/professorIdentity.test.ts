import { describe, it, expect } from 'vitest';
import { professorNameKey, cedulaKey, findProfessorIdByIdentity } from './professorIdentity';

describe('professorNameKey', () => {
  it('ignora tildes, mayúsculas, dobles espacios y orden de palabras', () => {
    expect(professorNameKey('Ángel Gutiérrez')).toBe(professorNameKey('Angel  Gutierrez'));
    expect(professorNameKey('Jimenez Zoraida')).toBe(professorNameKey('Zoraida Jiménez'));
    expect(professorNameKey('Mayra García')).toBe(professorNameKey('mayra garcia'));
  });
  it('nombres distintos NO colisionan', () => {
    expect(professorNameKey('Irene Hernandez')).not.toBe(professorNameKey('Irene Henriquez'));
  });
});

describe('cedulaKey', () => {
  it('normaliza y detecta vacío', () => {
    expect(cedulaKey('V-12.345.678')).toBe('v12345678');
    expect(cedulaKey('')).toBe('');
    expect(cedulaKey(undefined)).toBe('');
  });
});

describe('findProfessorIdByIdentity', () => {
  const existing = [
    { id: 'prof-001', fullName: 'Ángel Gutiérrez', cedula: 'V-111' },
    { id: 'prof-002', fullName: 'Zoraida Jiménez' }, // sin cédula
    { id: 'prof-003', fullName: 'Carlos Pérez', cedula: 'V-333' },
  ];

  it('fusiona por nombre (sin tilde, otro orden) cuando el entrante no trae cédula', () => {
    expect(findProfessorIdByIdentity(existing, { fullName: 'Gutierrez Angel' })).toBe('prof-001');
    expect(findProfessorIdByIdentity(existing, { fullName: 'zoraida  jimenez' })).toBe('prof-002');
  });

  it('fusiona por cédula aunque el nombre venga distinto', () => {
    expect(findProfessorIdByIdentity(existing, { fullName: 'A. Gutierrez', cedula: 'V-1-1-1' })).toBe('prof-001');
  });

  it('NO fusiona dos personas con cédulas distintas (homónimos reales)', () => {
    // mismo nombre que prof-003 pero otra cédula → nuevo
    expect(findProfessorIdByIdentity(existing, { fullName: 'Carlos Pérez', cedula: 'V-999' })).toBeUndefined();
  });

  it('homónimo sin cédula: entrante con cédula fusiona con el existente sin cédula', () => {
    expect(findProfessorIdByIdentity(existing, { fullName: 'Zoraida Jimenez', cedula: 'V-222' })).toBe('prof-002');
  });

  it('id explícito existente manda', () => {
    expect(findProfessorIdByIdentity(existing, { id: 'prof-003', fullName: 'otro' })).toBe('prof-003');
  });

  it('profesor genuinamente nuevo → undefined', () => {
    expect(findProfessorIdByIdentity(existing, { fullName: 'Nuevo Docente', cedula: 'V-555' })).toBeUndefined();
    expect(findProfessorIdByIdentity(existing, { fullName: '' })).toBeUndefined();
  });
});
