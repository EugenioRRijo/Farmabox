import { describe, it, expect } from 'vitest';
import { rowToSuggestion, suggestionToRow, newSuggestion, type AppSuggestion } from './suggestions';

const base: AppSuggestion = {
  id: 'sug-1',
  kind: 'error',
  body: 'La exportación falla',
  author: 'Ana',
  createdAt: '2026-08-04T10:00:00.000Z',
  updatedAt: '2026-08-04T10:00:00.000Z',
  resolvedAt: null,
  deletedAt: null,
};

describe('suggestions logic', () => {
  it('mapea fila↔objeto', () => {
    const row = suggestionToRow(base);
    expect(row.created_at).toBe(base.createdAt);
    expect(rowToSuggestion(row)).toEqual(base);
  });

  it('newSuggestion: id sug-*, recorta y sella; author vacío → null', () => {
    const s = newSuggestion('improvement', '  más colores  ', '   ', '2026-08-04T12:00:00.000Z');
    expect(s.id).toMatch(/^sug-/);
    expect(s.kind).toBe('improvement');
    expect(s.body).toBe('más colores');
    expect(s.author).toBeNull();
    expect(s.createdAt).toBe('2026-08-04T12:00:00.000Z');
    expect(s.resolvedAt).toBeNull();
  });
});
