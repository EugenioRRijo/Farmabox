import { useEffect, useState } from 'react';
import { RefreshCw, Cloud, CloudOff } from 'lucide-react';
import toast from 'react-hot-toast';
import * as Backend from '../../services/BackendService';
import { useAppData } from '../../context/AppDataContext';

/**
 * Botón "Sincronizar ahora" + indicador de estado, siempre visible en el header.
 * - .exe: sube lo pendiente + baja cambios de otras PCs (IPC).
 * - web: re-lee desde Supabase (las escrituras ya van directo a la nube).
 */
export function SyncButton() {
  const { reload } = useAppData();
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    Backend.getSyncStatus()
      .then((s) => setOnline(s.online))
      .catch(() => {});
  }, []);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await Backend.syncNow();
      setOnline(r.online);
      await reload(true);
      setLastSync(new Date());
      if (!r.online) {
        toast.error('Sin conexión — tus cambios quedan guardados local y se subirán al reconectar.');
      } else if (r.changed) {
        toast.success('Sincronizado: había cambios nuevos de otra PC.');
      } else {
        toast.success('Sincronizado: todo al día.');
      }
    } catch {
      toast.error('No se pudo sincronizar.');
    } finally {
      setSyncing(false);
    }
  };

  const hhmm = lastSync ? lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="flex items-center gap-2">
      <span className="hidden sm:flex items-center gap-1 text-xs text-gray-500">
        {online ? (
          <Cloud className="w-3.5 h-3.5 text-green-600" />
        ) : (
          <CloudOff className="w-3.5 h-3.5 text-amber-500" />
        )}
        {hhmm ? `Sincronizado ${hhmm}` : online ? 'Conectado' : 'Sin conexión'}
      </span>
      <button
        onClick={handleSync}
        disabled={syncing}
        title="Sincronizar ahora (subir y bajar cambios)"
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-brand-accent hover:bg-brand-navy rounded-lg disabled:opacity-60 transition-colors"
      >
        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
        <span className="hidden md:inline">{syncing ? 'Sincronizando…' : 'Sincronizar'}</span>
      </button>
    </div>
  );
}
