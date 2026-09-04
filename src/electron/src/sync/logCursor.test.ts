import { describe, it, expect } from 'vitest';
import { nextLogCursor, LOG_CURSOR_OVERLAP_MS } from './logCursor';

const log = (timestamp: string) => ({ timestamp });

describe('nextLogCursor', () => {
  it('sin logs y sin cursor previo devuelve null (el proximo pull es completo)', () => {
    expect(nextLogCursor([], null)).toBeNull();
  });

  it('toma el sello mas nuevo del lote menos el margen de solape', () => {
    const cursor = nextLogCursor(
      [log('2026-09-04T10:00:00.000Z'), log('2026-09-04T12:00:00.000Z'), log('2026-09-04T11:00:00.000Z')],
      null,
    );
    // 12:00 menos 2 min de margen
    expect(cursor).toBe('2026-09-04T11:58:00.000Z');
  });

  it('el margen existe para tolerar relojes desfasados entre PCs', () => {
    expect(LOG_CURSOR_OVERLAP_MS).toBe(120000);
  });

  it('nunca retrocede: un lote vacio conserva el cursor previo', () => {
    const previo = '2026-09-04T11:58:00.000Z';
    expect(nextLogCursor([], previo)).toBe(previo);
  });

  it('nunca retrocede: un lote viejo no pisa un cursor mas nuevo', () => {
    const previo = '2026-09-04T11:58:00.000Z';
    expect(nextLogCursor([log('2026-09-04T09:00:00.000Z')], previo)).toBe(previo);
  });

  it('avanza cuando el lote trae algo mas nuevo que el cursor', () => {
    const previo = '2026-09-04T11:58:00.000Z';
    expect(nextLogCursor([log('2026-09-04T15:00:00.000Z')], previo)).toBe('2026-09-04T14:58:00.000Z');
  });

  it('ignora logs sin sello en vez de romper', () => {
    const cursor = nextLogCursor(
      [{ timestamp: undefined } as unknown as { timestamp: string }, log('2026-09-04T12:00:00.000Z')],
      null,
    );
    expect(cursor).toBe('2026-09-04T11:58:00.000Z');
  });

  it('normaliza el sello +00:00 de PostgREST a ISO Z para poder compararlo', () => {
    // PostgREST devuelve "+00:00"; el resto del motor compara sellos como strings ISO Z.
    expect(nextLogCursor([{ timestamp: '2026-09-04T12:00:00+00:00' }], null)).toBe(
      '2026-09-04T11:58:00.000Z',
    );
  });
});
