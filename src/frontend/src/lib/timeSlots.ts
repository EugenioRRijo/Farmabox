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

/**
 * Ventana de bloques visible por defecto según el turno (índices inclusive).
 * Diurno arranca 7:00 AM (slot 0) y llega hasta las 6:00 PM (slot 14 = franja
 * 5:30–6:15, que cubre las 6 de la tarde) por pedido: al crear, la hoja muestra el
 * día completo de mañana–tarde. Los botones +45/−45 permiten extender o recortar
 * (las filas vacías se pueden colapsar; un bloque más tardío auto-expande la grilla).
 */
export function defaultWindowForTurno(t: Turno): { start: number; end: number } {
  return t === 'Diurno' ? { start: 0, end: 14 } : { start: 8, end: 17 };
}

/** Piso del día: no se permiten bloques antes de las 7:00 AM. */
export const MIN_SLOT = 0;

/** Techo del día: la grilla NO pasa de las 10:00 PM. El bloque 19 es "9:15-10:00"
 *  (9:15 PM → 10:00 PM), así que es el último permitido (su fin = las 10 de la noche).
 *  Evita que "+45 más tarde" se pueda apretar hasta el infinito. */
export const MAX_SLOT = 19;
