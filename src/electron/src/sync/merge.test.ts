import { describe, it, expect } from 'vitest';
import { mergeKeyed, mergeMaps } from './merge';

describe('mergeKeyed — sincronización multi-PC', () => {
  it('UNE ítems nuevos de ambos lados sin perder ninguno (bug ALTA original)', () => {
    // PC-A creó b1 offline; PC-B creó b2 offline. Antes: una pisaba a la otra.
    const local = [{ id: 'b1', updatedAt: '2026-01-01T00:00:00.000Z' }];
    const remote = [{ id: 'b2', updatedAt: '2026-01-01T00:00:00.000Z' }];
    const merged = mergeKeyed(local, remote, (b) => b.id);
    expect(merged.map((b) => b.id).sort()).toEqual(['b1', 'b2']);
  });

  it('en conflicto del mismo id, gana el updatedAt más reciente', () => {
    const local = [{ id: 'b1', v: 'local', updatedAt: '2026-02-01T00:00:00.000Z' }];
    const remote = [{ id: 'b1', v: 'remote', updatedAt: '2026-01-01T00:00:00.000Z' }];
    const merged = mergeKeyed(local, remote, (b) => b.id);
    expect(merged).toHaveLength(1);
    expect(merged[0].v).toBe('local');
  });

  it('respeta tombstones: un borrado más nuevo elimina el ítem del resultado', () => {
    const local = [{ id: 'b1', deletedAt: '2026-03-01T00:00:00.000Z' }];
    const remote = [{ id: 'b1', v: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }];
    const merged = mergeKeyed(local, remote, (b) => b.id);
    expect(merged).toHaveLength(0);
  });

  it('una edición posterior gana sobre un borrado anterior (resurrección intencional)', () => {
    const local = [{ id: 'b1', v: 'edit', updatedAt: '2026-04-01T00:00:00.000Z' }];
    const remote = [{ id: 'b1', deletedAt: '2026-03-01T00:00:00.000Z' }];
    const merged = mergeKeyed(local, remote, (b) => b.id);
    expect(merged).toHaveLength(1);
    expect(merged[0].v).toBe('edit');
  });
});

describe('mergeMaps — academic-load por materia', () => {
  it('une claves de ambos lados', () => {
    const local = { MAT1: { v: 'a', updatedAt: '2026-01-01T00:00:00.000Z' } };
    const remote = { MAT2: { v: 'b', updatedAt: '2026-01-01T00:00:00.000Z' } };
    const merged = mergeMaps(local, remote, (x) => x.updatedAt);
    expect(Object.keys(merged).sort()).toEqual(['MAT1', 'MAT2']);
  });

  it('en conflicto de clave, gana el más reciente', () => {
    const local = { MAT1: { v: 'nuevo', updatedAt: '2026-05-01T00:00:00.000Z' } };
    const remote = { MAT1: { v: 'viejo', updatedAt: '2026-01-01T00:00:00.000Z' } };
    const merged = mergeMaps(local, remote, (x) => x.updatedAt);
    expect(merged.MAT1.v).toBe('nuevo');
  });
});
