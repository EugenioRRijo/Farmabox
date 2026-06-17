import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Cloud, CloudOff, Monitor, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import * as Backend from '../../services/BackendService';
import { useAppData } from '../../context/AppDataContext';

/**
 * Botón "Sincronizar ahora" + indicador de estado, siempre visible en el header.
 * - .exe: sube lo pendiente + baja cambios de otras PCs (IPC).
 * - web: re-lee desde Supabase (las escrituras ya van directo a la nube).
 *
 * Pedido #2: antes de sincronizar pide confirmación, mostrando el nombre de esta PC
 * y la hora de la última sincronización, para que quede claro qué equipo está
 * subiendo/bajando datos de la base compartida.
 */
export function SyncButton() {
  const { reload } = useAppData();
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const [device, setDevice] = useState('');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    Backend.getSyncStatus()
      .then((s) => {
        setOnline(s.online);
        if (s.device) setDevice(s.device);
      })
      .catch(() => {});
  }, []);

  // Ejecuta la sincronización real (tras confirmar en el diálogo).
  const runSync = async () => {
    setConfirmOpen(false);
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
  const deviceLabel = device || 'este equipo';

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
        onClick={() => setConfirmOpen(true)}
        disabled={syncing}
        title="Sincronizar ahora (subir y bajar cambios)"
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-brand-accent hover:bg-brand-navy rounded-lg disabled:opacity-60 transition-colors"
      >
        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
        <span className="hidden md:inline">{syncing ? 'Sincronizando…' : 'Sincronizar'}</span>
      </button>

      {confirmOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setConfirmOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-accent/10 text-brand-accent">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">¿Sincronizar ahora?</h2>
              </div>

              <p className="text-sm text-gray-600">
                Vas a sincronizar con la nube (la base de datos compartida por todas las PC).
              </p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                <li className="flex gap-2">
                  <span className="text-brand-accent">•</span>
                  <span>Se suben tus cambios y se bajan los de las demás PC.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-brand-accent">•</span>
                  <span>Si dos PC editan lo mismo, gana la versión más reciente.</span>
                </li>
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <Monitor className="h-3.5 w-3.5" /> Equipo: <span className="font-medium text-gray-700">{deviceLabel}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Última sincronización:{' '}
                  <span className="font-medium text-gray-700">{hhmm ?? 'aún no en esta sesión'}</span>
                </span>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={runSync}
                  className="flex items-center gap-2 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy"
                >
                  <RefreshCw className="h-4 w-4" /> Sí, sincronizar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
