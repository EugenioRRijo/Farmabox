/**
 * Tests de normalizarSello (transporte Supabase): PostgREST devuelve offsets
 * `+00:00` mientras lo local sella con `Z` (toISOString). La comparación
 * newest-wins es LEXICOGRÁFICA: sin normalizar, el mismo instante en formatos
 * distintos caía como "local más nuevo" ("subes" fantasma en el preview).
 */
import { describe, it, expect } from 'vitest';
import { normalizarSello } from './CloudStorageService';

describe('normalizarSello — sellos de la nube a formato local (Z)', () => {
  it("convierte '+00:00' (PostgREST) al mismo instante con 'Z'", () => {
    expect(normalizarSello('2026-06-15T10:30:00+00:00')).toBe('2026-06-15T10:30:00.000Z');
  });

  it('un sello ya en formato local queda idéntico', () => {
    expect(normalizarSello('2026-06-15T10:30:00.000Z')).toBe('2026-06-15T10:30:00.000Z');
  });

  it('el mismo instante en ambos formatos compara IGUAL tras normalizar', () => {
    const local = new Date('2026-06-15T10:30:00Z').toISOString();
    const nube = normalizarSello('2026-06-15T10:30:00+00:00');
    expect(nube).toBe(local); // ni "mayor" ni "menor": el empate es empate
  });

  it('conserva los milisegundos (PostgREST manda microsegundos)', () => {
    expect(normalizarSello('2026-06-15T10:30:00.123456+00:00')).toBe(
      '2026-06-15T10:30:00.123Z',
    );
  });

  it('null / undefined / vacío → undefined (ítems sin sello)', () => {
    expect(normalizarSello(null)).toBeUndefined();
    expect(normalizarSello(undefined)).toBeUndefined();
    expect(normalizarSello('')).toBeUndefined();
  });

  it('un valor no parseable se devuelve tal cual (no rompe el pull)', () => {
    expect(normalizarSello('no-es-fecha')).toBe('no-es-fecha');
  });
});
