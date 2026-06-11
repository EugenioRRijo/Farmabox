/* Sube el seed (PENSUM_DATA + PROFESSORS_DATA) a las tablas relacionales de Supabase. */
const fs = require('fs');
const path = require('path');

const secrets = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'secrets.plain.json'), 'utf-8'),
);
const URL = secrets.SUPABASE_URL;
const KEY = secrets.SUPABASE_ANON_KEY;
const { PENSUM_DATA, PROFESSORS_DATA } = require(
  path.join(__dirname, '..', 'src', 'shared', 'dist', 'index.js'),
);
const now = new Date().toISOString();

const profRows = PROFESSORS_DATA.map((p) => ({
  id: p.id,
  full_name: p.fullName,
  title: p.title,
  email: p.email ?? null,
  cedula: p.cedula ?? null,
  type: p.type,
  updated_at: now,
}));

const subsFlat = PENSUM_DATA.flatMap((s) => s.subjects.map((sub) => ({ ...sub, _sem: s.number })));
const subjRows = subsFlat.map((s) => ({
  code: s.code,
  name: s.name,
  credits: s.credits,
  has_lab: s.hasLab,
  hours_theory: s.hoursTheory,
  hours_lab: s.hoursLab,
  semester: s._sem,
  lab_number: s.labNumber ?? null,
  prerequisites: s.prerequisites ?? [],
  updated_at: now,
}));

const profIds = new Set(PROFESSORS_DATA.map((p) => p.id));
const subjCodes = new Set(subsFlat.map((s) => s.code));
const linkSet = new Set();
const links = [];
const add = (pid, code) => {
  if (!profIds.has(pid) || !subjCodes.has(code)) return;
  const k = `${pid} ${code}`;
  if (linkSet.has(k)) return;
  linkSet.add(k);
  links.push({ professor_id: pid, subject_code: code });
};
for (const p of PROFESSORS_DATA) for (const c of p.subjects ?? []) add(p.id, c);
for (const s of subsFlat) for (const pid of s.professors ?? []) add(pid, s.code);

async function upsert(table, rows) {
  const r = await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    console.error(`✗ ${table}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    return false;
  }
  console.log(`✓ ${table}: ${rows.length} filas`);
  return true;
}

async function main() {
  if (!(await upsert('professors', profRows))) return;
  if (!(await upsert('subjects', subjRows))) return;
  await upsert('professor_subjects', links);
  console.log('\nListo. Revisá el Table Editor de Supabase.');
}
main().catch((e) => console.error('ERROR:', e.message));
