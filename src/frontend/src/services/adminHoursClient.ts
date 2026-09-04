/**
 * Cliente de HORAS ADMINISTRATIVAS contra Supabase (tabla `admin_hours`).
 * Habla directo con el `supabase` del renderer (igual que notificationsClient:
 * funciona también en el .exe porque la anon key va horneada en el bundle).
 *
 * Degrada seguro: si no hay supabase, no hay red o la tabla aún no existe
 * (migración 2.7 sin correr), `fetchAdminHours` devuelve null y `pushAdminHours`
 * devuelve false — la app sigue con el localStorage local, como en v2.3.15.
 */
import { supabase } from './supabaseClient';
import {
  rowToAdminHour,
  adminHourToRow,
  type AdminHourSync,
  type AdminHourRow,
} from '../../../shared/src/logic/adminHours';
import { fetchAllPages } from '../../../shared/src/logic/paginate';

/**
 * Baja TODO (incluye tombstones: hacen falta para el merge). null = nube no disponible.
 *
 * PAGINADO a propósito: esta tabla NO filtra tombstones, así que crece para siempre y
 * tarde o temprano pasa las 1000 filas donde PostgREST corta. Sin paginar, el merge
 * vería una nube truncada y trataría lo que falta como inexistente → horas borradas
 * que reviven y ediciones que se pierden (el mismo corte del incidente de
 * `schedule_blocks`, cerrado en el escritorio con `pullAll`).
 */
export async function fetchAdminHours(): Promise<AdminHourSync[] | null> {
  if (!supabase) return null;
  const sb = supabase;
  try {
    const rows = await fetchAllPages<AdminHourRow>(async (from, to) => {
      const { data, error } = await sb
        .from('admin_hours')
        .select('*')
        .order('id', { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as AdminHourRow[];
    });
    return rows.map(rowToAdminHour);
  } catch {
    return null; // tabla ausente / RLS / red → seguir local
  }
}

// admin_hours.updated_by es columna nueva (atribución por equipo, migración 2.8).
// Igual que el patrón de columnas opcionales de supabaseWeb: se prueba UNA vez y se
// cachea; si la base no la tiene, se quita de las filas antes de subir (degradación).
let updatedBySupported: boolean | null = null;
async function stripUpdatedBy(rows: AdminHourRow[]): Promise<AdminHourRow[]> {
  if (updatedBySupported === null && supabase) {
    const { error } = await supabase.from('admin_hours').select('updated_by').limit(1);
    updatedBySupported = !error;
  }
  if (updatedBySupported) return rows;
  return rows.map((r) => {
    const rest = { ...r };
    delete rest.updated_by;
    return rest;
  });
}

/** Sube items (upsert por id). El trigger newest-wins de la base descarta sellos viejos. */
export async function pushAdminHours(items: AdminHourSync[]): Promise<boolean> {
  if (!supabase || !items.length) return !!supabase;
  const rows = await stripUpdatedBy(items.map(adminHourToRow));
  const { error } = await supabase.from('admin_hours').upsert(rows);
  return !error;
}

/** Aviso en vivo cuando otra PC cambia horas administrativas. Devuelve unsubscribe. */
export function subscribeAdminHours(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const sb = supabase; // capturado para que TS lo vea no-nulo dentro del closure
  const ch = sb.channel('farmabox-admin-hours');
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'admin_hours' }, () => onChange());
  ch.subscribe();
  return () => {
    void sb.removeChannel(ch);
  };
}
