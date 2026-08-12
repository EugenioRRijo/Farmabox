/**
 * Emisor de sugerencias (Farmabox → Supabase). Escritura directa con el `supabase` del
 * renderer (RLS abierto). El maestro las lee desde la app Maestro.
 */
import { supabase } from './supabaseClient';
import { suggestionToRow, type AppSuggestion } from '../../../shared/src/logic/suggestions';

export async function submitSuggestion(s: AppSuggestion): Promise<void> {
  if (!supabase) throw new Error('No hay conexión para enviar la sugerencia.');
  const { error } = await supabase.from('suggestions').insert(suggestionToRow(s));
  if (error) throw error;
}
