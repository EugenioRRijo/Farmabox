/**
 * useNotifications — cola de pop-ups del receptor. Trae las notificaciones (Realtime + poll
 * de respaldo cada 30s), calcula cuáles no ha visto esta PC y las expone de una en una.
 * El "visto" se guarda en localStorage por PC ({ [id]: updatedAt }), así un mensaje editado
 * (updatedAt distinto) vuelve a saltar, y uno ya visto no repite en cada sync.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNotifications, subscribeNotifications } from '../services/notificationsClient';
import { pendingPops, markSeen, type AppNotification } from '../../../shared/src/logic/notifications';

const SEEN_KEY = 'farmabox.seenNotifications';

function loadSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
function saveSeen(seen: Record<string, string>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* almacenamiento lleno / no disponible: ignorar */
  }
}

export function useNotifications(): { current: AppNotification | null; dismiss: (n: AppNotification) => void } {
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const seenRef = useRef<Record<string, string>>(loadSeen());

  const refresh = useCallback(async () => {
    const list = await fetchNotifications();
    setQueue(pendingPops(list, seenRef.current, new Date().toISOString()));
  }, []);

  useEffect(() => {
    void refresh();
    const unsub = subscribeNotifications(() => void refresh());
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [refresh]);

  const dismiss = useCallback((n: AppNotification) => {
    seenRef.current = markSeen(seenRef.current, n);
    saveSeen(seenRef.current);
    setQueue((q) => q.filter((x) => x.id !== n.id));
  }, []);

  return { current: queue[0] ?? null, dismiss };
}
