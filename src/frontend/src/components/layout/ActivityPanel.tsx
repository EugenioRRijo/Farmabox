import { useEffect, useRef, useState } from 'react';
import { History, ArrowDownCircle, RefreshCw, Trash2 } from 'lucide-react';
import type { RemoteChangeItem } from '../../services/BackendService';
import { useActivityFeed, formatPorDataset, type ActivityEntry } from '../../context/ActivityFeedContext';

/**
 * ActivityPanel — Icono de "Actividad reciente" en el header (junto al botón de
 * sincronizar). SIN pop-ups: el badge de no-vistos es el ÚNICO aviso de que
 * entraron cambios de otras PCs; el detalle se consulta bajo demanda abriendo
 * el dropdown. Cada entrada se agrupa por equipo ("PC Laboratorio · 14:32") con
 * la lista de qué cambió; si el resumen no trae detalle (main viejo), cae a la
 * línea de conteos. Las entradas las empuja AppDataContext.
 */

/** Icono y color por tipo de cambio (misma paleta que la vista previa del sync). */
const KIND_UI: Record<RemoteChangeItem['kind'], { Icon: typeof RefreshCw; text: string }> = {
  nuevo: { Icon: ArrowDownCircle, text: 'text-green-600' },
  actualizado: { Icon: RefreshCw, text: 'text-blue-600' },
  eliminado: { Icon: Trash2, text: 'text-red-600' },
};

/** Una entrada del feed: grupos por equipo si hay detalle; conteos si no. */
function EntradaFeed({ entry }: { entry: ActivityEntry }) {
  const hhmm = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (!entry.porEquipo?.length) {
    // Resumen sin detalle por equipo (main viejo): línea de conteos de siempre.
    return (
      <p className="text-sm text-gray-700">
        <span className="font-medium text-gray-500">{hhmm}</span>
        {' — '}
        <span className="font-medium">{entry.devices.join(', ') || '(equipo desconocido)'}</span>
        {': '}
        {formatPorDataset(entry.porDataset)}
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {entry.porEquipo.map((grupo, gi) => (
        <div key={`${grupo.device}-${gi}`}>
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{grupo.device}</span>
            <span className="text-gray-400"> · {hhmm}</span>
          </p>
          <ul className="mt-1 space-y-1">
            {grupo.items.map((item, ii) => {
              const ui = KIND_UI[item.kind];
              return (
                <li key={ii} className="flex items-start gap-2 text-sm text-gray-700">
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
            {grupo.truncados ? (
              <li className="pl-[22px] text-xs text-gray-400">… y {grupo.truncados} más</li>
            ) : null}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function ActivityPanel() {
  const { entries, unseen, markSeen } = useActivityFeed();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Cierre por click fuera del icono/dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = () => {
    if (!open) markSeen(); // al abrir, todo pasa a "visto"
    setOpen(!open);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={toggle}
        title="Actividad reciente (cambios de otras PCs)"
        aria-label="Actividad reciente"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-navy"
      >
        <History className="h-5 w-5" />
        {unseen > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unseen > 9 ? '9+' : unseen}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700">
            Actividad reciente
          </div>
          {entries.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              Sin actividad de otras PCs en esta sesión.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {entries.map((e, i) => (
                <li
                  key={`${e.at}-${i}`}
                  className="border-b border-gray-50 px-4 py-2.5 last:border-b-0 hover:bg-gray-50/50"
                >
                  <EntradaFeed entry={e} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
