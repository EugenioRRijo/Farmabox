/**
 * professorIdentity — Identidad ESTABLE de un profesor, para FUSIONAR en vez de duplicar.
 *
 * Regla (decidida 2026-08-03): si el registro entrante trae cédula, es la MISMA persona
 * solo si coincide la cédula (o si hay un homónimo SIN cédula, que se asume el mismo
 * docente antes de registrar su cédula). Si no trae cédula, se fusiona por nombre
 * normalizado (sin tildes, minúsculas, ignorando el orden de las palabras).
 *
 * Esto corta de raíz la duplicación histórica: re-importar la lista de profesores ya
 * NO crea un registro nuevo por cada fila (el bug de los IDs `prof-<timestamp>`).
 */

/** Nombre normalizado: sin tildes, minúsculas, palabras ordenadas (ignora Apellido/Nombre). */
export function professorNameKey(fullName: string | undefined): string {
  return (fullName ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/** Cédula normalizada (solo alfanumérico, minúsculas). Cadena vacía = sin cédula. */
export function cedulaKey(cedula: string | undefined): string {
  return (cedula ?? '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
}

export interface IdentifiableProfessor {
  id: string;
  fullName?: string;
  cedula?: string;
}

/**
 * Devuelve el `id` de un profesor EXISTENTE que sea la misma persona que `incoming`,
 * o `undefined` si es nuevo. Prioridad:
 *   1. id explícito que ya existe (actualización dirigida).
 *   2. misma cédula (si el entrante trae cédula).
 *   3. mismo nombre con un existente SIN cédula (homónimo pre-cédula).
 *   4. mismo nombre (si el entrante NO trae cédula).
 * Nunca fusiona dos personas que tienen cédulas DISTINTAS.
 */
export function findProfessorIdByIdentity(
  existing: IdentifiableProfessor[],
  incoming: { id?: string; fullName?: string; cedula?: string },
): string | undefined {
  const wantId = incoming.id ? String(incoming.id).trim() : '';
  if (wantId) {
    const byId = existing.find((e) => e.id === wantId);
    if (byId) return byId.id;
  }
  const incCed = cedulaKey(incoming.cedula);
  const nk = professorNameKey(incoming.fullName);
  if (incCed) {
    const byCed = existing.find((e) => cedulaKey(e.cedula) === incCed);
    if (byCed) return byCed.id;
    if (!nk) return undefined;
    // homónimo SIN cédula → se asume el mismo (aún no tenía cédula registrada).
    const byName = existing.find((e) => !cedulaKey(e.cedula) && professorNameKey(e.fullName) === nk);
    return byName ? byName.id : undefined;
  }
  if (!nk) return undefined; // sin nombre ni cédula → nuevo
  const byName = existing.find((e) => professorNameKey(e.fullName) === nk);
  return byName ? byName.id : undefined;
}
