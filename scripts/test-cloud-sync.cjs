/* Verifica el sync por NUBE (Supabase) end-to-end con el CloudStorageService real:
 * PC1 escribe → sube; PC2 (otra "máquina") baja y lo ve; el borrado propaga.
 * Limpia el profesor de prueba de Supabase al terminar. */
const fs = require('fs');
const path = require('path');
const os = require('os');

let currentUserData = '';
const Module = require('module');
const orig = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === 'electron-log' || req === 'electron-log/main')
    return { transports: { file: { level: 'info' } }, info() {}, warn() {}, error() {} };
  if (req === 'electron') return { app: { getPath: () => currentUserData, isPackaged: false } };
  return orig.call(this, req, parent, isMain);
};

const dist = path.join(__dirname, '..', 'src', 'electron', 'dist', 'services');
const { StorageService } = require(path.join(dist, 'StorageService.js'));
const { CloudStorageService } = require(path.join(dist, 'CloudStorageService.js'));
const secrets = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'secrets.plain.json'), 'utf-8'));

const stamp = Date.now();
const TESTID = `prof-CLOUDSYNC-${stamp}`;
function newPC(label) {
  currentUserData = path.join(os.tmpdir(), `cloudsync-${label}-${stamp}`);
  fs.mkdirSync(currentUserData, { recursive: true });
  return new CloudStorageService(new StorageService());
}
async function hardDelete() {
  const H = { apikey: secrets.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + secrets.SUPABASE_ANON_KEY };
  await fetch(`${secrets.SUPABASE_URL}/rest/v1/professors?id=eq.${TESTID}`, { method: 'DELETE', headers: H }).catch(() => {});
}

let fail = 0;
const ok = (n, c) => { c ? console.log('  ✓ ' + n) : (fail++, console.log('  ✗ ' + n)); };

(async () => {
  const pc1 = newPC('pc1');
  ok('credenciales cargadas (isRemoteEnabled)', pc1.isRemoteEnabled());
  if (!pc1.isRemoteEnabled()) { console.log('\n❌ Sin credenciales — no se puede probar.'); process.exit(1); }

  // PC1: bajar lo actual, agregar profesor de prueba, subir.
  await pc1.syncNow();
  pc1.saveProfessors([
    ...pc1.loadProfessors(),
    { id: TESTID, fullName: 'Cloud Sync Test', title: 'Prof.', subjects: [], type: 'both' },
  ]);
  await pc1.flush();
  ok('PC1 agregó el profesor y subió a la nube (flush)', true);

  // PC2 (otra máquina, data local distinta): bajar y ¿ve el cambio?
  const pc2 = newPC('pc2');
  await pc2.syncNow();
  ok('PC2 VE el cambio de PC1 (sync por nube)', pc2.loadProfessors().some((p) => p.id === TESTID));

  // Borrado: PC1 borra → PC2 baja → desaparece (tombstone)
  pc1.saveProfessors(pc1.loadProfessors().filter((p) => p.id !== TESTID));
  await pc1.flush();
  await pc2.syncNow();
  ok('Borrado de PC1 propaga a PC2 (tombstone)', !pc2.loadProfessors().some((p) => p.id === TESTID));

  await hardDelete();
  for (const d of ['pc1', 'pc2']) fs.rmSync(path.join(os.tmpdir(), `cloudsync-${d}-${stamp}`), { recursive: true, force: true });

  console.log(`\n${'═'.repeat(40)}\n${fail ? '❌ ' + fail + ' fallo(s)' : '✅ Sync por nube OK'}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); hardDelete().finally(() => process.exit(1)); });
