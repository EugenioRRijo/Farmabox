/**
 * selftest-main.cjs — Test full-stack del runtime real de Farmabox.
 *
 * Reutiliza el código compilado (servicios + ipcHandlers + preload reales),
 * carga el frontend de Vite en una ventana oculta y ejecuta un round-trip IPC
 * DESDE el renderer: profesores, materias y chat. Prueba toda la cadena
 * renderer → preload → IPC → main → servicios → storage/nube/Gemini.
 *
 * Requiere Vite corriendo en :5173.  Ejecutar:
 *   env -u ELECTRON_RUN_AS_NODE npx electron scripts/selftest-main.cjs
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');

const D = path.join(__dirname, '..', 'src', 'electron', 'dist');
const { StorageService } = require(path.join(D, 'services/StorageService'));
const { CloudStorageService } = require(path.join(D, 'services/CloudStorageService'));
const { ProfessorService } = require(path.join(D, 'services/ProfessorService'));
const { SubjectService } = require(path.join(D, 'services/SubjectService'));
const { ScheduleService } = require(path.join(D, 'services/ScheduleService'));
const { LogService } = require(path.join(D, 'services/LogService'));
const { registerIpcHandlers } = require(path.join(D, 'ipc/ipcHandlers'));

app.whenReady().then(async () => {
  const localStore = new StorageService();
  const cloud = new CloudStorageService(localStore);
  registerIpcHandlers({
    storageService: cloud,
    professorService: new ProfessorService(cloud),
    subjectService: new SubjectService(cloud, cloud),
    scheduleService: new ScheduleService(cloud),
    logService: new LogService(cloud),
    cloud: cloud,
  });

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(D, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadURL('http://localhost:5173');
  } catch (e) {
    console.log('SELFTEST_RESULT ' + JSON.stringify({ fatal: 'load failed: ' + e.message }));
    app.quit();
    return;
  }

  // Dar tiempo a React a montar y cargar datos
  await new Promise((r) => setTimeout(r, 4500));

  const report = await win.webContents.executeJavaScript(`(async () => {
    const out = {};
    const root = document.getElementById('root');
    out.reactMounted = !!(root && root.children.length > 0);
    out.electronAPI = !!window.electronAPI;
    out.navInicio = document.body.innerText.includes('Inicio');
    out.navMaterias = document.body.innerText.includes('Materias');
    try { const r = await window.electronAPI.professors.getAll(); out.professors = ('data' in r) ? r.data.length : ('ERR:'+r.error); } catch(e){ out.professors = 'EX:'+e.message; }
    try { const r = await window.electronAPI.subjects.getAll(); out.subjects = ('data' in r) ? r.data.length : ('ERR:'+r.error); } catch(e){ out.subjects = 'EX:'+e.message; }
    try { const r = await window.electronAPI.schedule.getBlocks(); out.blocks = ('data' in r) ? r.data.length : ('ERR:'+r.error); } catch(e){ out.blocks = 'EX:'+e.message; }
    try { const r = await window.electronAPI.chat.send([{role:'user',text:'di OK'}]); out.chat = ('data' in r) ? (r.data.offline?'offline-fallback':'online-gemini') : ('ERR:'+r.error); } catch(e){ out.chat = 'EX:'+e.message; }
    try { const r = await window.electronAPI.sync.status(); out.syncStatus = ('data' in r) ? r.data : ('ERR:'+r.error); } catch(e){ out.syncStatus = 'EX:'+e.message; }
    try { const r = await window.electronAPI.sync.diff(); out.syncDiff = ('data' in r) ? { total: r.data.total, summary: r.data.summary } : ('ERR:'+r.error); } catch(e){ out.syncDiff = 'EX:'+e.message; }
    out.navSync = document.body.innerText.includes('Sincronización');
    // Navegar a /sync (click en el item del sidebar) y verificar que renderiza
    try {
      const link = [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/sync');
      if (link) { link.click(); await new Promise(r => setTimeout(r, 1500)); }
      out.syncPageRendered = document.body.innerText.includes('Sincronización y Versiones') || document.body.innerText.includes('Cómo funciona');
    } catch(e){ out.syncPageRendered = 'EX:'+e.message; }
    return JSON.stringify(out);
  })()`);

  console.log('SELFTEST_RESULT ' + report);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
