/**
 * Cliente de notificaciones del RECEPTOR (Farmabox). Habla directo a Supabase con el
 * mismo `supabase` del renderer (funciona también en el .exe: la anon key va horneada en
 * el bundle). Es SOLO LECTURA: el único que escribe es la app Maestro. Degrada seguro:
 * si no hay supabase o la tabla aún no existe, devuelve vacío sin romper la app.
 */
import { supabase } from './supabaseClient';
import {
  rowToNotification,
  type AppNotification,
  type NotificationRow,
} from '../../../shared/src/logic/notifications';

export async function fetchNotifications(): Promise<AppNotification[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('notifications').select('*').is('deleted_at', null);
  if (error || !data) return []; // tabla ausente / RLS / red → sin notificaciones
  return (data as NotificationRow[]).map(rowToNotification);
}

export function subscribeNotifications(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const sb = supabase; // capturado para que TS lo siga viendo no-nulo dentro del closure
  const ch = sb.channel('farmabox-notifications');
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => onChange());
  ch.subscribe();
  return () => {
    void sb.removeChannel(ch);
  };
}
