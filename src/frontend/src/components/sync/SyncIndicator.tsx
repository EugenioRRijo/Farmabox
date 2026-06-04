import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, WifiOff, Check } from 'lucide-react';
import * as Backend from '@/services/BackendService';
import type { SyncStatus } from '@/services/BackendService';

/**
 * Píldora de estado de sincronización (en el Header). Pollea cada 30 s.
 * Click → lleva a la pantalla de Sincronización. No se muestra en modo web.
 */
export function SyncIndicator() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    if (!Backend.isSyncAvailable()) return;
    let active = true;
    const load = async () => {
      try {
        const s = await Backend.getSyncStatus();
        if (active) setStatus(s);
      } catch {
        /* sin nube */
      }
    };
    load();
    const t = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  if (!Backend.isSyncAvailable() || !status || !status.configured) return null;

  let icon = <Check className="w-3.5 h-3.5" />;
  let text = 'Sincronizado';
  let cls = 'text-green-700 bg-green-50 hover:bg-green-100';
  if (!status.online) {
    icon = <WifiOff className="w-3.5 h-3.5" />;
    text = 'Sin conexión';
    cls = 'text-red-600 bg-red-50 hover:bg-red-100';
  } else if (status.pendingCount > 0) {
    icon = <AlertTriangle className="w-3.5 h-3.5" />;
    text = `${status.pendingCount} sin subir`;
    cls = 'text-amber-700 bg-amber-50 hover:bg-amber-100';
  }

  return (
    <button
      onClick={() => navigate('/sync')}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${cls}`}
      title="Ir a Sincronización"
    >
      {icon}
      {text}
    </button>
  );
}
