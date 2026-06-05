/* Prueba end-to-end de SharedFolderStorageService usando el dist compilado de electron.
 * Simula 2 PCs compartiendo una carpeta: PC1 guarda, PC2 sincroniza, y al revés. */
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

// electron-log intenta tocar electron en require; lo stubeamos para correr en Node puro.
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron-log' || request === 'electron-log/main') {
    return { transports: { file: { level: 'info' } }, info() {}, warn() {}, error() {} };
  }
  if (request === 'electron') {
    return { app: { getPath: () => os.tmpdir() } };
  }
  return origLoad.call(this, request, parent, isMain);
};

const distDir = path.join(__dirname, '..', 'src', 'electron', 'dist', 'services');
const { SharedFolderStorageService } = require(path.join(distDir, 'SharedFolderStorageService.js'));

function makeLocal() {
  const d = { professors: [], pensum: [], blocks: [], load: {}, logs: [] };
  return {
    loadProfessors: () => d.professors,
    saveProfessors: (x) => (d.professors = x),
    loadPensum: () => d.pensum,
    savePensum: (x) => (d.pensum = x),
    loadScheduleBlocks: () => d.blocks,
    saveScheduleBlocks: (x) => (d.blocks = x),
    loadAcademicLoad: () => d.load,
    saveAcademicLoad: (x) => (d.load = x),
    loadLogs: () => d.logs,
    saveLogs: (x) => (d.logs = x),
    getDataDir: () => path.join(os.tmpdir(), 'farmabox-local'),
  };
}

async function main() {
  const shared = path.join(os.tmpdir(), `farmabox-shared-${Date.now()}`);
  fs.mkdirSync(shared, { recursive: true });
  console.log('Carpeta compartida de prueba:', shared);

  // ── PC 1: carga un profesor y una materia, y hace flush a la carpeta ──────
  const pc1 = new SharedFolderStorageService(makeLocal(), shared);
  assert(pc1.isRemoteEnabled(), 'PC1 debería tener la carpeta habilitada');
  pc1.saveProfessors([{ id: 'p1', fullName: 'Ana Test', title: 'Prof.', subjects: ['M1'], type: 'both' }]);
  pc1.savePensum([{ number: 1, subjects: [{ code: 'M1', name: 'Materia 1', credits: 3, hasLab: false, hoursTheory: 3, hoursLab: 0, prerequisites: [] }] }]);
  await pc1.flush();

  const wrote = fs.existsSync(path.join(shared, 'farmabox-data', 'professors.json'));
  assert(wrote, 'PC1 debería haber escrito professors.json en la carpeta');
  console.log('✓ PC1 escribió en la carpeta compartida');

  // ── PC 2: arranca vacío, sincroniza, y debería recibir lo de PC1 ──────────
  const pc2 = new SharedFolderStorageService(makeLocal(), shared);
  await pc2.syncNow();
  const profs2 = pc2.loadProfessors();
  const pensum2 = pc2.loadPensum();
  assert(profs2.length === 1 && profs2[0].id === 'p1', 'PC2 debería ver el profesor de PC1');
  assert(pensum2.length === 1 && pensum2[0].subjects[0].code === 'M1', 'PC2 debería ver la materia de PC1');
  console.log('✓ PC2 recibió los datos de PC1 (profesor + materia)');

  // ── PC 2 agrega otro profesor; PC1 sincroniza y debería ver AMBOS (merge) ─
  pc2.saveProfessors([...profs2, { id: 'p2', fullName: 'Beto Test', title: 'Dr.', subjects: [], type: 'theory' }]);
  await pc2.flush();
  await pc1.syncNow();
  const profs1 = pc1.loadProfessors();
  assert(profs1.length === 2, `PC1 debería ver 2 profesores tras merge, vio ${profs1.length}`);
  console.log('✓ Merge OK: PC1 ve los 2 profesores (no se pisó nada)');

  // ── Borrado: PC1 borra p1; PC2 sincroniza y no debería verlo (tombstone) ──
  pc1.saveProfessors(profs1.filter((p) => p.id !== 'p1'));
  await pc1.flush();
  await pc2.syncNow();
  const profs2b = pc2.loadProfessors();
  assert(!profs2b.some((p) => p.id === 'p1'), 'PC2 no debería ver p1 tras borrado');
  assert(profs2b.some((p) => p.id === 'p2'), 'PC2 debería seguir viendo p2');
  console.log('✓ Borrado propaga vía tombstone (p1 desaparece, p2 queda)');

  fs.rmSync(shared, { recursive: true, force: true });
  console.log('\n✅ Carpeta compartida: TODAS las pruebas pasaron.');
}
main().catch((e) => {
  console.error('\n❌ FALLO:', e.message);
  process.exit(1);
});
