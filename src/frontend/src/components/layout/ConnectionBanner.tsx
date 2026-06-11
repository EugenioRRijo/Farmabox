import { AlertTriangle } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';

/**
 * ConnectionBanner — Aviso superior cuando la base compartida no responde
 * (p. ej. proyecto Supabase pausado o sin internet). Nunca falla en silencio:
 * el usuario ve que está trabajando con datos locales y que se reintenta.
 */
export function ConnectionBanner() {
  const { error } = useAppData();
  if (!error) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-800">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>Sin conexión a la base compartida — trabajando con los últimos datos locales. Reintentando…</span>
    </div>
  );
}
