/**
 * Lógica PURA de notificaciones (mensajes del maestro a todas las PCs).
 * Compartida entre el receptor (Farmabox) y la app Maestro. Sin dependencias de
 * Supabase ni de React: solo tipos y funciones puras, fáciles de testear.
 */
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO — editar re-sella; el receptor lo usa para re-mostrar
  expiresAt?: string | null; // ISO | null: pasado ese momento no se muestra
  deletedAt?: string | null; // ISO | null: tombstone
}

/** Fila tal cual en Supabase (snake_case). */
export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  deleted_at: string | null;
}

export function rowToNotification(r: NotificationRow): AppNotification {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    expiresAt: r.expires_at,
    deletedAt: r.deleted_at,
  };
}

export function notificationToRow(n: AppNotification): NotificationRow {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    created_at: n.createdAt,
    updated_at: n.updatedAt,
    expires_at: n.expiresAt ?? null,
    deleted_at: n.deletedAt ?? null,
  };
}

/** Visible = no borrada y no vencida (comparando ISO como strings, orden lexicográfico = cronológico). */
export function isVisible(n: AppNotification, nowIso: string): boolean {
  if (n.deletedAt) return false;
  if (n.expiresAt && n.expiresAt <= nowIso) return false;
  return true;
}

/** El mapa de "visto" es { [id]: updatedAt visto }. Salta si es visible y su updatedAt difiere del visto. */
export function shouldPop(n: AppNotification, seen: Record<string, string>, nowIso: string): boolean {
  if (!isVisible(n, nowIso)) return false;
  return seen[n.id] !== n.updatedAt;
}

/** Notificaciones que deben mostrarse: visibles y no vistas, más nuevas primero (por createdAt). */
export function pendingPops(
  list: AppNotification[],
  seen: Record<string, string>,
  nowIso: string,
): AppNotification[] {
  return list
    .filter((n) => shouldPop(n, seen, nowIso))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function markSeen(seen: Record<string, string>, n: AppNotification): Record<string, string> {
  return { ...seen, [n.id]: n.updatedAt };
}
