/**
 * merge.ts — Lógica de fusión para sincronización multi-PC (offline-first).
 *
 * Resuelve conflictos por ÍTEM (no por dataset completo), eliminando la pérdida
 * de datos del esquema "última escritura gana a nivel de archivo": si dos PC
 * editan offline y ambas suben, sus cambios se UNEN en lugar de pisarse.
 *
 * Estrategia: newest-wins por `updatedAt`, con tombstones (`deletedAt`) para
 * propagar borrados. El sellado de `updatedAt`/`deletedAt` lo hace el proceso
 * main de forma transparente (el frontend no necesita conocerlos).
 */

export interface Stamped {
  /** ISO 8601 de la última modificación del ítem. */
  updatedAt?: string;
  /** ISO 8601 si el ítem fue borrado (tombstone). */
  deletedAt?: string;
}

/** Timestamp efectivo de un ítem (el más reciente entre update y delete). */
function stampOf(it: Stamped): string {
  const u = it.updatedAt ?? '';
  const d = it.deletedAt ?? '';
  return u > d ? u : d;
}

/**
 * Fusiona dos colecciones con clave (`keyOf`), conservando por cada clave el
 * ítem con el timestamp más reciente. En empate, gana `local` (es el estado
 * actual de esta PC). Devuelve incluyendo tombstones para poder re-sincronizar.
 */
export function mergeRaw<T extends Stamped>(
  local: T[],
  remote: T[],
  keyOf: (item: T) => string,
): T[] {
  const map = new Map<string, T>();
  // remote primero, luego local → local gana los empates de timestamp
  for (const it of [...remote, ...local]) {
    const k = keyOf(it);
    const cur = map.get(k);
    if (!cur || stampOf(it) >= stampOf(cur)) {
      map.set(k, it);
    }
  }
  return [...map.values()];
}

/**
 * Igual que mergeRaw pero devuelve solo los ítems VIVOS (excluye tombstones).
 * Es la vista que consume la app.
 */
export function mergeKeyed<T extends Stamped>(
  local: T[],
  remote: T[],
  keyOf: (item: T) => string,
): T[] {
  return mergeRaw(local, remote, keyOf).filter((it) => !it.deletedAt);
}

/**
 * Fusiona dos mapas (objeto { clave: valor }) por clave, newest-wins.
 * Útil para `academic-load` ({ [subjectCode]: { theory, lab } }).
 * Requiere una función que extraiga el timestamp de cada valor (o usa el del
 * contenedor `_meta` si se provee).
 */
export function mergeMaps<V>(
  local: Record<string, V>,
  remote: Record<string, V>,
  stampOfValue: (v: V) => string,
): Record<string, V> {
  const out: Record<string, V> = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const k of keys) {
    const l = local[k];
    const r = remote[k];
    if (l === undefined) {
      out[k] = r;
    } else if (r === undefined) {
      out[k] = l;
    } else {
      out[k] = stampOfValue(l) >= stampOfValue(r) ? l : r;
    }
  }
  return out;
}
