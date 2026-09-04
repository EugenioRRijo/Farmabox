/**
 * Cursor del pull INCREMENTAL de logs.
 *
 * Por qué existe: el pull periódico bajaba la tabla `logs` ENTERA en cada ciclo.
 * Medido contra producción el 2026-09-04: 5.126 filas = 1,23 MB, el 63% de los
 * 1,95 MB que descargaba cada PC cada 60 segundos. Eso solo, con la app abierta,
 * proyectaba ~20 GB/mes por PC contra el límite de 5 GB del plan free de Supabase
 * (la organización ya se pasó una vez y entró en período de gracia).
 *
 * Los logs son un registro de auditoría: solo se AGREGAN, nunca se editan ni se
 * borran. Así que alcanza con pedir los posteriores al último sello visto, en vez
 * de la tabla completa. Es seguro porque `mergeRaw` es una UNIÓN (mantiene lo
 * local para las claves que el remoto no traiga) y porque el preview de
 * sincronización excluye los logs a propósito (ver sync/preview.ts).
 *
 * MARGEN DE SOLAPE: cada PC sella con SU reloj. Si el de otra máquina va algo
 * atrasado, su log podría entrar con un sello anterior a nuestro cursor y no lo
 * veríamos nunca. Por eso el cursor retrocede 2 minutos: se re-piden unos pocos
 * logs ya conocidos (el merge los deduplica por id) a cambio de tolerar el desfase
 * habitual entre relojes. Un desfase mayor a 2 minutos puede hacer que se pierda
 * alguna línea de auditoría — es una pérdida aceptable para un log, y no afecta a
 * ningún dato del horario.
 */

/** Cuánto retrocede el cursor para tolerar relojes desfasados entre PCs. */
export const LOG_CURSOR_OVERLAP_MS = 2 * 60 * 1000;

interface ConSello {
  timestamp?: string;
}

/**
 * Cursor para el PRÓXIMO pull de logs: el sello más nuevo del lote menos el
 * margen de solape. Nunca retrocede respecto del cursor previo. `null` significa
 * "todavía no hay base" → el próximo pull debe ser completo.
 */
export function nextLogCursor(logs: ConSello[], previo: string | null): string | null {
  let masNuevo = '';
  for (const l of logs) {
    if (!l?.timestamp) continue;
    const iso = new Date(l.timestamp).toISOString(); // PostgREST da +00:00 → normalizar a Z
    if (iso > masNuevo) masNuevo = iso;
  }
  if (!masNuevo) return previo;

  const candidato = new Date(new Date(masNuevo).getTime() - LOG_CURSOR_OVERLAP_MS).toISOString();
  if (previo && candidato <= previo) return previo; // nunca retroceder
  return candidato;
}
