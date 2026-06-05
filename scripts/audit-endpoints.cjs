/* Auditoría de "endpoints" = operaciones de datos contra Supabase (las que usan
 * la web vía supabaseWeb y el .exe vía CloudStorageService). Prueba lecturas y
 * roundtrips de escritura/borrado con la anon key, y limpia lo que crea. */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const secrets = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'secrets.plain.json'), 'utf-8'),
);
const sb = createClient(secrets.SUPABASE_URL, secrets.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const now = () => new Date().toISOString();

let pass = 0;
let fail = 0;
function ok(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}  ${detail}`);
  }
}

async function main() {
  console.log('LECTURAS');
  for (const t of ['professors', 'subjects', 'professor_subjects', 'academic_load', 'schedule_blocks', 'logs']) {
    const { error, count } = await sb.from(t).select('*', { count: 'exact', head: false }).limit(1);
    ok(`GET ${t}`, !error, error ? error.message : '');
  }

  // refs reales para las FKs
  const { data: someProf } = await sb.from('professors').select('id').is('deleted_at', null).limit(1);
  const { data: someSubj } = await sb.from('subjects').select('code').is('deleted_at', null).limit(1);
  const PROF = someProf?.[0]?.id;
  const SUBJ = someSubj?.[0]?.code;

  console.log('\nPROFESORES (crear→leer→editar→borrar)');
  {
    const id = 'prof-AUDIT-TMP';
    await sb.from('professor_subjects').delete().eq('professor_id', id);
    await sb.from('professors').delete().eq('id', id);
    const c = await sb.from('professors').upsert({ id, full_name: 'Audit Tmp', title: 'Prof.', type: 'both', cedula: 'V-1', updated_at: now(), deleted_at: null });
    ok('CREATE professor', !c.error, c.error?.message);
    const r = await sb.from('professors').select('*').eq('id', id).maybeSingle();
    ok('READ created (con cedula)', r.data && r.data.full_name === 'Audit Tmp' && r.data.cedula === 'V-1', r.error?.message);
    const u = await sb.from('professors').update({ full_name: 'Audit Edit' }).eq('id', id);
    ok('UPDATE professor', !u.error, u.error?.message);
    if (SUBJ) {
      const l = await sb.from('professor_subjects').insert({ professor_id: id, subject_code: SUBJ });
      ok('LINK professor↔subject', !l.error, l.error?.message);
    }
    const d = await sb.from('professors').update({ deleted_at: now() }).eq('id', id);
    ok('SOFT-DELETE professor', !d.error, d.error?.message);
    const live = await sb.from('professors').select('id').eq('id', id).is('deleted_at', null);
    ok('queda fuera de los vivos', (live.data ?? []).length === 0);
    await sb.from('professor_subjects').delete().eq('professor_id', id);
    await sb.from('professors').delete().eq('id', id); // cleanup
  }

  console.log('\nMATERIAS (crear→leer→editar→borrar)');
  {
    const code = 'AUDIT-TMP-001';
    await sb.from('subjects').delete().eq('code', code);
    const c = await sb.from('subjects').upsert({ code, name: 'Materia Audit', credits: 3, has_lab: false, hours_theory: 3, hours_lab: 0, semester: 1, prerequisites: [], updated_at: now(), deleted_at: null });
    ok('CREATE subject', !c.error, c.error?.message);
    const u = await sb.from('subjects').update({ name: 'Materia Audit 2', lab_number: '999' }).eq('code', code);
    ok('UPDATE subject', !u.error, u.error?.message);
    const r = await sb.from('subjects').select('*').eq('code', code).maybeSingle();
    ok('READ updated subject', r.data && r.data.name === 'Materia Audit 2' && r.data.lab_number === '999', r.error?.message);
    const d = await sb.from('subjects').update({ deleted_at: now() }).eq('code', code);
    ok('SOFT-DELETE subject', !d.error, d.error?.message);
    await sb.from('subjects').delete().eq('code', code); // cleanup
  }

  console.log('\nCARGA ACADÉMICA (insert→leer→borrar)');
  if (PROF && SUBJ) {
    const c = await sb.from('academic_load').insert({ subject_code: SUBJ, professor_id: PROF, role: 'theory', updated_at: now() });
    ok('CREATE academic_load', !c.error, c.error?.message);
    const r = await sb.from('academic_load').select('*').eq('subject_code', SUBJ).eq('professor_id', PROF).eq('role', 'theory');
    ok('READ academic_load', (r.data ?? []).length === 1, r.error?.message);
    const d = await sb.from('academic_load').delete().eq('subject_code', SUBJ).eq('professor_id', PROF).eq('role', 'theory');
    ok('DELETE academic_load', !d.error, d.error?.message);
  } else {
    ok('academic_load (sin refs)', false, 'no hay profe/materia para probar');
  }

  console.log('\nBLOQUES DE HORARIO (crear→leer→borrar)');
  {
    const id = 'blk-AUDIT-TMP';
    await sb.from('schedule_blocks').delete().eq('id', id);
    const c = await sb.from('schedule_blocks').upsert({ id, subject_code: SUBJ ?? null, day: 0, start_hour: 0, duration: 1, color: 'x', updated_at: now(), deleted_at: null });
    ok('CREATE schedule_block', !c.error, c.error?.message);
    const r = await sb.from('schedule_blocks').select('*').eq('id', id).maybeSingle();
    ok('READ schedule_block', r.data && r.data.day === 0, r.error?.message);
    const d = await sb.from('schedule_blocks').update({ deleted_at: now() }).eq('id', id);
    ok('SOFT-DELETE schedule_block', !d.error, d.error?.message);
    await sb.from('schedule_blocks').delete().eq('id', id); // cleanup
  }

  console.log('\nLOGS (insert→leer→borrar)');
  {
    const id = 'log-AUDIT-TMP';
    await sb.from('logs').delete().eq('id', id);
    const c = await sb.from('logs').insert({ id, action: 'Audit', details: 'test', timestamp: now(), updated_at: now(), deleted_at: null });
    ok('CREATE log', !c.error, c.error?.message);
    const r = await sb.from('logs').select('*').eq('id', id).maybeSingle();
    ok('READ log', r.data && r.data.action === 'Audit', r.error?.message);
    await sb.from('logs').delete().eq('id', id); // cleanup
  }

  console.log(`\n${'═'.repeat(40)}\nRESULTADO: ${pass} OK · ${fail} fallos`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error('ERROR fatal:', e.message);
  process.exit(1);
});
