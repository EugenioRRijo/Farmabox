/* Auditoría de los endpoints de importación en lote (bulkUpsert) contra Supabase,
 * replicando lo que hace supabaseWeb. Crea filas de prueba, verifica, y limpia. */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const s = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'secrets.plain.json'), 'utf-8'));
const sb = createClient(s.SUPABASE_URL, s.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const now = () => new Date().toISOString();
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + '  ' + d)); };

async function main() {
  // ── BULK PROFESORES ───────────────────────────────────────────────────────
  console.log('IMPORTAR PROFESORES EN LOTE');
  const profIds = ['prof-BULK-A', 'prof-BULK-B', 'prof-BULK-C'];
  await sb.from('professor_subjects').delete().in('professor_id', profIds);
  await sb.from('professors').delete().in('id', profIds);

  const { data: someSubj } = await sb.from('subjects').select('code').is('deleted_at', null).limit(1);
  const SUBJ = someSubj?.[0]?.code;

  const profRows = profIds.map((id, i) => ({
    id, full_name: 'Bulk Prof ' + i, title: 'Prof.', email: null, cedula: 'V-' + i, type: 'both',
    updated_at: now(), deleted_at: null,
  }));
  const up = await sb.from('professors').upsert(profRows);
  ok('upsert 3 profesores', !up.error, up.error?.message);
  if (SUBJ) {
    const links = profIds.map((id) => ({ professor_id: id, subject_code: SUBJ }));
    const lk = await sb.from('professor_subjects').upsert(links);
    ok('upsert sus links a materia', !lk.error, lk.error?.message);
  }
  const rd = await sb.from('professors').select('id,cedula').in('id', profIds).is('deleted_at', null);
  ok('los 3 quedan leíbles (con cédula)', (rd.data ?? []).length === 3 && rd.data.every((r) => r.cedula), rd.error?.message);
  await sb.from('professor_subjects').delete().in('professor_id', profIds);
  await sb.from('professors').delete().in('id', profIds);
  const after = await sb.from('professors').select('id').in('id', profIds);
  ok('limpieza (no quedan de prueba)', (after.data ?? []).length === 0);

  // ── BULK MATERIAS ─────────────────────────────────────────────────────────
  console.log('\nIMPORTAR MATERIAS EN LOTE');
  const codes = ['BULK-S-1', 'BULK-S-2'];
  await sb.from('subjects').delete().in('code', codes);
  const subjRows = codes.map((code, i) => ({
    code, name: 'Bulk Materia ' + i, credits: 3, has_lab: i === 1, hours_theory: 2, hours_lab: i === 1 ? 3 : 0,
    semester: 1, lab_number: i === 1 ? '999' : null, prerequisites: [], updated_at: now(), deleted_at: null,
  }));
  const su = await sb.from('subjects').upsert(subjRows);
  ok('upsert 2 materias', !su.error, su.error?.message);
  const rs = await sb.from('subjects').select('code,has_lab,lab_number').in('code', codes).is('deleted_at', null);
  ok('las 2 quedan leíbles (con lab/salón)', (rs.data ?? []).length === 2 && rs.data.some((r) => r.has_lab && r.lab_number === '999'), rs.error?.message);
  await sb.from('subjects').delete().in('code', codes);
  const after2 = await sb.from('subjects').select('code').in('code', codes);
  ok('limpieza (no quedan de prueba)', (after2.data ?? []).length === 0);

  console.log(`\n${'═'.repeat(40)}\nRESULTADO BULK: ${pass} OK · ${fail} fallos`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
