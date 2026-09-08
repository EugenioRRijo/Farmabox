/**
 * Regla de cierre al quedarse sin ventanas.
 *
 * EL BUG QUE ESTO ARREGLA (v2.3.23 y v2.3.24, reportado como "se actualiza y se
 * cierra"): el portón de actualización abre su propia ventana ANTES de que
 * exista la ventana principal. Cuando el portón terminaba y destruía esa
 * ventana, Electron emitía `window-all-closed` —porque efectivamente no quedaba
 * ninguna— y el handler llamaba `app.quit()`. La app se cerraba antes de llegar
 * a `createWindow()`. Desde afuera parecía que la actualización mataba la app.
 *
 * La causa de fondo fue mía: metí una ventana en el arranque sin revisar qué
 * más reaccionaba a que se cerrara.
 *
 * La regla: mientras la app está ARRANCANDO, quedarse sin ventanas es normal y
 * transitorio (es el hueco entre destruir la del portón y crear la principal),
 * así que no hay que cerrar nada. Recién cuando el arranque terminó, quedarse
 * sin ventanas significa de verdad que la persona cerró la app.
 */

export interface EstadoArranque {
  /** true hasta que la ventana principal existe. */
  arrancando: boolean;
  /** `process.platform`. */
  plataforma: string;
}

/** ¿Hay que cerrar la app al quedarse sin ventanas? */
export function debeCerrarSinVentanas({ arrancando, plataforma }: EstadoArranque): boolean {
  if (arrancando) return false; // hueco del arranque: no es un cierre real
  return plataforma !== 'darwin'; // en macOS la app vive sin ventanas
}
