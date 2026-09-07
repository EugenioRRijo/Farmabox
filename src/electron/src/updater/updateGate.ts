/**
 * Portón de actualización OBLIGATORIA.
 *
 * Por qué existe: hasta la v2.3.22 el diálogo de actualización ofrecía "Más
 * tarde", así que una PC podía quedarse en una versión vieja indefinidamente
 * (esta misma máquina estuvo clavada en la 2.3.14 desde agosto). Eso dejó de ser
 * un detalle cuando una versión vieja resultó capaz de agotar la cuota de
 * Supabase de toda la organización: mientras UNA sola PC siguiera con el push
 * sin filtrar, seguía reescribiendo 2.499 filas por sincronización y emitiendo
 * un mensaje Realtime por cada una.
 *
 * Además, el arranque hacía `syncNow()` ANTES de chequear actualizaciones: la
 * versión vieja alcanzaba a escribir en la nube antes de enterarse de que había
 * update. Por eso este portón corre lo PRIMERO de todo, antes de construir los
 * servicios.
 *
 * REGLA DE ORO: esto nunca puede dejar a nadie afuera de su propia app. Ante
 * cualquier problema —sin internet, error del updater, servidor caído, descarga
 * colgada— deja pasar y la app abre normal. El portón sirve para actualizar a
 * quien PUEDE actualizarse, no para bloquear a quien no puede.
 */

export type ResultadoGate =
  | 'sin-actualizacion' // está al día → seguir
  | 'descargada' // hay update lista → reiniciar e instalar
  | 'error' // updater falló / sin red → seguir
  | 'timeout'; // tardó demasiado → seguir

/** La parte de `autoUpdater` que este módulo necesita (para poder testearlo). */
export interface UpdaterMinimo {
  on(evento: string, cb: (...args: never[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
}

export interface OpcionesGate {
  /** Cuánto esperar sin novedades antes de rendirse y dejar pasar. */
  timeoutMs: number;
  /** Progreso de descarga, 0-100 (entero). */
  onProgreso?: (porcentaje: number) => void;
  /** Versión encontrada, apenas se sabe. */
  onVersion?: (version: string) => void;
}

/**
 * Espera a que el updater diga algo. Resuelve UNA sola vez.
 *
 * El timeout se RENUEVA con cada evento de progreso: una descarga de 86 MB en
 * una conexión lenta puede tardar varios minutos, y no queremos cortarla a la
 * mitad; lo que sí queremos es no colgarnos para siempre si el updater enmudece.
 */
export function esperarActualizacion(
  updater: UpdaterMinimo,
  opts: OpcionesGate,
): Promise<ResultadoGate> {
  return new Promise<ResultadoGate>((resolve) => {
    let listo = false;
    let temporizador: ReturnType<typeof setTimeout>;

    const terminar = (r: ResultadoGate): void => {
      if (listo) return; // el primer resultado manda
      listo = true;
      clearTimeout(temporizador);
      resolve(r);
    };

    const renovarTimeout = (): void => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => terminar('timeout'), opts.timeoutMs);
    };
    renovarTimeout();

    updater.on('update-available', ((info: { version?: string }) => {
      if (info?.version) opts.onVersion?.(info.version);
      renovarTimeout();
    }) as never);

    updater.on('download-progress', ((p: { percent?: number }) => {
      if (typeof p?.percent === 'number') opts.onProgreso?.(Math.round(p.percent));
      renovarTimeout(); // la descarga avanza: no cortarla
    }) as never);

    updater.on('update-not-available', (() => terminar('sin-actualizacion')) as never);
    updater.on('update-downloaded', ((info: { version?: string }) => {
      if (info?.version) opts.onVersion?.(info.version);
      terminar('descargada');
    }) as never);
    updater.on('error', (() => terminar('error')) as never);

    updater.checkForUpdates().catch(() => terminar('error'));
  });
}
