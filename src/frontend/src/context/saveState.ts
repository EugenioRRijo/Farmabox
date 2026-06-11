/**
 * saveState — Estado derivado de sincronización para la UI.
 *
 * Función pura (testeable) que decide qué mostrar según conectividad + guardado.
 * La usan el badge del header y cualquier indicador de estado.
 */
export type SyncKind = 'offline' | 'saving' | 'error' | 'saved';

export interface SyncInputs {
  online: boolean;
  isSaving: boolean;
  saveError: string | null;
}

export interface SyncStatusView {
  kind: SyncKind;
  label: string;
}

export function deriveSyncStatus({ online, isSaving, saveError }: SyncInputs): SyncStatusView {
  if (!online) return { kind: 'offline', label: 'Sin conexión — se subirá al reconectar' };
  if (isSaving) return { kind: 'saving', label: 'Guardando…' };
  if (saveError) return { kind: 'error', label: 'Error al guardar — reintentar' };
  return { kind: 'saved', label: 'Nube conectada · Guardado' };
}
