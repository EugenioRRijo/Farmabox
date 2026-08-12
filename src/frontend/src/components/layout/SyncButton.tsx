import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  RefreshCw,
  Cloud,
  CloudOff,
  Monitor,
  Clock,
  ArrowDownCircle,
  ArrowUpCircle,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as Backend from '../../services/BackendService';
import { useAppData } from '../../context/AppDataContext';

/** Estado de la vista previa dentro del diálogo de confirmación. */
type PreviewState = Backend.SyncPreview | null | 'loading' | 'error';

/** Icono y colores por tipo de cambio (misma paleta que los chips del resumen). */
const KIND_UI: Record<Backend.SyncPreviewKind, { Icon: typeof RefreshCw; text: string }> = {
  nuevo: { Icon: ArrowDownCircle, text: 'text-green-600' },
  actualizado: { Icon: RefreshCw, text: 'text-blue-600' },
  eliminado: { Icon: Trash2, text: 'text-red-600' },
  subes: { Icon: ArrowUpCircle, text: 'text-amber-600' },
};

const BTN_SECUNDARIO =
  'rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50';
const BTN_PRIMARIO =
  'flex items-center gap-2 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy';

/** Chip de resumen ("3 nuevos", "1 se elimina", …) con icono y color por tipo. */
function ResumenChip({
  Icon,
  n,
  texto,
  clases,
}: {
  Icon: typeof RefreshCw;
  n: number;
  texto: string;
  clases: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${clases}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {n} {texto}
    </span>
  );
}

/**
 * Botón "Sincronizar ahora" + indicador de estado, siempre visible en el header.
 * - .exe: sube lo pendiente + baja cambios de otras PCs (IPC).
 * - web: re-lee desde Supabase (las escrituras ya van directo a la nube).
 *
 * Pedido #2: antes de sincronizar pide confirmación, mostrando el nombre de esta PC
 * y la hora de la última sincronización, para que quede claro qué equipo está
 * subiendo/bajando datos de la base compartida.
 *
 * Vista previa (solo .exe): al abrir el diálogo se consulta un dry-run del sync
 * (qué entra, qué se reemplaza, qué subes). En web o si el preview falla, el
 * diálogo muestra el contenido genérico de siempre.
 */
export function SyncButton() {
  const { reload } = useAppData();
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const [device, setDevice] = useState('');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState>(null);
  // Evita que una respuesta vieja del preview pise una consulta más reciente.
  const previewReqId = useRef(0);

  useEffect(() => {
    Backend.getSyncStatus()
      .then((s) => {
        setOnline(s.online);
        if (s.device) setDevice(s.device);
      })
      .catch(() => {});
  }, []);

  /** Abre el diálogo y dispara la consulta de la vista previa. */
  const openConfirm = () => {
    setConfirmOpen(true);
    const req = ++previewReqId.current;
    setPreview('loading');
    Backend.previewSync()
      .then((p) => {
        if (previewReqId.current === req) setPreview(p);
      })
      .catch(() => {
        if (previewReqId.current === req) setPreview('error');
      });
  };

  /** Cierra el diálogo y limpia la vista previa (invalida consultas en vuelo). */
  const closeConfirm = () => {
    setConfirmOpen(false);
    setPreview(null);
    previewReqId.current++;
  };

  // Ejecuta la sincronización real (tras confirmar en el diálogo).
  const runSync = async () => {
    closeConfirm();
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

  // Preview utilizable: llegó, es del .exe y el dry-run salió bien.
  const okPreview = preview !== null && typeof preview === 'object' && preview.ok ? preview : null;
  const totalCambios = okPreview
    ? okPreview.totals.nuevos +
      okPreview.totals.actualizados +
      okPreview.totals.eliminados +
      okPreview.totals.subes
    : 0;
  const alDia = okPreview !== null && totalCambios === 0;
  const conCambios = okPreview !== null && totalCambios > 0;

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
        onClick={openConfirm}
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
            onClick={closeConfirm}
          >
            <div
              className={`w-full ${conCambios ? 'max-w-lg' : 'max-w-md'} rounded-xl bg-white p-6 shadow-xl`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-accent/10 text-brand-accent">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">¿Sincronizar ahora?</h2>
              </div>

              {preview === 'loading' ? (
                // ── Consultando el dry-run del sync ─────────────────────────
                <div className="flex items-center justify-center gap-3 py-8 text-sm text-gray-500">
                  <RefreshCw className="h-5 w-5 animate-spin text-brand-accent" />
                  Consultando cambios…
                </div>
              ) : alDia ? (
                // ── Preview OK y sin cambios pendientes ─────────────────────
                <div className="flex items-start gap-2 rounded-lg bg-green-50 px-3 py-3 text-sm text-green-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  <span>Todo al día — no hay cambios pendientes de bajar ni de subir.</span>
                </div>
              ) : conCambios && okPreview ? (
                // ── Preview OK con cambios: chips + secciones expandibles ───
                <>
                  <div className="flex flex-wrap gap-2">
                    {okPreview.totals.nuevos > 0 && (
                      <ResumenChip
                        Icon={ArrowDownCircle}
                        n={okPreview.totals.nuevos}
                        texto="nuevos"
                        clases="bg-green-100 text-green-700"
                      />
                    )}
                    {okPreview.totals.actualizados > 0 && (
                      <ResumenChip
                        Icon={RefreshCw}
                        n={okPreview.totals.actualizados}
                        texto="se actualizan"
                        clases="bg-blue-100 text-blue-700"
                      />
                    )}
                    {okPreview.totals.eliminados > 0 && (
                      <ResumenChip
                        Icon={Trash2}
                        n={okPreview.totals.eliminados}
                        texto="se eliminan"
                        clases="bg-red-100 text-red-700"
                      />
                    )}
                    {okPreview.totals.subes > 0 && (
                      <ResumenChip
                        Icon={ArrowUpCircle}
                        n={okPreview.totals.subes}
                        texto="vas a subir"
                        clases="bg-amber-100 text-amber-700"
                      />
                    )}
                  </div>

                  <p className="mt-3 text-xs text-gray-500">
                    Los que «se actualizan» reemplazan tu versión por una más reciente de otra
                    PC. Si cancelas, estos cambios igual entrarán con la sincronización
                    automática.
                  </p>

                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                    {okPreview.sections.map((sec) => (
                      <details key={sec.dataset} className="rounded-lg border border-gray-200">
                        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                          {sec.title} ({sec.items.length})
                        </summary>
                        <ul className="space-y-1.5 border-t border-gray-100 px-3 py-2">
                          {sec.items.map((item, i) => {
                            const ui = KIND_UI[item.kind];
                            return (
                              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                <ui.Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${ui.text}`} />
                                <span>
                                  {item.label}
                                  {item.detail && (
                                    <span className="block text-xs text-gray-400">{item.detail}</span>
                                  )}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    ))}
                  </div>
                </>
              ) : (
                // ── Fallback genérico: web, preview con error u ok:false ────
                <>
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
                </>
              )}

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
                <button onClick={closeConfirm} className={BTN_SECUNDARIO}>
                  {alDia ? 'Cerrar' : 'Cancelar'}
                </button>
                <button onClick={runSync} className={BTN_PRIMARIO}>
                  <RefreshCw className="h-4 w-4" />
                  {alDia ? 'Sincronizar igual' : conCambios ? 'Aceptar y sincronizar' : 'Sí, sincronizar'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
