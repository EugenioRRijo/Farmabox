/**
 * Paginación de lecturas de Supabase/PostgREST.
 *
 * PostgREST corta TODA respuesta en 1000 filas. Un `select('*')` a secas devuelve
 * una nube truncada sin avisar: el merge ve menos filas de las que hay y trata las
 * que faltan como inexistentes (ítems fantasma "para subir", tombstones que se
 * pierden y borrados que reviven). Es el mismo corte que provocó el incidente de
 * `schedule_blocks` (~1800 filas llegando en 1000 justas) y que en el escritorio se
 * cerró con `CloudStorageService.pullAll`.
 *
 * Este helper es la versión compartida y pura: recibe cómo pedir una página y
 * pagina hasta que llega una incompleta. Quien lo use DEBE pedir las páginas con un
 * orden determinista, si no `.range()` puede repetir o saltar filas.
 */

/** Corte duro de PostgREST: ninguna respuesta trae más de estas filas. */
export const SUPABASE_PAGE_SIZE = 1000;

/**
 * Baja TODAS las filas paginando con rangos `[from, to]` inclusivos (como `.range()`).
 * Corta cuando una página vuelve incompleta ⇒ era la última.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize: number = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  const todas: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const pagina = await fetchPage(from, from + pageSize - 1);
    todas.push(...pagina);
    if (pagina.length < pageSize) break;
  }
  return todas;
}
