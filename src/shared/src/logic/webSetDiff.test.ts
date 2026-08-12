import { describe, it, expect } from 'vitest';
import { diffByFingerprint, diffKeySets, blockFingerprint } from './webSetDiff';

describe('diffByFingerprint', () => {
  const fp = (x: { id: string; v: string }) => x.v;

  it('items nuevos (no vistos) van a changed', () => {
    const out = diffByFingerprint({}, [{ id: 'a', v: '1' }], fp);
    expect(out.changed.map((x) => x.id)).toEqual(['a']);
    expect(out.removedIds).toEqual([]);
  });

  it('items vistos con el mismo fingerprint NO se tocan', () => {
    const out = diffByFingerprint({ a: '1' }, [{ id: 'a', v: '1' }], fp);
    expect(out.changed).toEqual([]);
    expect(out.removedIds).toEqual([]);
  });

  it('items vistos con fingerprint distinto van a changed', () => {
    const out = diffByFingerprint({ a: '1' }, [{ id: 'a', v: '2' }], fp);
    expect(out.changed.map((x) => x.id)).toEqual(['a']);
  });

  it('solo se marca como removido lo que ESTE cliente vio y ya no está', () => {
    // 'b' fue visto y falta → removido. 'c' nunca fue visto (lo creó otra PC) →
    // NO se puede tombstonear aunque falte del set (esa era la raíz del pisado).
    const out = diffByFingerprint({ a: '1', b: '2' }, [{ id: 'a', v: '1' }], fp);
    expect(out.removedIds).toEqual(['b']);
  });
});

describe('diffKeySets', () => {
  it('separa claves nuevas y removidas respecto a lo visto', () => {
    const out = diffKeySets(new Set(['x', 'y']), ['y', 'z']);
    expect(out.added).toEqual(['z']);
    expect(out.removed).toEqual(['x']);
  });
});

describe('blockFingerprint', () => {
  const base = {
    id: 'b1',
    subjectCode: 'MAT101',
    semester: 3,
    day: 0,
    startHour: 2,
    duration: 2,
    color: 'default',
    type: 'THEORY' as const,
    professorId: 'prof-1',
    section: 'A',
    labGroupId: undefined,
    aula: undefined,
  };

  it('es estable para el mismo contenido', () => {
    expect(blockFingerprint({ ...base })).toBe(blockFingerprint({ ...base }));
  });

  it('normaliza null/undefined/"" como equivalentes en campos opcionales', () => {
    expect(blockFingerprint({ ...base, aula: undefined })).toBe(
      blockFingerprint({ ...base, aula: '' }),
    );
  });

  it('cambia si cambia el contenido', () => {
    expect(blockFingerprint(base)).not.toBe(blockFingerprint({ ...base, startHour: 5 }));
    expect(blockFingerprint(base)).not.toBe(blockFingerprint({ ...base, aula: 'F1' }));
  });

  it('no depende del id (el id es la identidad, no el contenido)', () => {
    expect(blockFingerprint(base)).toBe(blockFingerprint({ ...base, id: 'otro' }));
  });
});
