import { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  RefreshCw,
  History,
  RotateCcw,
  Check,
  WifiOff,
  Clock,
  UploadCloud,
  DownloadCloud,
  Monitor,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button, Badge } from '@/components/ui';
import { Dialog, DialogContent } from '@/components/ui';
import * as Backend from '@/services/BackendService';
import type { SyncStatus, PendingDiff, VersionMeta } from '@/services/BackendService';

type Tab = 'sync' | 'history';

const DATASET_LABELS: [keyof PendingDiff['datasets'], string][] = [
  ['scheduleBlocks', 'Horarios'],
  ['professors', 'Profesores'],
  ['subjects', 'Materias'],
  ['academicLoad', 'Carga académica'],
  ['logs', 'Registros'],
];

function timeAgo(iso: string | null): string {
  if (!iso) return 'nunca';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '—';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleString();
}

export function SyncPage() {
  const available = Backend.isSyncAvailable();
  const [activeTab, setActiveTab] = useState<Tab>('sync');
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [diff, setDiff] = useState<PendingDiff | null>(null);
  const [label, setLabel] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await Backend.getSyncStatus());
    } catch {
      /* sin nube */
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setVersions(await Backend.getVersionHistory());
    } catch {
      /* sin nube */
    }
  }, []);

  useEffect(() => {
    if (!available) return;
    loadStatus();
    loadHistory();
    const t = setInterval(loadStatus, 30000);
    return () => clearInterval(t);
  }, [available, loadStatus, loadHistory]);

  // ── Acciones ────────────────────────────────────────────────────────────
  const openPushDialog = async () => {
    try {
      const d = await Backend.getSyncDiff();
      if (d.total === 0) {
        toast('Ya está todo sincronizado ✓', { icon: '☁️' });
        return;
      }
      setDiff(d);
      setLabel('');
      setConfirmOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const confirmPush = async () => {
    try {
      setPushing(true);
      await Backend.pushSession(label.trim() || undefined);
      toast.success('Cambios subidos y versión guardada');
      setConfirmOpen(false);
      await Promise.all([loadStatus(), loadHistory()]);
    } catch (e) {
      toast.error('No se pudo subir: ' + (e as Error).message);
    } finally {
      setPushing(false);
    }
  };

  const handlePull = async () => {
    try {
      setPulling(true);
      await Backend.pullNow();
      toast.success('Datos actualizados desde la nube');
      // Recargar para que la app muestre los datos fusionados
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      toast.error('No se pudo sincronizar: ' + (e as Error).message);
      setPulling(false);
    }
  };

  const handleRestore = async (v: VersionMeta) => {
    if (
      !window.confirm(
        `¿Restaurar la versión del ${new Date(v.created_at).toLocaleString()}?\n` +
          'Esto reemplazará los datos actuales (queda guardado como una versión nueva, no se pierde nada).',
      )
    )
      return;
    try {
      setRestoringId(v.id);
      await Backend.restoreVersion(v.id);
      toast.success('Versión restaurada');
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error('No se pudo restaurar: ' + (e as Error).message);
      setRestoringId(null);
    }
  };

  // ── No disponible en modo web ──────────────────────────────────────────
  if (!available) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Cloud className="w-8 h-8 text-blue-600" /> Sincronización
          </h1>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex items-center gap-3 text-gray-600">
          <Monitor className="w-5 h-5 text-gray-400" />
          La sincronización está disponible solo en la aplicación de escritorio (Farmabox).
        </div>
      </div>
    );
  }

  // ── Estado / badge ──────────────────────────────────────────────────────
  const renderBadge = () => {
    if (!status) return <Badge variant="secondary">Cargando…</Badge>;
    if (!status.configured) return <Badge variant="secondary">Nube no configurada</Badge>;
    if (!status.online)
      return (
        <Badge variant="destructive">
          <WifiOff className="w-3 h-3 mr-1" /> Sin conexión
        </Badge>
      );
    if (status.pendingCount > 0)
      return (
        <Badge variant="warning">
          <AlertTriangle className="w-3 h-3 mr-1" /> {status.pendingCount} sin subir
        </Badge>
      );
    return (
      <Badge variant="success">
        <Check className="w-3 h-3 mr-1" /> Sincronizado
      </Badge>
    );
  };

  const pendingDatasets =
    diff &&
    DATASET_LABELS.map(([k, lbl]) => ({ lbl, d: diff.datasets[k] })).filter(
      (x) => x.d.added + x.d.modified + x.d.removed > 0,
    );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Cloud className="w-8 h-8 text-blue-600" /> Sincronización y Versiones
        </h1>
        <p className="text-gray-600 mt-2">
          Subí tus cambios cuando quieras y restaurá versiones anteriores. Nada se pierde.
        </p>
      </div>

      {/* Tarjeta de estado */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-500">Estado:</span>
              {renderBadge()}
            </div>
            <p className="text-sm text-gray-500 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              Última sincronización: {timeAgo(status?.lastSyncAt ?? null)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePull} isLoading={pulling}>
              <DownloadCloud className="w-4 h-4 mr-1" /> Buscar cambios
            </Button>
            <Button onClick={openPushDialog} disabled={pulling}>
              <UploadCloud className="w-4 h-4 mr-1" /> Sincronizar ahora
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setActiveTab('sync')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'sync' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <RefreshCw className="w-4 h-4" /> Cómo funciona
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'history' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <History className="w-4 h-4" /> Historial ({versions.length})
        </button>
      </div>

      {/* Tab: cómo funciona */}
      {activeTab === 'sync' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-3 text-sm text-gray-600">
          <p className="flex gap-2">
            <DownloadCloud className="w-5 h-5 text-blue-600 shrink-0" />
            <span><b>Recibir</b> es automático al abrir la app: bajás y fusionás lo último de las otras PC.</span>
          </p>
          <p className="flex gap-2">
            <UploadCloud className="w-5 h-5 text-blue-600 shrink-0" />
            <span><b>Subir</b> es manual: con <b>"Sincronizar ahora"</b> revisás qué vas a subir y confirmás. Cada subida guarda una versión.</span>
          </p>
          <p className="flex gap-2">
            <History className="w-5 h-5 text-blue-600 shrink-0" />
            <span><b>Historial</b>: cada versión es una foto completa. Si algo se pisó, lo restaurás. <b>Nada se pierde.</b></span>
          </p>
        </div>
      )}

      {/* Tab: historial */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {versions.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              Todavía no hay versiones guardadas. Hacé tu primera sincronización con "Sincronizar ahora".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                  <tr>
                    <th className="px-6 py-3 font-medium">Fecha</th>
                    <th className="px-6 py-3 font-medium">Dispositivo</th>
                    <th className="px-6 py-3 font-medium">Cambios</th>
                    <th className="px-6 py-3 font-medium text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {versions.map((v, i) => (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 whitespace-nowrap text-gray-700">
                        {new Date(v.created_at).toLocaleString()}
                        {i === 0 && (
                          <Badge variant="success" className="ml-2 text-[10px]">
                            actual
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-600">{v.device || '—'}</td>
                      <td className="px-6 py-3 text-gray-600">
                        {v.label ? <span className="font-medium text-gray-800">{v.label}. </span> : null}
                        {v.summary || 'Sin cambios'}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore(v)}
                          isLoading={restoringId === v.id}
                          disabled={i === 0}
                          title={i === 0 ? 'Es la versión actual' : 'Restaurar esta versión'}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" /> Restaurar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal de confirmación de subida */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent title="Subir cambios a la nube">
          {diff && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Vas a subir y guardar una nueva versión con:</p>
              <ul className="space-y-1.5">
                {pendingDatasets?.map(({ lbl, d }) => (
                  <li key={lbl} className="flex items-center justify-between text-sm">
                    <span className="text-gray-800">{lbl}</span>
                    <span className="flex gap-2 font-medium">
                      {d.added > 0 && <span className="text-green-600">+{d.added}</span>}
                      {d.modified > 0 && <span className="text-blue-600">~{d.modified}</span>}
                      {d.removed > 0 && <span className="text-red-600">-{d.removed}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Etiqueta (opcional)
                </label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ej: Horarios 1er semestre listos"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pushing}>
                  Cancelar
                </Button>
                <Button onClick={confirmPush} isLoading={pushing}>
                  <UploadCloud className="w-4 h-4 mr-1" /> Confirmar y subir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
