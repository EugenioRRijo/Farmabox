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
import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import path from 'path';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { StorageService } from './services/StorageService';
import { CloudStorageService } from './services/CloudStorageService';
import type { SyncStorageBase } from './services/SyncStorageBase';
import { getSharedDir, setSharedDir } from './config/appConfig';
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

// ── Auto-actualización (electron-updater + GitHub Releases) ──────────────────
function setupAutoUpdater(): void {
  if (IS_DEV) return; // solo en la app instalada (empaquetada)
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    log.info('[Updater] Actualización disponible:', info.version);
  });
  autoUpdater.on('update-not-available', () => {
    log.info('[Updater] La app está al día.');
  });
  autoUpdater.on('error', (err) => {
    log.error('[Updater] Error:', err == null ? 'desconocido' : err.message);
  });
  autoUpdater.on('update-downloaded', (info) => {
    const choice = dialog.showMessageBoxSync({
      type: 'info',
      buttons: ['Reiniciar ahora', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
      title: 'Actualización disponible',
      message: `Farmabox ${info.version} está lista para instalarse.`,
      detail: 'Se aplicará al reiniciar la aplicación.',
    });
    if (choice === 0) {
      isQuitting = true; // saltea el diálogo de "subir antes de salir"
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.checkForUpdates().catch((e) => log.error('[Updater] checkForUpdates falló:', e));
}

// ── Pull periódico: trae cambios de otras PCs durante la sesión ──────────────
function setupPeriodicSync(): void {
  setInterval(() => {
    if (!store || !store.isRemoteEnabled()) return;
    store
      .syncNow()
      .then((r) => {
        if (r.changed && mainWindow && !mainWindow.isDestroyed()) {
          log.info('[Sync] Pull periódico trajo cambios → avisando al renderer.');
          mainWindow.webContents.send('data-changed');
        }
      })
      .catch((e) => log.error('[Sync] Pull periódico falló:', e));
  }, 60000); // cada 60 s
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
        mainWindow.webContents.send('data-changed');
      }
      return { data: { ok: r.ok, changed: r.changed, online: true, at: new Date().toISOString() } };
    } catch (e) {
      log.error('[IPC sync:now]', e);
      return { error: 'No se pudo sincronizar' };
    }
  });

  ipcMain.handle('sync:status', () => {
    const online = !!store && store.isRemoteEnabled();
    return { data: { online, mode: getSharedDir() ? 'folder' : 'cloud' } };
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
  store = buildStorage();
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
  }

  createWindow();

  // Chequear actualizaciones (solo en la app instalada).
  setupAutoUpdater();

  // Traer cambios de otras PCs cada minuto (avisa al renderer si hubo cambios).
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
