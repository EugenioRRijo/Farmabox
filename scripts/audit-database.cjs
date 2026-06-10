/* Auditoría de la BASE DE DATOS (Supabase): existencia de tablas, columnas nuevas,
 * y que las RELACIONES (FK) realmente se cumplan — insertando filas válidas e
 * inválidas y verificando que Postgres acepte/rechace según corresponda. Limpia. */
const fs = require('fs');
const path = require('path');
const s = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'secrets.plain.json'), 'utf-8'));
const U = s.SUPABASE_URL;
const H = { apikey: s.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + s.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (d ? '  → ' + d : ''))); };
const get = (p) => fetch(`${U}/rest/v1/${p}`, { headers: H }).then(async (r) => ({ status: r.status, ok: r.ok, body: await r.json().catch(() => null) }));
const post = (t, row) => fetch(`${U}/rest/v1/${t}`, { method: 'POST', headers: H, body: JSON.stringify(row) }).then(async (r) => ({ status: r.status, ok: r.ok, body: await r.json().catch(() => null) }));
const del = (p) => fetch(`${U}/rest/v1/${p}`, { method: 'DELETE', headers: H }).catch(() => {});

const stamp = Date.now();

async function main() {
  console.log('TABLAS (existen y se consultan)');
  for (const t of ['professors', 'subjects', 'professor_subjects', 'academic_load', 'schedule_blocks', 'logs', 'semesters']) {
    const r = await get(`${t}?select=*&limit=1`);
    ok(`tabla ${t}`, r.ok, JSON.stringify(r.body));
  }

  console.log('\nCOLUMNAS NUEVAS');
  ok('professors.profession', (await get('professors?select=profession&limit=1')).ok);
  ok('schedule_blocks.semester', (await get('schedule_blocks?select=semester&limit=1')).ok);
  const sems = await get('semesters?select=number&order=number');
  ok('semesters tiene 10 filas (1..10)', Array.isArray(sems.body) && sems.body.length === 10 && sems.body[0].number === 1 && sems.body[9].number === 10);

  // refs reales para las pruebas de FK
  const someProf = (await get('professors?select=id&deleted_at=is.null&limit=1')).body?.[0]?.id;
  const someSubj = (await get('subjects?select=code&deleted_at=is.null&limit=1')).body?.[0]?.code;

  console.log('\nRELACIÓN: schedule_blocks.semester → semesters(number)');
  {
    const bad = `blk-DBAUDIT-bad-${stamp}`;
    const good = `blk-DBAUDIT-good-${stamp}`;
    // FK inválido (semestre 99999 no existe) → debe RECHAZAR
    const r1 = await post('schedule_blocks', { id: bad, day: 0, start_hour: 0, duration: 1, semester: 99999 });
    ok('rechaza un bloque con semestre inexistente (FK activa)', !r1.ok && r1.status === 409, `status ${r1.status}`);
    // FK válido (semestre 5) → debe ACEPTAR
    const r2 = await post('schedule_blocks', { id: good, day: 0, start_hour: 0, duration: 1, semester: 5 });
    ok('acepta un bloque con semestre válido (5)', r2.ok, `status ${r2.status} ${JSON.stringify(r2.body)}`);
    await del(`schedule_blocks?id=eq.${bad}`);
    await del(`schedule_blocks?id=eq.${good}`);
  }

  console.log('\nRELACIÓN M:N: professor_subjects → professors / subjects');
  if (someProf && someSubj) {
    // professor_id inexistente → rechazar (FK a professors)
    const r1 = await post('professor_subjects', { professor_id: `nope-${stamp}`, subject_code: someSubj });
    ok('rechaza link con profesor inexistente (FK a professors)', !r1.ok && r1.status === 409, `status ${r1.status}`);
    // subject_code inexistente → rechazar (FK a subjects)
    const r2 = await post('professor_subjects', { professor_id: someProf, subject_code: `NOPE-${stamp}` });
    ok('rechaza link con materia inexistente (FK a subjects)', !r2.ok && r2.status === 409, `status ${r2.status}`);
  } else {
    ok('professor_subjects FK (sin refs para probar)', false);
  }

  console.log('\nRELACIÓN: academic_load → professors / subjects');
  if (someSubj) {
    const r1 = await post('academic_load', { subject_code: someSubj, professor_id: `nope-${stamp}`, role: 'theory' });
    ok('rechaza carga con profesor inexistente (FK)', !r1.ok && r1.status === 409, `status ${r1.status}`);
  } else {
    ok('academic_load FK (sin refs)', false);
  }

  console.log(`\n${'═'.repeat(44)}\nRESULTADO BD: ${pass} OK · ${fail} fallos`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
