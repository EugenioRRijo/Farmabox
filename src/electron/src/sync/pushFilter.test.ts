import { describe, it, expect } from 'vitest';
import { soloCambiadas, indexarRemoto } from './pushFilter';

type Row = Record<string, unknown>;
const key = (r: Row) => String(r.id);

describe('soloCambiadas', () => {
  it('sin remoto conocido sube TODO (fail-safe: nunca omitir por las dudas)', () => {
    const rows = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];
    expect(soloCambiadas(rows, key, null)).toEqual(rows);
  });

  it('omite la fila identica a la remota', () => {
    const remoto = indexarRemoto([{ id: 'a', v: 1, version: 7 }], key);
    expect(soloCambiadas([{ id: 'a', v: 1 }], key, remoto)).toEqual([]);
  });

  it('sube la fila cuyo contenido cambio', () => {
    const remoto = indexarRemoto([{ id: 'a', v: 1 }], key);
    expect(soloCambiadas([{ id: 'a', v: 2 }], key, remoto)).toEqual([{ id: 'a', v: 2 }]);
  });

  it('sube la fila que no existe en el remoto', () => {
    const remoto = indexarRemoto([{ id: 'a', v: 1 }], key);
    expect(soloCambiadas([{ id: 'b', v: 1 }], key, remoto)).toEqual([{ id: 'b', v: 1 }]);
  });

  it('ignora columnas que el push no manda (version la pone la base)', () => {
    const remoto = indexarRemoto([{ id: 'a', v: 1, version: 468 }], key);
    expect(soloCambiadas([{ id: 'a', v: 1 }], key, remoto)).toEqual([]);
  });

  it('compara sellos +00:00 de PostgREST contra los Z locales como iguales', () => {
    const remoto = indexarRemoto([{ id: 'a', updated_at: '2026-06-15T18:54:01.103+00:00' }], key);
    const rows = [{ id: 'a', updated_at: '2026-06-15T18:54:01.103Z' }];
    expect(soloCambiadas(rows, key, remoto)).toEqual([]);
  });

  it('trata null y undefined como el mismo valor ausente', () => {
    const remoto = indexarRemoto([{ id: 'a', email: null }], key);
    expect(soloCambiadas([{ id: 'a', email: undefined }], key, remoto)).toEqual([]);
  });

  it('compara arreglos por contenido y respeta el orden', () => {
    const remoto = indexarRemoto([{ id: 'a', pre: ['x', 'y'] }], key);
    expect(soloCambiadas([{ id: 'a', pre: ['x', 'y'] }], key, remoto)).toEqual([]);
    expect(soloCambiadas([{ id: 'a', pre: ['y', 'x'] }], key, remoto)).toHaveLength(1);
  });

  it('un tombstone nuevo SI se sube (deleted_at pasa de null a fecha)', () => {
    const remoto = indexarRemoto([{ id: 'a', deleted_at: null }], key);
    const rows = [{ id: 'a', deleted_at: '2026-09-07T10:00:00.000Z' }];
    expect(soloCambiadas(rows, key, remoto)).toEqual(rows);
  });

  it('mezcla realista: de 5 filas solo sube la que cambio', () => {
    const remoto = indexarRemoto(
      [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
        { id: 'c', v: 3 },
        { id: 'd', v: 4 },
      ],
      key,
    );
    const rows = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 99 }, // cambio
      { id: 'd', v: 4 },
      { id: 'e', v: 5 }, // nueva
    ];
    expect(soloCambiadas(rows, key, remoto)).toEqual([
      { id: 'c', v: 99 },
      { id: 'e', v: 5 },
    ]);
  });
});
