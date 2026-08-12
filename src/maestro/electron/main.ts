import { app, BrowserWindow } from 'electron';
import * as path from 'path';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 720,
    height: 800,
    title: 'Farmabox Maestro',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  // En dev Vite sirve en :5173; empaquetado carga el index.html construido.
  if (process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
