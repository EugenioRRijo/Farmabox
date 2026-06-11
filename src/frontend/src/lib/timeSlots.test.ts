import { describe, it, expect } from 'vitest';
import { slotLabel, turnoForSemester, defaultWindowForTurno, MIN_SLOT } from './timeSlots';

describe('slotLabel', () => {
  it('coincide con las etiquetas actuales de mañana/tarde', () => {
    expect(slotLabel(0)).toBe('7:00-7:45');
    expect(slotLabel(7)).toBe('12:15-1:00');
    expect(slotLabel(8)).toBe('1:00-1:45');
    expect(slotLabel(15)).toBe('6:15-7:00');
  });
  it('genera la noche (índices >= 16) sin tope', () => {
    expect(slotLabel(16)).toBe('7:00-7:45'); // 7:00 PM (el orden de filas desambigua)
    expect(slotLabel(17)).toBe('7:45-8:30'); // contiene las 8:00 PM
    expect(slotLabel(20)).toBe('10:00-10:45');
  });
});

describe('turnoForSemester', () => {
  it('1-4 Diurno, 5-10 Vespertino', () => {
    expect(turnoForSemester(1)).toBe('Diurno');
    expect(turnoForSemester(4)).toBe('Diurno');
    expect(turnoForSemester(5)).toBe('Vespertino');
    expect(turnoForSemester(10)).toBe('Vespertino');
  });
});

describe('defaultWindowForTurno', () => {
  it('Diurno 0-7 (7am-1pm), Vespertino 8-17 (1pm-8:30pm)', () => {
    expect(defaultWindowForTurno('Diurno')).toEqual({ start: 0, end: 7 });
    expect(defaultWindowForTurno('Vespertino')).toEqual({ start: 8, end: 17 });
  });
  it('MIN_SLOT es 0 (piso 7am)', () => {
    expect(MIN_SLOT).toBe(0);
  });
});
