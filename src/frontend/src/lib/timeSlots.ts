/**
 * timeSlots — Bloques de la grilla de horario generados por fórmula.
 * Bloque i = 7:00 AM + 45·i min. Reemplaza las listas TIME_SLOTS fijas
 * (antes duplicadas en 3 componentes) y permite extender sin tope (noche).
 */
const DAY_START_MIN = 7 * 60; // 7:00 AM
const SLOT_MIN = 45;

export type Turno = 'Diurno' | 'Vespertino';

/** Minutos del día (desde medianoche) → "h:mm" en 12h sin AM/PM (como el formato actual). */
function fmt(totalMin: number): string {
  const h24 = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  const h12 = ((h24 + 11) % 12) + 1; // 0->12, 13->1, 19->7 ...
  return `${h12}:${m.toString().padStart(2, '0')}`;
}

/** Etiqueta "inicio-fin" del bloque i (i >= 0). Ej: slotLabel(0) === "7:00-7:45". */
export function slotLabel(i: number): string {
  const start = DAY_START_MIN + i * SLOT_MIN;
  return `${fmt(start)}-${fmt(start + SLOT_MIN)}`;
}

/** Turno derivado del semestre: 1-4 Diurno, 5-10 Vespertino. */
export function turnoForSemester(n: number): Turno {
  return n <= 4 ? 'Diurno' : 'Vespertino';
}

/** Ventana de bloques visible por defecto según el turno (índices inclusive). */
export function defaultWindowForTurno(t: Turno): { start: number; end: number } {
  return t === 'Diurno' ? { start: 0, end: 7 } : { start: 8, end: 17 };
}

/** Piso del día: no se permiten bloques antes de las 7:00 AM. */
export const MIN_SLOT = 0;
