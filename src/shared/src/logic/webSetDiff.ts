/**
 * Diff de sets para el guardado del modo WEB (supabaseWeb).
 *
 * El camino web guarda "el set completo" (así funciona la UI), pero subir el set
 * completo re-sellando todo y tombstoneando lo ausente PISA el trabajo de otras
 * PCs (raíz del incidente de corrupción de junio). Estas funciones puras calculan
 * el diff contra lo que ESTE cliente vio en su último pull:
 *
 *   - solo se suben (y re-sellan) los items realmente cambiados;
 *   - solo se tombstonea lo que este cliente VIO y luego quitó — nunca lo que
 *     otra PC creó y este cliente todavía no conoce.
 */

export interface SetDiff<T> {
  changed: T[];
  removedIds: string[];
}

/** Diff por fingerprint de contenido contra el mapa { id → fingerprint } visto. */
export function diffByFingerprint<T extends { id: string }>(
  seen: Record<string, string>,
  next: T[],
  fingerprint: (t: T) => string,
): SetDiff<T> {
  const changed = next.filter((t) => seen[t.id] === undefined || seen[t.id] !== fingerprint(t));
  const nextIds = new Set(next.map((t) => t.id));
  const removedIds = Object.keys(seen).filter((id) => !nextIds.has(id));
  return { changed, removedIds };
}

/** Diff de claves compuestas (p. ej. academic_load: "code prof role") contra lo visto. */
export function diffKeySets(
  seen: Set<string>,
  next: string[],
): { added: string[]; removed: string[] } {
  const nextSet = new Set(next);
  return {
    added: next.filter((k) => !seen.has(k)),
    removed: [...seen].filter((k) => !nextSet.has(k)),
  };
}

/** Campos de contenido de un bloque de horario (sin el id ni los sellos). */
export interface BlockContent {
  subjectCode?: string | null;
  semester?: number | null;
  day: number;
  startHour: number;
  duration: number;
  color?: string | null;
  type?: string | null;
  professorId?: string | null;
  section?: string | null;
  labGroupId?: string | null;
  aula?: string | null;
}

const s = (v: string | null | undefined): string => v ?? '';
const n = (v: number | null | undefined): string => (v ?? '') + '';

/** Huella estable del CONTENIDO de un bloque ('' ≡ null ≡ undefined en opcionales). */
export function blockFingerprint(b: BlockContent): string {
  return [
    s(b.subjectCode),
    n(b.semester),
    n(b.day),
    n(b.startHour),
    n(b.duration),
    s(b.color),
    s(b.type),
    s(b.professorId),
    s(b.section),
    s(b.labGroupId),
    s(b.aula),
  ].join('|');
}
