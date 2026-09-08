/**
 * Ventana de actualización al abrir.
 *
 * ⚠️ LECCIÓN DE LA v2.3.23 — esta ventana dejó PCs trabadas. Era
 * `closable:false` + `alwaysOnTop:true`, y el timeout interno se renovaba con
 * cada evento de descarga, así que no tenía techo. Cuando el instalador NSIS
 * pedía permiso de Windows (UAC), el diálogo aparecía DETRÁS de esta ventana:
 * la persona veía "Actualizando…" encima, el permiso escondido atrás, y ninguna
 * forma de cerrar. Quedaba a merced del Administrador de tareas.
 *
 * Las tres reglas que salieron de eso, y que no hay que volver a romper:
 *   1. SIEMPRE cerrable. Nadie queda encerrado en su propia herramienta.
 *   2. NUNCA alwaysOnTop: tiene que poder pasarle el UAC por delante.
 *   3. Botón de escape visible a los 15 s, más un techo absoluto en el gate.
 *
 * El HTML va embebido en un data URL a propósito: tiene que funcionar ANTES de
 * que exista cualquier otra cosa, sin depender del frontend empaquetado ni de
 * rutas `file://` (que ya dieron problemas en el .exe).
 */
import { BrowserWindow } from 'electron';

const HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 16px; padding: 24px;
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #ffffff; color: #1f2937; user-select: none;
  }
  h1 { margin: 0; font-size: 17px; font-weight: 650; text-align: center; }
  p  { margin: 0; font-size: 13px; color: #6b7280; text-align: center; max-width: 320px; }
  .barra { width: 320px; height: 8px; border-radius: 999px; background: #e5e7eb; overflow: hidden; }
  .relleno { height: 100%; width: 0%; border-radius: 999px; background: #059669; transition: width .25s ease; }
  .pct { font-size: 12px; color: #6b7280; font-variant-numeric: tabular-nums; min-height: 18px; }
  button {
    margin-top: 4px; padding: 7px 14px; font-size: 12.5px; font-weight: 600;
    color: #4b5563; background: #f3f4f6; border: 1px solid #d1d5db;
    border-radius: 7px; cursor: pointer; visibility: hidden;
  }
  button:hover { background: #e5e7eb; }
</style></head>
<body>
  <h1 id="titulo">Buscando actualizaciones…</h1>
  <div class="barra"><div class="relleno" id="relleno"></div></div>
  <div class="pct" id="pct"></div>
  <p id="nota">Farmabox se está actualizando. Se reiniciará solo al terminar.</p>
  <button id="saltar">Continuar sin actualizar</button>
  <script>
    const { ipcRenderer } = require('electron');
    const $ = (id) => document.getElementById(id);
    ipcRenderer.on('gate:version', (_e, v) => {
      $('titulo').textContent = 'Actualizando a Farmabox ' + v;
    });
    ipcRenderer.on('gate:progreso', (_e, p) => {
      $('relleno').style.width = p + '%';
      $('pct').textContent = p + '%';
    });
    ipcRenderer.on('gate:instalando', () => {
      $('titulo').textContent = 'Instalando…';
      $('nota').textContent = 'La aplicación se va a reiniciar. Si Windows pide permiso, aceptalo.';
      $('saltar').style.visibility = 'hidden';
    });
    // Escape: aparece a los 15 s. Nunca dejar a nadie encerrado.
    setTimeout(() => { $('saltar').style.visibility = 'visible'; }, 15000);
    $('saltar').addEventListener('click', () => ipcRenderer.send('gate:saltar'));
  </script>
</body></html>`;

export function crearVentanaActualizacion(): BrowserWindow {
  const win = new BrowserWindow({
    width: 440,
    height: 290,
    frame: false,
    resizable: false,
    minimizable: true, // que se pueda apartar
    maximizable: false,
    closable: true, // REGLA 1: siempre se puede cerrar
    alwaysOnTop: false, // REGLA 2: el UAC tiene que poder ponerse delante
    center: true,
    show: true,
    title: 'Actualizando Farmabox',
    // nodeIntegration para que el HTML embebido escuche por ipcRenderer.
    // Es contenido propio, estático y sin red: no hay superficie de ataque.
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`);
  return win;
}
