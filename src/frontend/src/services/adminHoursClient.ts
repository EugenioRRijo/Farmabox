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

/** Baja TODO (incluye tombstones: hacen falta para el merge). null = nube no disponible. */
export async function fetchAdminHours(): Promise<AdminHourSync[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('admin_hours').select('*');
  if (error || !data) return null; // tabla ausente / RLS / red → seguir local
  return (data as AdminHourRow[]).map(rowToAdminHour);
}

/** Sube items (upsert por id). El trigger newest-wins de la base descarta sellos viejos. */
export async function pushAdminHours(items: AdminHourSync[]): Promise<boolean> {
  if (!supabase || !items.length) return !!supabase;
  const { error } = await supabase.from('admin_hours').upsert(items.map(adminHourToRow));
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
