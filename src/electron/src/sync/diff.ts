/**
 * diff.ts — Cálculo puro de cambios pendientes (added / modified / removed)
 * comparando los hashes de contenido actuales contra los del último push.
 *
 * Es la base del resumen "vas a subir: +3 ~2 -1" y del contador de pendientes.
 */

export interface DiffCount {
  added: number;
  modified: number;
  removed: number;
}

/** Compara dos mapas clave→hash y cuenta nuevos, modificados y borrados. */
export function diffKeyed(
  current: Record<string, string>,
  last: Record<string, string>,
): DiffCount {
  let added = 0;
  let modified = 0;
  let removed = 0;
  for (const k of Object.keys(current)) {
    if (!(k in last)) added++;
    else if (last[k] !== current[k]) modified++;
  }
  for (const k of Object.keys(last)) {
    if (!(k in current)) removed++;
  }
  return { added, modified, removed };
}

export function totalChanges(d: DiffCount): number {
  return d.added + d.modified + d.removed;
}

/** Resumen legible de un dataset: "+3 ~2 -1" (omite los que son 0). */
export function describeDiff(d: DiffCount): string {
  const parts: string[] = [];
  if (d.added) parts.push(`+${d.added}`);
  if (d.modified) parts.push(`~${d.modified}`);
  if (d.removed) parts.push(`-${d.removed}`);
  return parts.join(' ');
}
