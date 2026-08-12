/**
 * Cliente de la app Maestro: crea/guarda/edita/elimina/lista notificaciones en Supabase.
 * La parte de red usa el cliente supabase; `newNotification` es pura (testeable).
 */
import { createClient } from '@supabase/supabase-js';
import {
  notificationToRow,
  rowToNotification,
  type AppNotification,
  type NotificationRow,
} from '../../shared/src/logic/notifications';
import { rowToSuggestion, type AppSuggestion, type SuggestionRow } from '../../shared/src/logic/suggestions';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

/** Crea una notificación nueva (pura: no toca red). */
export function newNotification(
  title: string,
  body: string,
  expiresAt: string | null,
  nowIso: string,
): AppNotification {
  const id = `notif-${crypto.randomUUID()}`;
  return {
    id,
    title: title.trim(),
    body: body.trim(),
    createdAt: nowIso,
    updatedAt: nowIso,
    expiresAt: expiresAt,
    deletedAt: null,
  };
}

function requireSb() {
  if (!supabase) throw new Error('Supabase no configurado (revisa src/maestro/.env).');
  return supabase;
}

export async function listNotifications(): Promise<AppNotification[]> {
  const { data, error } = await requireSb()
    .from('notifications')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as NotificationRow[]).map(rowToNotification);
}

export async function saveNotification(n: AppNotification): Promise<void> {
  const { error } = await requireSb().from('notifications').upsert(notificationToRow(n));
  if (error) throw error;
}

export async function deleteNotification(id: string, nowIso: string): Promise<void> {
  const { error } = await requireSb()
    .from('notifications')
    .update({ deleted_at: nowIso, updated_at: nowIso })
    .eq('id', id);
  if (error) throw error;
}

export async function listSuggestions(): Promise<AppSuggestion[]> {
  const { data, error } = await requireSb()
    .from('suggestions')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as SuggestionRow[]).map(rowToSuggestion);
}

export async function resolveSuggestion(id: string, nowIso: string): Promise<void> {
  const { error } = await requireSb()
    .from('suggestions')
    .update({ resolved_at: nowIso, updated_at: nowIso })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteSuggestion(id: string, nowIso: string): Promise<void> {
  const { error } = await requireSb()
    .from('suggestions')
    .update({ deleted_at: nowIso, updated_at: nowIso })
    .eq('id', id);
  if (error) throw error;
}
