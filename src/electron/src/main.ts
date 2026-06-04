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
import { app, BrowserWindow, Menu, dialog } from 'electron';
import path from 'path';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { StorageService } from './services/StorageService';
import { CloudStorageService } from './services/CloudStorageService';
import { ProfessorService } from './services/ProfessorService';
import { SubjectService } from './services/SubjectService';
import { ScheduleService } from './services/ScheduleService';
import { LogService } from './services/LogService';
import { registerIpcHandlers } from './ipc/ipcHandlers';
import type { AppServices } from './ipc/ipcHandlers';

// ── Logging ──────────────────────────────────────────────────────────────
log.transports.file.level = 'info';
log.info('Application starting...');

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let cloud: CloudStorageService | null = null;
let isQuitting = false;
const IS_DEV = !app.isPackaged || process.env.NODE_ENV === 'development';
const VITE_DEV_URL = 'http://localhost:5173';

// Rutas a recursos (assets/ y splash.html viven en src/electron, un nivel sobre dist/).
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');
const SPLASH_PATH = path.join(__dirname, '..', 'splash.html');

// ── Composición de servicios (DI manual) ───────────────────────────────────
function buildServices(storage: CloudStorageService): AppServices {
  const professorService = new ProfessorService(storage);
  const subjectService = new SubjectService(storage, storage);
  const scheduleService = new ScheduleService(storage);
  const logService = new LogService(storage);
  return { storageService: storage, cloud: storage, professorService, subjectService, scheduleService, logService };
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

// ── Ciclo de vida ──────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  log.info('App ready. Initializing services...');
  const localStore = new StorageService();
  cloud = new CloudStorageService(localStore);
  const services = buildServices(cloud);
  registerIpcHandlers(services);
  log.info('[IPC] All handlers registered.');

  // Sincronizar (pull + merge) al iniciar, antes de mostrar la UI.
  if (cloud.isCloudEnabled()) {
    log.info('[Cloud] Sincronizando al iniciar...');
    await cloud.syncFromCloud();
  }

  createWindow();

  // Chequear actualizaciones (solo en la app instalada).
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// ── Cierre de sesión: si hay cambios sin subir, preguntar antes de salir ────
app.on('before-quit', async (e) => {
  if (isQuitting || !cloud || !cloud.isCloudEnabled()) return;

  let pending = 0;
  let summary = '';
  try {
    const diff = cloud.getPendingDiff();
    pending = diff.total;
    summary = diff.summary;
  } catch {
    pending = 0;
  }
  if (pending <= 0) return; // nada que subir → salir normal

  e.preventDefault();
  const choice = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['Subir y salir', 'Salir sin subir', 'Cancelar'],
    defaultId: 0,
    cancelId: 2,
    title: 'Cambios sin subir',
    message: `Tenés ${pending} cambio${pending === 1 ? '' : 's'} sin subir.`,
    detail: summary
      ? `${summary}\n\n¿Querés subirlos a la nube antes de salir?`
      : '¿Querés subirlos a la nube antes de salir?',
  });

  if (choice === 2) return; // Cancelar → no salir
  isQuitting = true;
  if (choice === 0) {
    log.info('[Cloud] Subiendo cambios antes de salir...');
    try {
      await cloud.pushSession('Cierre de sesión');
    } catch (err) {
      log.error('[Cloud] Push de cierre falló:', err);
    }
  }
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
