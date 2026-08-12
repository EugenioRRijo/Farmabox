/**
 * NotificationPopup — muestra los avisos del maestro como modal encima de la app.
 * Toma el pop más nuevo pendiente de useNotifications y, al pulsar "Entendido", lo marca
 * visto y avanza al siguiente. Si no hay pendientes, no renderiza nada.
 */
import { Bell } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';

export function NotificationPopup() {
  const { current, dismiss } = useNotifications();
  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 rounded-t-xl bg-blue-600 px-5 py-3 text-white">
          <Bell className="h-5 w-5" />
          <span className="text-base font-bold">{current.title || 'Aviso'}</span>
        </div>
        <div className="whitespace-pre-wrap px-5 py-4 text-sm text-gray-800">{current.body}</div>
        <div className="flex justify-end border-t px-5 py-3">
          <button
            onClick={() => dismiss(current)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
