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
import { app, BrowserWindow, Menu } from 'electron';
import path from 'path';
import log from 'electron-log';
import { StorageService } from './services/StorageService';
import { CloudStorageService } from './services/CloudStorageService';
import { ProfessorService } from './services/ProfessorService';
import { SubjectService } from './services/SubjectService';
import { ScheduleService } from './services/ScheduleService';
import { LogService } from './services/LogService';
import { registerIpcHandlers } from './ipc/ipcHandlers';
import type { AppServices } from './ipc/ipcHandlers';
import type { IStorageService } from './services/IStorageService';

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
function buildServices(storage: IStorageService): AppServices {
  const professorService = new ProfessorService(storage);
  const subjectService = new SubjectService(storage, storage);
  const scheduleService = new ScheduleService(storage);
  const logService = new LogService(storage);
  return { storageService: storage, professorService, subjectService, scheduleService, logService };
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// ── Sync de cierre de sesión: pull + merge + push final antes de salir ──────
app.on('before-quit', (e) => {
  if (isQuitting || !cloud || !cloud.isCloudEnabled()) return;
  e.preventDefault();
  isQuitting = true;
  log.info('[Cloud] Sincronización de cierre de sesión...');
  cloud
    .syncFromCloud()
    .catch((err) => log.error('[Cloud] Error en sync de cierre:', err))
    .finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
