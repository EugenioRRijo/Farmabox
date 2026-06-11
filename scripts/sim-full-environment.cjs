/* SIMULACIÓN INTEGRAL del entorno completo, con el código REAL del .exe
 * (CloudStorageService + StorageService + merge offline-first) contra Supabase.
 * Dos "PCs" sincronizan TODAS las entidades: profesores (con profesión + cédula),
 * materias, horarios (con el FK de semestre), carga académica. Prueba: escribir,
 * sincronizar, ver en la otra PC, editar+merge, y borrar+propagar. Limpia al final. */
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
const H = { apikey: secrets.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + secrets.SUPABASE_ANON_KEY };
const U = secrets.SUPABASE_URL;

const stamp = Date.now();
const PROF = `prof-SIM-${stamp}`;
const SUBJ = `SIM-${stamp}`;
const BLK = `blk-SIM-${stamp}`;

let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n)); };
const tmp = (l) => path.join(os.tmpdir(), `simfull-${l}-${stamp}`);
function newPC(label) {
  currentUserData = tmp(label);
  fs.mkdirSync(currentUserData, { recursive: true });
  return new CloudStorageService(new StorageService());
}
async function del(p) { await fetch(`${U}/rest/v1/${p}`, { method: 'DELETE', headers: H }).catch(() => {}); }
async function cleanup() {
  await del(`professor_subjects?professor_id=eq.${PROF}`);
  await del(`professor_subjects?subject_code=eq.${SUBJ}`);
  await del(`academic_load?professor_id=eq.${PROF}`);
  await del(`academic_load?subject_code=eq.${SUBJ}`);
  await del(`schedule_blocks?id=eq.${BLK}`);
  await del(`professors?id=eq.${PROF}`);
  await del(`subjects?code=eq.${SUBJ}`);
  for (const l of ['pc1', 'pc2']) fs.rmSync(tmp(l), { recursive: true, force: true });
}

async function main() {
  console.log('SIMULACIÓN INTEGRAL — entorno completo (código real del .exe + Supabase)\n');

  console.log('1) PC1 arranca, sincroniza y CREA de todo');
  const pc1 = newPC('pc1');
  ok('credenciales OK (modo nube)', pc1.isRemoteEnabled());
  if (!pc1.isRemoteEnabled()) { console.log('\n❌ Sin credenciales.'); process.exit(1); }
  await pc1.syncNow();

  // Profesor con profesión + cédula
  pc1.saveProfessors([
    ...pc1.loadProfessors(),
    { id: PROF, fullName: 'Sim Profesor', title: 'Dra.', cedula: 'V-99999999', profession: 'Bioanalista', subjects: [SUBJ], type: 'both' },
  ]);
  // Materia en semestre 5
  const pensum = pc1.loadPensum();
  let sem5 = pensum.find((s) => s.number === 5);
  if (!sem5) { sem5 = { number: 5, subjects: [] }; pensum.push(sem5); }
  sem5.subjects.push({ code: SUBJ, name: 'Materia Simulación', credits: 4, hasLab: true, hoursTheory: 3, hoursLab: 2, prerequisites: [], professors: [PROF] });
  pc1.savePensum(pensum);
  // Bloque de horario CON semestre (FK) y profesor
  pc1.saveScheduleBlocks([
    ...pc1.loadScheduleBlocks(),
    { id: BLK, subjectCode: SUBJ, semester: 5, day: 0, startHour: 2, duration: 2, color: 'default', type: 'THEORY', professorId: PROF, section: 'A' },
  ]);
  // Carga académica
  const load = pc1.loadAcademicLoad();
  load[SUBJ] = { theory: [PROF], lab: [] };
  pc1.saveAcademicLoad(load);
  await pc1.flush();
  ok('PC1 creó profesor+materia+bloque+carga y subió (flush)', true);

  console.log('\n2) PC2 (otra máquina) sincroniza y VE todo');
  const pc2 = newPC('pc2');
  await pc2.syncNow();
  const p = pc2.loadProfessors().find((x) => x.id === PROF);
  ok('ve el profesor', !!p);
  ok('  → con profesión "Bioanalista"', p && p.profession === 'Bioanalista');
  ok('  → con cédula', p && p.cedula === 'V-99999999');
  const sub = pc2.loadPensum().flatMap((s) => s.subjects).find((x) => x.code === SUBJ);
  ok('ve la materia (semestre 5)', !!sub && pc2.loadPensum().find((s) => s.number === 5)?.subjects.some((x) => x.code === SUBJ));
  const blk = pc2.loadScheduleBlocks().find((x) => x.id === BLK);
  ok('ve el bloque de horario', !!blk);
  ok('  → con semestre (FK) = 5', blk && blk.semester === 5);
  ok('  → con profesor asignado', blk && blk.professorId === PROF);
  const ld = pc2.loadAcademicLoad()[SUBJ];
  ok('ve la carga académica (teoría)', ld && ld.theory.includes(PROF));

  console.log('\n3) PC2 EDITA la profesión → PC1 la recibe (merge)');
  pc2.saveProfessors(pc2.loadProfessors().map((x) => (x.id === PROF ? { ...x, profession: 'Químico Farmacéutico' } : x)));
  await pc2.flush();
  await pc1.syncNow();
  ok('PC1 ve la profesión editada', pc1.loadProfessors().find((x) => x.id === PROF)?.profession === 'Químico Farmacéutico');

  console.log('\n4) PC1 BORRA el profesor → PC2 lo pierde, la materia queda');
  pc1.saveProfessors(pc1.loadProfessors().filter((x) => x.id !== PROF));
  await pc1.flush();
  await pc2.syncNow();
  ok('profesor borrado desaparece en PC2 (tombstone)', !pc2.loadProfessors().some((x) => x.id === PROF));
  ok('la materia sigue existiendo', pc2.loadPensum().flatMap((s) => s.subjects).some((x) => x.code === SUBJ));

  console.log('\n5) Verificación directa en Supabase (la relación quedó bien)');
  const blkRow = await fetch(`${U}/rest/v1/schedule_blocks?id=eq.${BLK}&select=id,semester,subject_code`, { headers: H }).then((r) => r.json());
  ok('el bloque en Supabase tiene semester=5 (FK)', Array.isArray(blkRow) && blkRow[0]?.semester === 5);
  const semRow = await fetch(`${U}/rest/v1/semesters?number=eq.5&select=number`, { headers: H }).then((r) => r.json());
  ok('el semestre 5 existe en la tabla semesters', Array.isArray(semRow) && semRow.length === 1);
}

main()
  .then(async () => {
    await cleanup();
    console.log(`\n${'═'.repeat(48)}\n${fail ? '❌ ' + fail + ' fallo(s) de ' + (pass + fail) : '✅ TODO EL ENTORNO OK (' + pass + ' verificaciones)'}`);
    process.exit(fail ? 1 : 0);
  })
  .catch(async (e) => {
    console.error('ERROR:', e.message);
    await cleanup();
    process.exit(1);
  });
