/**
 * Ventana de actualización obligatoria: lo único que se ve mientras baja la
 * versión nueva. No se puede cerrar ni minimizar — ese es el punto.
 *
 * Es HTML embebido en un data URL a propósito: tiene que funcionar ANTES de que
 * exista cualquier otra cosa (no depende del frontend empaquetado ni de rutas
 * de disco, que bajo `file://` en el .exe ya dieron problemas antes).
 */
import { BrowserWindow } from 'electron';

const HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 18px;
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #ffffff; color: #1f2937; user-select: none;
  }
  h1 { margin: 0; font-size: 17px; font-weight: 650; }
  p  { margin: 0; font-size: 13px; color: #6b7280; text-align: center; max-width: 300px; }
  .barra { width: 300px; height: 8px; border-radius: 999px; background: #e5e7eb; overflow: hidden; }
  .relleno { height: 100%; width: 0%; border-radius: 999px; background: #059669; transition: width .25s ease; }
  .pct { font-size: 12px; color: #6b7280; font-variant-numeric: tabular-nums; }
</style></head>
<body>
  <h1 id="titulo">Buscando actualizaciones…</h1>
  <div class="barra"><div class="relleno" id="relleno"></div></div>
  <div class="pct" id="pct"></div>
  <p id="nota">Farmabox se está actualizando. Se reiniciará solo al terminar.</p>
  <script>
    const { ipcRenderer } = require('electron');
    ipcRenderer.on('gate:version', (_e, v) => {
      document.getElementById('titulo').textContent = 'Actualizando a Farmabox ' + v;
    });
    ipcRenderer.on('gate:progreso', (_e, p) => {
      document.getElementById('relleno').style.width = p + '%';
      document.getElementById('pct').textContent = p + '%';
    });
    ipcRenderer.on('gate:instalando', () => {
      document.getElementById('titulo').textContent = 'Instalando…';
      document.getElementById('nota').textContent = 'La aplicación se va a reiniciar.';
    });
  </script>
</body></html>`;

export function crearVentanaActualizacion(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 250,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false, // obligatoria: no hay forma de saltearla
    alwaysOnTop: true,
    center: true,
    show: true,
    title: 'Actualizando Farmabox',
    // nodeIntegration para que el HTML embebido pueda escuchar por ipcRenderer.
    // Es contenido propio, estático y sin red: no hay superficie de ataque.
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`);
  return win;
}
