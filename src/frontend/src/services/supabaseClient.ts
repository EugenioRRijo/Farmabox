/**
 * Cliente Supabase para el modo WEB (navegador).
 *
 * En la app de escritorio (.exe) los datos van por IPC → proceso de Electron.
 * En la web hablamos directo a Supabase (mismas tablas relacionales), así hay un
 * solo backend para los dos. La anon/publishable key es de cliente (RLS protege),
 * se inyecta por Vite (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase no está configurado (faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
    );
  }
  return supabase;
}
