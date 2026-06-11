import { useEffect, useState } from 'react';
import { Cloud, CloudOff, Loader2, AlertTriangle } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { deriveSyncStatus, type SyncKind } from '../../context/saveState';

/**
 * SyncStatusBadge — Estado de guardado/conexión SIEMPRE visible.
 * Reúsa isSaving/saveError del contexto + el estado online del navegador.
 * Para que nunca haya dudas de si los datos se están guardando en la nube.
 */
const STYLES: Record<SyncKind, string> = {
  offline: 'bg-gray-100 text-gray-600',
  saving: 'bg-blue-50 text-blue-700',
  error: 'bg-red-50 text-red-700',
  saved: 'bg-green-50 text-green-700',
};

export function SyncStatusBadge() {
  const { isSaving, saveError } = useAppData();
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const status = deriveSyncStatus({ online, isSaving, saveError });
  const Icon =
    status.kind === 'saving' ? Loader2 : status.kind === 'offline' ? CloudOff : status.kind === 'error' ? AlertTriangle : Cloud;

  return (
    <span
      title={saveError ?? status.label}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STYLES[status.kind]}`}
    >
      <Icon className={`w-3.5 h-3.5 ${status.kind === 'saving' ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{status.label}</span>
    </span>
  );
}
