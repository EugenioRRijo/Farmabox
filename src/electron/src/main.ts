/**
 * main.ts — Proceso principal de Electron.
 *
 * Responsabilidades:
 *   1. Configurar logging
 *   2. Componer servicios (DI manual): StorageService local + CloudStorageService (sync)
 *   3. Registrar IPC handlers
 *   4. Splash screen con logo + ventana principal
 *   5. Ciclo de vida + sincronización (inicio y cierre de sesión)
 */
import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'path';
import os from 'os';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { esperarActualizacion } from './updater/updateGate';
import { crearVentanaActualizacion } from './updater/updateWindow';
import { StorageService } from './services/StorageService';
import { CloudStorageService } from './services/CloudStorageService';
import type { SyncStorageBase } from './services/SyncStorageBase';
import { getSharedDir, setSharedDir, getDeviceName, setDeviceName } from './config/appConfig';
import { ProfessorService } from './services/ProfessorService';
import { SubjectService } from './services/SubjectService';
import { ScheduleService } from './services/ScheduleService';
import { LogService } from './services/LogService';
import { SupabaseKeepaliveService } from './services/SupabaseKeepaliveService';
import { BackupService } from './services/BackupService';
import { registerIpcHandlers } from './ipc/ipcHandlers';
import type { AppServices } from './ipc/ipcHandlers';

// ── Logging ──────────────────────────────────────────────────────────────
log.transports.file.level = 'info';
log.info('Application starting...');

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let store: SyncStorageBase | null = null;
let keepalive: SupabaseKeepaliveService | null = null;
let backup: BackupService | null = null;
let isQuitting = false;
const IS_DEV = !app.isPackaged || process.env.NODE_ENV === 'development';
const VITE_DEV_URL = 'http://localhost:5173';

// Rutas a recursos (assets/ y splash.html viven en src/electron, un nivel sobre dist/).
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');
const SPLASH_PATH = path.join(__dirname, '..', 'splash.html');

// ── Composición de servicios (DI manual) ───────────────────────────────────
function buildServices(storage: SyncStorageBase): AppServices {
  const professorService = new ProfessorService(storage);
  const subjectService = new SubjectService(storage, storage);
  const scheduleService = new ScheduleService(storage);
  const logService = new LogService(storage);
  return { storageService: storage, professorService, subjectService, scheduleService, logService };
}

/** Elige el backend de sincronización: carpeta compartida si está configurada, si no Supabase. */
function buildStorage(): SyncStorageBase {
  const local = new StorageService();
  // Carpeta compartida RETIRADA: siempre nube (Supabase). Si quedó una config
  // previa de carpeta, la limpiamos para que el .exe vuelva a sincronizar por la nube.
  if (getSharedDir()) {
    log.info('[Storage] Carpeta compartida retirada → forzando nube y limpiando config previa.');
    setSharedDir(null);
  }
  log.info('[Storage] Modo nube (Supabase).');
  return new CloudStorageService(local);
}

// ── Splash screen ───────────────────────────────────────────────────────────
function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  const logoUrl = 'file:///' + LOGO_PATH.replace(/\\/g, '/');
  const splashUrl =
    'file:///' + SPLASH_PATH.replace(/\\/g, '/') + `?logo=${encodeURIComponent(logoUrl)}`;
  splashWindow.loadURL(splashUrl).catch((e) => log.error('Splash load error:', e));
}

function destroySplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.destroy();
  }
  splashWindow = null;
}

// ── Ventana principal ──────────────────────────────────────────────────────
function createWindow(): void {
  createSplash();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    title: 'Farmabox',
    icon: LOGO_PATH,
    backgroundColor: '#F3F4F6',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.setMenu(null);
  Menu.setApplicationMenu(null);

  if (IS_DEV) {
    log.info(`[Dev] Loading URL: ${VITE_DEV_URL}`);
    mainWindow.loadURL(VITE_DEV_URL).catch((e) => log.error('Failed to load Vite dev URL:', e));
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const htmlPath = path.join(__dirname, '..', 'frontend', 'index.html');
    log.info(`[Prod] Loading frontend from: ${htmlPath}`);
    mainWindow.loadFile(htmlPath).catch((err) => log.error('Failed to load index.html:', err));
  }

  const reveal = (): void => {
    setTimeout(() => {
      destroySplash();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    }, 1200);
  };
  mainWindow.once('ready-to-show', reveal);

  // Fallback de seguridad: revelar igual a los 12 s si 'ready-to-show' no dispara.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      destroySplash();
      mainWindow.show();
    }
  }, 12000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Actualización OBLIGATORIA al abrir ──────────────────────────────────────
/**
 * Corre ANTES que cualquier otra cosa del arranque. Si hay versión nueva, la
 * baja mostrando solo una ventana de progreso que no se puede cerrar, y
 * reinicia para instalarla. La app no llega a construir servicios ni a
 * sincronizar hasta que esté al día.
 *
 * Por qué tan estricto: una versión vieja de Farmabox agotó la cuota de
 * Supabase de toda la organización (subía todas las filas en cada push y cada
 * reescritura emitía un mensaje Realtime a cada PC). Mientras UNA máquina siga
 * atrasada, el problema vuelve. Y el diálogo anterior tenía "Más tarde", que en
 * la práctica significaba "nunca": esta misma PC estuvo en la 2.3.14 un mes.
 *
 * Por qué antes de `syncNow()`: el arranque sincronizaba ANTES de chequear
 * updates, así que la versión vieja alcanzaba a escribir en la nube igual.
 *
 * NUNCA deja a nadie afuera: sin internet, con error o si la descarga se cuelga,
 * devuelve el control y la app abre normal (ver updateGate).
 */
async function actualizacionObligatoria(): Promise<void> {
  if (IS_DEV) return; // en desarrollo no hay updates que buscar
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const win = crearVentanaActualizacion();
  const avisar = (canal: string, dato?: unknown): void => {
    if (!win.isDestroyed()) win.webContents.send(canal, dato);
  };

  try {
    const resultado = await esperarActualizacion(autoUpdater, {
      // Sin novedades del updater en 90 s (o 90 s sin avanzar la descarga) ⇒
      // no hacer esperar más a la persona. El timeout se renueva con cada
      // evento de progreso, así que una descarga lenta no se corta.
      timeoutMs: 90_000,
      onVersion: (v) => {
        log.info('[Updater] Actualización obligatoria a', v);
        avisar('gate:version', v);
      },
      onProgreso: (p) => avisar('gate:progreso', p),
    });
    log.info('[Updater] Resultado del portón:', resultado);

    if (resultado === 'descargada') {
      avisar('gate:instalando');
      isQuitting = true; // saltea el diálogo de "subir antes de salir"
      // Dar un instante para que se vea "Instalando…" antes de cerrar.
      await new Promise((r) => setTimeout(r, 800));
      autoUpdater.quitAndInstall(true, true);
      // quitAndInstall cierra la app; lo de abajo no se ejecuta.
      return;
    }
  } catch (e) {
    log.error('[Updater] El portón falló; se continúa sin actualizar:', e);
  } finally {
    if (!win.isDestroyed()) {
      win.destroy(); // closable:false no impide destroy()
    }
  }
}

// ── Nombre amigable del equipo (atribución "quién subió qué") ────────────────
/** El configurado por el usuario, o el hostname (que nunca falla) si no hay. */
function deviceNameEfectivo(): string {
  return getDeviceName() ?? os.hostname();
}

// ── Pull periódico: trae cambios de otras PCs durante la sesión ──────────────
// Red de seguridad por si el realtime no conecta (red/cuota). Con realtime activo,
// los cambios llegan en ~1 s; sin él, este pull los trae a lo sumo cada 5 min.
//
// Por qué 5 min y no 60 s: cada pull descarga las tablas sincronizadas, y a 60 s
// eso proyectaba ~20 GB/mes por PC contra el límite de 5 GB del plan free de
// Supabase (la organización ya se pasó una vez). Como el realtime está activo
// desde la migración 2.3, este intervalo NO es el camino normal por el que llegan
// los cambios: es el respaldo para cuando el websocket no conecta. Quintuplicarlo
// baja el gasto 5× y en el peor caso (realtime caído) los cambios tardan minutos
// en vez de segundos, algo aceptable para un horario académico.
const PERIODIC_SYNC_MS = 5 * 60 * 1000;

function setupPeriodicSync(): void {
  setInterval(() => {
    if (!store || !store.isRemoteEnabled()) return;
    store
      .syncNow()
      .then((r) => {
        if (r.changed && mainWindow && !mainWindow.isDestroyed()) {
          log.info('[Sync] Pull periódico trajo cambios → avisando al renderer.');
          mainWindow.webContents.send('data-changed', r.summary);
        }
      })
      .catch((e) => log.error('[Sync] Pull periódico falló:', e));
  }, PERIODIC_SYNC_MS);
}

// ── Realtime: reacciona a cambios de otras PCs casi al instante (#7) ─────────
// Coalesce de ráfagas (varios postgres_changes seguidos → un solo syncNow) para no
// martillar la base cuando otra PC guarda muchos bloques de golpe.
let realtimeDebounce: ReturnType<typeof setTimeout> | null = null;
function onRealtimeChange(): void {
  if (realtimeDebounce) clearTimeout(realtimeDebounce);
  realtimeDebounce = setTimeout(() => {
    realtimeDebounce = null;
    if (!store || !store.isRemoteEnabled()) return;
    store
      .syncNow()
      .then((r) => {
        if (r.changed && mainWindow && !mainWindow.isDestroyed()) {
          log.info('[Realtime] Cambio remoto → bajado y fusionado; avisando al renderer.');
          mainWindow.webContents.send('data-changed', r.summary);
        }
      })
      .catch((e) => log.error('[Realtime] syncNow falló:', e));
  }, 800);
}

// ── Sincronización manual (botón "Sincronizar ahora") + estado ──────────────
function registerSyncIpc(): void {
  ipcMain.handle('sync:now', async () => {
    try {
      if (!store || !store.isRemoteEnabled()) {
        return { data: { ok: false, changed: false, online: false } };
      }
      await store.flush(); // sube lo pendiente
      const r = await store.syncNow(); // baja + fusiona
      if (r.changed && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('data-changed', r.summary);
      }
      return { data: { ok: r.ok, changed: r.changed, online: true, at: new Date().toISOString() } };
    } catch (e) {
      log.error('[IPC sync:now]', e);
      return { error: 'No se pudo sincronizar' };
    }
  });

  // Vista previa de sincronización (dry-run): qué entra, qué se reemplaza y qué
  // subes, SIN tocar nada local ni remoto. La ventana del botón la muestra antes
  // de confirmar; si no hay remoto responde offline y la UI cae al texto genérico.
  ipcMain.handle('sync:preview', async () => {
    try {
      if (!store || !store.isRemoteEnabled()) {
        return {
          data: {
            ok: false,
            online: false,
            at: new Date().toISOString(),
            sections: [],
            totals: { nuevos: 0, actualizados: 0, eliminados: 0, subes: 0 },
          },
        };
      }
      return { data: await store.previewSync() };
    } catch (e) {
      log.error('[IPC sync:preview]', e);
      return { error: 'No se pudo calcular la vista previa' };
    }
  });

  ipcMain.handle('sync:status', () => {
    const online = !!store && store.isRemoteEnabled();
    // `device`: nombre amigable configurado por el usuario (atribución multi-PC);
    // fallback os.hostname(), que nunca falla. Si viniera vacío, el frontend cae
    // a un texto genérico.
    return { data: { online, mode: getSharedDir() ? 'folder' : 'cloud', device: deviceNameEfectivo() } };
  });

  // ── Nombre del equipo (firma de las escrituras de esta PC) ────────────────
  ipcMain.handle('config:getDeviceName', () => {
    try {
      return { data: deviceNameEfectivo() };
    } catch (e) {
      log.error('[IPC config:getDeviceName]', e);
      return { error: 'No se pudo leer el nombre del equipo' };
    }
  });
  ipcMain.handle('config:setDeviceName', (_e, name: unknown) => {
    try {
      const limpio = typeof name === 'string' ? name.trim() : '';
      if (limpio.length > 40) {
        return { error: 'El nombre no puede superar los 40 caracteres' };
      }
      setDeviceName(limpio || null); // vacío → borra la clave (vuelve al hostname)
      const efectivo = deviceNameEfectivo();
      // El sellado usa el nombre nuevo al instante (solo escrituras futuras).
      store?.setDeviceName(efectivo);
      return { data: { ok: true, name: efectivo } };
    } catch (e) {
      log.error('[IPC config:setDeviceName]', e);
      return { error: 'No se pudo guardar el nombre del equipo' };
    }
  });
}

// ── Mantenimiento: keepalive de Supabase + backups locales ──────────────────
function registerMaintenanceIpc(): void {
  ipcMain.handle('maintenance:keepaliveStatus', () => {
    return { data: keepalive ? keepalive.getStatus() : null };
  });

  ipcMain.handle('maintenance:pingNow', async () => {
    try {
      if (!keepalive) return { error: 'Keepalive no inicializado' };
      return { data: await keepalive.ping() };
    } catch (e) {
      log.error('[IPC maintenance:pingNow]', e);
      return { error: 'No se pudo hacer ping a Supabase' };
    }
  });

  ipcMain.handle('maintenance:createBackup', async () => {
    try {
      if (!backup) return { error: 'Backup no inicializado' };
      return { data: { ok: await backup.createBackup() } };
    } catch (e) {
      log.error('[IPC maintenance:createBackup]', e);
      return { error: 'No se pudo crear el backup' };
    }
  });
}

// ── Ciclo de vida ──────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  log.info('App ready. Initializing services...');

  // PRIMERO de todo: si hay versión nueva, actualizar y reiniciar. Nada de lo
  // que sigue (servicios, sync, ventana) debe correr con una versión atrasada.
  await actualizacionObligatoria();

  store = buildStorage();
  // Nombre con el que esta PC firma sus escrituras (updatedBy): el configurado
  // por el usuario, o el hostname si no hay.
  store.setDeviceName(deviceNameEfectivo());
  // Si el merge previo a un guardado trae cambios de otra PC, avisar al renderer
  // (con el resumen de lo entrante para el toast + panel de actividad).
  store.setOnMerged((summary) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('data-changed', summary);
    }
  });
  const services = buildServices(store);
  registerIpcHandlers(services);
  registerSyncIpc();
  registerMaintenanceIpc();
  log.info('[IPC] All handlers registered.');

  // Mantenimiento: evita que el proyecto Supabase (free-tier) se pause por
  // inactividad y crea backups locales periódicos como red de seguridad.
  keepalive = new SupabaseKeepaliveService();
  keepalive.startAutoKeepAlive();
  backup = new BackupService(store);
  backup.startAutoBackup();

  // Sincronizar (pull + merge) al iniciar, antes de mostrar la UI.
  if (store.isRemoteEnabled()) {
    log.info('[Sync] Sincronizando al iniciar...');
    await store.syncNow();
    // Realtime: propaga cambios de otras PCs en ~1 s (requiere habilitar la
    // publicación supabase_realtime en la base — ver docs/migracion-2.3-concurrencia.sql).
    store.startRealtime(onRealtimeChange);
  }

  createWindow();

  // (La actualización ya se resolvió arriba, antes de tocar la nube.)

  // Traer cambios de otras PCs cada minuto (red de seguridad si el realtime no conecta).
  setupPeriodicSync();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// ── Cierre de sesión: guardar lo último pendiente al remoto (silencioso) ────
app.on('before-quit', async (e) => {
  if (isQuitting || !store || !store.isRemoteEnabled()) return;
  e.preventDefault();
  isQuitting = true;
  try {
    log.info('[Sync] Guardando antes de salir...');
    store.stopRealtime();
    await store.flush();
  } catch (err) {
    log.error('[Sync] Guardado de cierre falló:', err);
  }
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
