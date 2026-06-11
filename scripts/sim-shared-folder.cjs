/* Simulación realista de la carpeta compartida: dos "PCs" (StorageService real,
 * con el pensum sembrado) comparten una carpeta en disco. Incluye un caso de error
 * (carpeta inaccesible). Muestra qué pasa paso a paso. */
const fs = require('fs');
const path = require('path');
const os = require('os');

// Stubs para correr el código de Electron en Node puro.
let currentUserData = '';
const Module = require('module');
const orig = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === 'electron-log' || req === 'electron-log/main')
    return { transports: { file: { level: 'info' } }, info() {}, warn() {}, error() {} };
  if (req === 'electron') return { app: { getPath: () => currentUserData } };
  return orig.call(this, req, parent, isMain);
};

const dist = path.join(__dirname, '..', 'src', 'electron', 'dist', 'services');
const { StorageService } = require(path.join(dist, 'StorageService.js'));
const { SharedFolderStorageService } = require(path.join(dist, 'SharedFolderStorageService.js'));

const stamp = Date.now();
const SHARED = path.join(os.tmpdir(), `sim-shared-${stamp}`);
fs.mkdirSync(SHARED, { recursive: true });

function newPC(label) {
  currentUserData = path.join(os.tmpdir(), `sim-${label}-${stamp}`);
  fs.mkdirSync(currentUserData, { recursive: true });
  const local = new StorageService();
  return new SharedFolderStorageService(local, SHARED);
}

const line = (s) => console.log(s);
const sep = () => line('─'.repeat(64));

async function main() {
  line('SIMULACIÓN — carpeta compartida: ' + SHARED + '\n');

  // ── PC1 arranca (sembrado) ────────────────────────────────────────────────
  const pc1 = newPC('pc1');
  line(`1) PC1 arranca → ${pc1.loadProfessors().length} profesores, ${pc1.loadPensum().length} semestres (sembrado del pensum).`);

  // PC1 agrega un profesor y edita una materia
  pc1.saveProfessors([...pc1.loadProfessors(), { id: 'sim-uno', fullName: 'Test Uno', title: 'Prof.', subjects: [], type: 'both' }]);
  const pensum1 = pc1.loadPensum();
  pensum1[0].subjects[0] = { ...pensum1[0].subjects[0], name: pensum1[0].subjects[0].name + ' (EDITADA POR PC1)' };
  pc1.savePensum(pensum1);
  await pc1.flush();
  line(`   PC1 agrega "Test Uno" y edita la 1ª materia, y hace flush.`);

  // ── Archivos en la carpeta compartida ─────────────────────────────────────
  sep();
  line('2) La carpeta compartida ahora tiene:');
  for (const f of fs.readdirSync(path.join(SHARED, 'farmabox-data'))) {
    const st = fs.statSync(path.join(SHARED, 'farmabox-data', f));
    line(`   - ${f}  (${st.size} bytes)`);
  }

  // ── PC2 arranca y sincroniza ──────────────────────────────────────────────
  sep();
  const pc2 = newPC('pc2');
  line(`3) PC2 arranca (otra PC, sembrado) → sincroniza...`);
  const r = await pc2.syncNow();
  line(`   syncNow → ok:${r.ok}, cambios:${r.changed}, datasets:[${r.merged.join(', ')}]`);
  const sawUno = pc2.loadProfessors().some((p) => p.id === 'sim-uno');
  const sawEdit = pc2.loadPensum()[0].subjects[0].name.includes('EDITADA POR PC1');
  line(`   PC2 ve a "Test Uno": ${sawUno ? 'SÍ ✓' : 'NO ✗'} | ve la materia editada: ${sawEdit ? 'SÍ ✓' : 'NO ✗'}`);

  // ── PC2 agrega otro profe; PC1 sincroniza (merge sin pisar) ────────────────
  sep();
  pc2.saveProfessors([...pc2.loadProfessors(), { id: 'sim-dos', fullName: 'Test Dos', title: 'Dr.', subjects: [], type: 'theory' }]);
  await pc2.flush();
  line('4) PC2 agrega "Test Dos" y hace flush. PC1 sincroniza...');
  await pc1.syncNow();
  const p1 = pc1.loadProfessors();
  line(`   PC1 ve a "Test Uno": ${p1.some((p) => p.id === 'sim-uno') ? 'SÍ ✓' : 'NO ✗'} | ve a "Test Dos": ${p1.some((p) => p.id === 'sim-dos') ? 'SÍ ✓' : 'NO ✗'}  (merge sin pisarse)`);

  // ── Borrado propaga ───────────────────────────────────────────────────────
  sep();
  pc1.saveProfessors(pc1.loadProfessors().filter((p) => p.id !== 'sim-uno'));
  await pc1.flush();
  line('5) PC1 borra "Test Uno" y hace flush. PC2 sincroniza...');
  await pc2.syncNow();
  const p2 = pc2.loadProfessors();
  line(`   "Test Uno" en PC2: ${p2.some((p) => p.id === 'sim-uno') ? 'TODAVÍA (✗)' : 'BORRADO ✓'} | "Test Dos" sigue: ${p2.some((p) => p.id === 'sim-dos') ? 'SÍ ✓' : 'NO ✗'}  (tombstone)`);

  // ── CASO DE ERROR: carpeta inaccesible ────────────────────────────────────
  sep();
  line('6) CASO DE ERROR — carpeta de red inexistente (\\\\NO-EXISTE\\x):');
  currentUserData = path.join(os.tmpdir(), `sim-pc3-${stamp}`);
  fs.mkdirSync(currentUserData, { recursive: true });
  const pc3 = new SharedFolderStorageService(new StorageService(), '\\\\NO-EXISTE-12345\\x');
  line(`   isRemoteEnabled(): ${pc3.isRemoteEnabled()} (debe ser false → no congela ni crashea)`);
  let crashed = false;
  try {
    pc3.saveProfessors([{ id: 'x', fullName: 'Local', title: 'Prof.', subjects: [], type: 'both' }]);
    await pc3.flush(); // no-op porque no hay remoto
    const res = await pc3.syncNow();
    line(`   guardar + flush + syncNow sin remoto → sin error (syncNow ok:${res.ok}). Sigue local: ${pc3.loadProfessors().length} profe(s).`);
  } catch (e) {
    crashed = true;
    line('   ✗ CRASHEÓ: ' + e.message);
  }
  line(`   ¿crasheó?: ${crashed ? 'SÍ ✗' : 'NO ✓ (degrada a local, como debe)'}`);

  // limpieza
  sep();
  for (const d of [SHARED, path.join(os.tmpdir(), `sim-pc1-${stamp}`), path.join(os.tmpdir(), `sim-pc2-${stamp}`), path.join(os.tmpdir(), `sim-pc3-${stamp}`)]) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  line('Listo. (Se limpiaron las carpetas temporales de la simulación.)');
}
main().catch((e) => {
  console.error('\n❌ ERROR FATAL:', e.message);
  process.exit(1);
});
