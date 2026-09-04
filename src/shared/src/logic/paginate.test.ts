import { describe, it, expect } from 'vitest';
import { fetchAllPages, SUPABASE_PAGE_SIZE } from './paginate';

/** Tabla falsa: devuelve la porción [from, to] igual que hace `.range()` de PostgREST. */
function tablaDe(filas: number) {
  const todas = Array.from({ length: filas }, (_, i) => ({ id: `r${i}` }));
  const paginas: Array<[number, number]> = [];
  return {
    paginas,
    fetchPage: async (from: number, to: number) => {
      paginas.push([from, to]);
      return todas.slice(from, to + 1);
    },
  };
}

describe('fetchAllPages', () => {
  it('baja TODAS las filas cuando la tabla supera una página', async () => {
    const t = tablaDe(2500);
    const filas = await fetchAllPages(t.fetchPage, 1000);
    expect(filas).toHaveLength(2500);
    expect(filas[2499]).toEqual({ id: 'r2499' });
  });

  it('pide páginas contiguas sin repetir ni saltar filas', async () => {
    const t = tablaDe(2500);
    await fetchAllPages(t.fetchPage, 1000);
    expect(t.paginas).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('corta al recibir una página incompleta (no pide una de más)', async () => {
    const t = tablaDe(1500);
    await fetchAllPages(t.fetchPage, 1000);
    expect(t.paginas).toHaveLength(2);
  });

  it('pide una segunda página cuando la primera vino exacta', async () => {
    const t = tablaDe(1000);
    const filas = await fetchAllPages(t.fetchPage, 1000);
    expect(filas).toHaveLength(1000);
    expect(t.paginas).toHaveLength(2); // no puede saber que terminó sin preguntar
  });

  it('tabla vacía devuelve [] con una sola consulta', async () => {
    const t = tablaDe(0);
    expect(await fetchAllPages(t.fetchPage, 1000)).toEqual([]);
    expect(t.paginas).toHaveLength(1);
  });

  it('usa 1000 (el corte de PostgREST) como tamaño de página por defecto', async () => {
    const t = tablaDe(1);
    await fetchAllPages(t.fetchPage);
    expect(SUPABASE_PAGE_SIZE).toBe(1000);
    expect(t.paginas[0]).toEqual([0, 999]);
  });
});
