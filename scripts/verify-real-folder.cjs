/* Verifica la carpeta compartida contra una carpeta REAL del disco (argv[2]),
 * usando el MISMO código que la app (StorageService + SharedFolderStorageService).
 * No borra nada: deja los archivos para inspeccionar. */
const fs = require('fs');
const path = require('path');
const os = require('os');

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

const SHARED = process.argv[2];
if (!SHARED) {
  console.error('Uso: node verify-real-folder.cjs <ruta-carpeta>');
  process.exit(1);
}

async function main() {
  fs.mkdirSync(SHARED, { recursive: true }); // la carpeta "compartida" debe existir
  currentUserData = path.join(os.tmpdir(), `verify-userdata-${Date.now()}`);
  fs.mkdirSync(currentUserData, { recursive: true });

  const store = new SharedFolderStorageService(new StorageService(), SHARED);
  console.log('isRemoteEnabled():', store.isRemoteEnabled());

  // La app, en modo carpeta, hace esto al guardar: sella + guarda local + sube.
  const profs = store.loadProfessors();
  store.saveProfessors([
    ...profs,
    { id: 'VERIF-REAL', fullName: 'VERIFICACIÓN CARPETA REAL', title: 'Prof.', subjects: [], type: 'both' },
  ]);
  await store.flush();

  const dataDir = path.join(SHARED, 'farmabox-data');
  console.log('\nArchivos escritos en', dataDir + ':');
  for (const f of fs.readdirSync(dataDir)) {
    console.log(`  - ${f}  (${fs.statSync(path.join(dataDir, f)).size} bytes)`);
  }

  // Releer el archivo desde la carpeta y confirmar que el marcador quedó ahí.
  const written = JSON.parse(fs.readFileSync(path.join(dataDir, 'professors.json'), 'utf-8'));
  const marker = written.find((p) => p.id === 'VERIF-REAL');
  console.log('\nMarcador en professors.json de la carpeta:', marker ? `"${marker.fullName}" ✓` : 'NO ENCONTRADO ✗');
  console.log('Total profesores en la carpeta:', written.length);

  fs.rmSync(currentUserData, { recursive: true, force: true });
}
main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
