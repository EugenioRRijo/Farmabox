import { describe, it, expect } from 'vitest';
import { diffKeyed, totalChanges, describeDiff } from './diff';

describe('diffKeyed — cambios pendientes vs último push', () => {
  it('cuenta nuevos (added)', () => {
    const d = diffKeyed({ a: 'h1', b: 'h2' }, { a: 'h1' });
    expect(d).toEqual({ added: 1, modified: 0, removed: 0 });
  });

  it('cuenta modificados (hash distinto)', () => {
    const d = diffKeyed({ a: 'h1-nuevo' }, { a: 'h1-viejo' });
    expect(d).toEqual({ added: 0, modified: 1, removed: 0 });
  });

  it('cuenta borrados (estaba antes, ya no)', () => {
    const d = diffKeyed({ a: 'h1' }, { a: 'h1', b: 'h2' });
    expect(d).toEqual({ added: 0, modified: 0, removed: 1 });
  });

  it('sin cambios → todo 0', () => {
    const d = diffKeyed({ a: 'h1', b: 'h2' }, { a: 'h1', b: 'h2' });
    expect(totalChanges(d)).toBe(0);
  });

  it('mezcla: +1 ~1 -1', () => {
    const d = diffKeyed({ a: 'h1', c: 'nuevo' }, { a: 'h1-viejo', b: 'h2' });
    expect(d).toEqual({ added: 1, modified: 1, removed: 1 });
    expect(totalChanges(d)).toBe(3);
    expect(describeDiff(d)).toBe('+1 ~1 -1');
  });
});
