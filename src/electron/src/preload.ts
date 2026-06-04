/**
 * preload.ts — Puente seguro entre el Main Process y el Renderer (React).
 *
 * contextBridge garantiza que el Renderer NO tiene acceso directo a Node.
 * Expone `window.electronAPI`. Cada canal devuelve { data } | { error };
 * BackendService (frontend) se encarga de hacer unwrap y throw si es error.
 */
import { contextBridge, ipcRenderer } from 'electron';

function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // ── App ──────────────────────────────────────────────────────────────
  getAppVersion: () => invoke('app:getVersion'),
  getDataPath: () => invoke('app:getDataPath'),

  // ── Professors ───────────────────────────────────────────────────────
  professors: {
    getAll: () => invoke('professors:getAll'),
    create: (data: unknown) => invoke('professors:create', data),
    update: (id: string, data: unknown) => invoke('professors:update', id, data),
    delete: (id: string) => invoke('professors:delete', id),
    reset: () => invoke('professors:reset'),
  },

  // ── Subjects ─────────────────────────────────────────────────────────
  subjects: {
    getAll: () => invoke('subjects:getAll'),
    create: (data: unknown) => invoke('subjects:create', data),
    update: (code: string, data: unknown) => invoke('subjects:update', code, data),
    delete: (code: string) => invoke('subjects:delete', code),
    updateProfessors: (code: string, professorIds: string[]) =>
      invoke('subjects:updateProfessors', code, professorIds),
    resetPensum: () => invoke('subjects:resetPensum'),
  },

  // ── Schedule ─────────────────────────────────────────────────────────
  schedule: {
    getBlocks: () => invoke('schedule:getBlocks'),
    saveBlocks: (blocks: unknown) => invoke('schedule:saveBlocks', blocks),
    getLoad: () => invoke('schedule:getLoad'),
    saveLoad: (load: unknown) => invoke('schedule:saveLoad', load),
  },

  // ── Logs ─────────────────────────────────────────────────────────────
  logs: {
    getAll: () => invoke('logs:getAll'),
    create: (action: string, details: string) => invoke('logs:create', action, details),
  },

  // ── System ───────────────────────────────────────────────────────────
  system: {
    restore: (payload: unknown) => invoke('system:restore', payload),
  },

  // ── Chat / Asistente IA ──────────────────────────────────────────────
  chat: {
    send: (messages: unknown) => invoke('chat:send', messages),
  },

  // ── Sincronización / Historial ───────────────────────────────────────
  sync: {
    status: () => invoke('sync:status'),
    diff: () => invoke('sync:diff'),
    push: (label?: string) => invoke('sync:push', label),
    pull: () => invoke('sync:pull'),
    history: () => invoke('sync:history'),
    restore: (id: number) => invoke('sync:restore', id),
  },
});
