/**
 * Electron IPC Service — utilidades puntuales sobre window.electronAPI.
 *
 * NOTA: el grueso de la comunicación IPC (profesores, materias, horarios) vive
 * en BackendService, que detecta el entorno (IPC en Electron / HTTP en web).
 * Este módulo solo expone utilidades sueltas del proceso main.
 */

export const electronService = {
  /** ¿Estamos corriendo dentro de Electron? */
  isElectron: (): boolean => typeof window !== 'undefined' && !!window.electronAPI,

  /** Versión de la app reportada por el proceso main. */
  getAppVersion: async (): Promise<string> => {
    if (!window.electronAPI) {
      throw new Error('electronAPI not available. Are you running in Electron?');
    }
    return window.electronAPI.getAppVersion();
  },
};
