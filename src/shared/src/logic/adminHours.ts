/**
 * Lógica PURA de sincronización de HORAS ADMINISTRATIVAS entre PCs.
 * Sin dependencias de Supabase ni de React: solo tipos y funciones puras.
 *
 * Modelo: cada hora administrativa es una fila con sello `updatedAt` y tombstone
 * `deletedAt` (igual que el resto de las tablas sincronizadas). El merge es por id,
 * newest-wins; en empate gana el tombstone (un borrado nunca "resucita").
 * Los items legados de la v2.3.15 (localStorage sin sellos) cuentan como los más
 * viejos: cualquier versión sellada de la nube los pisa, y si la nube no los tiene
 * se suben sellándolos en ese momento.
 */
export interface AdminHourSync {
  id: string;
  professorId: string;
  role: string;
  day: number; // 0=Lunes … 4=Viernes
  startHour: number; // franja (0 = 7:00)
  duration: number; // franjas de 45 min
  updatedAt?: string | null; // ISO; ausente = item legado local
  deletedAt?: string | null; // ISO; tombstone
}

/** Fila tal cual en Supabase (snake_case), tabla `admin_hours`. */
export interface AdminHourRow {
  id: string;
  professor_id: string;
  role: string;
  day: number;
  start_hour: number;
  duration: number;
  updated_at: string | null;
  deleted_at: string | null;
}

export function rowToAdminHour(r: AdminHourRow): AdminHourSync {
  return {
    id: r.id,
    professorId: r.professor_id,
    role: r.role,
    day: r.day,
    startHour: r.start_hour,
    duration: r.duration,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

export function adminHourToRow(a: AdminHourSync): AdminHourRow {
  return {
    id: a.id,
    professor_id: a.professorId,
    role: a.role,
    day: a.day,
    start_hour: a.startHour,
    duration: a.duration,
    updated_at: a.updatedAt ?? null,
    deleted_at: a.deletedAt ?? null,
  };
}

/** Sello para comparar: ausente = '' (comparación ISO lexicográfica = cronológica). */
function stamp(a: AdminHourSync): string {
  return a.updatedAt ?? '';
}

/** true si `b` debe ganarle a `a` (más nuevo; en empate gana el tombstone). */
function wins(b: AdminHourSync, a: AdminHourSync): boolean {
  if (stamp(b) > stamp(a)) return true;
  if (stamp(b) < stamp(a)) return false;
  return !!b.deletedAt && !a.deletedAt;
}

/** Une local y remoto por id, newest-wins. Conserva tombstones (no los filtra). */
export function mergeAdminHours(
  local: AdminHourSync[],
  remote: AdminHourSync[],
): AdminHourSync[] {
  const byId = new Map<string, AdminHourSync>();
  for (const a of local) byId.set(a.id, a);
  for (const r of remote) {
    const prev = byId.get(r.id);
    // El local se queda solo si le gana al remoto (más nuevo, o tombstone en empate).
    // En cualquier otro caso —incluido empate parejo— manda la nube (determinismo).
    if (prev && wins(prev, r)) continue;
    byId.set(r.id, r);
  }
  return [...byId.values()];
}

/**
 * Qué subir a la nube: lo local que la nube no tiene, o tiene más viejo.
 * Los items legados sin sello que falten en la nube se sellan con `nowIso`.
 * (Un legado que YA existe remoto no se sube: el remoto está sellado y gana.)
 */
export function itemsToPush(
  local: AdminHourSync[],
  remote: AdminHourSync[],
  nowIso: string,
): AdminHourSync[] {
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const out: AdminHourSync[] = [];
  for (const a of local) {
    const r = remoteById.get(a.id);
    if (!r) {
      out.push(a.updatedAt ? a : { ...a, updatedAt: nowIso });
    } else if (a.updatedAt && a.updatedAt > stamp(r)) {
      out.push(a);
    }
  }
  return out;
}

/** Solo lo visible (sin tombstones). */
export function liveAdminHours(list: AdminHourSync[]): AdminHourSync[] {
  return list.filter((a) => !a.deletedAt);
}
