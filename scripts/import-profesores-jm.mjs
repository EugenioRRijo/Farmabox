/**
 * import-profesores-jm.mjs — Importa la lista de profesores JM a Supabase replicando
 * EXACTAMENTE lo que hace la app:
 *   1) professors            (bulkUpsertProfessors → profRow)
 *   2) professor_subjects    (setProfessorLinks)
 *   3) academic_load (roles) (seedAcademicLoadFromProfessors → reconcileProfessorLoad)
 *
 * El paso 3 NO lo hace el bulk de la app (lo deriva en memoria desde v2.3.4), pero lo
 * sembramos aquí para que los roles se vean también en máquinas con versión vieja.
 *
 * Credenciales: src/frontend/.env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
 * Uso:  node scripts/import-profesores-jm.mjs [--dry] <ruta-al-csv>
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── args ──
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const csvPath =
  args.find((a) => a.endsWith('.csv')) ||
  path.join(ROOT, '..', 'profesores-JM-import.csv');

// ── env ──
const env = readFileSync(path.join(ROOT, 'src', 'frontend', '.env'), 'utf-8');
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const URL = get('VITE_SUPABASE_URL');
const KEY = get('VITE_SUPABASE_ANON_KEY');
if (!URL || !KEY) throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en src/frontend/.env');

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const now = () => new Date().toISOString();

// ── 1) parsear CSV (fullName,title,cedula,type,subjects) ──
const lines = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
const header = lines.shift().split(',').map((s) => s.trim());
const idx = (name) => header.indexOf(name);
const splitList = (s) => (s ? s.split(/[;,|]/).map((x) => x.trim()).filter(Boolean) : []);

const stamp = Date.now();
const professors = lines.map((line, i) => {
  const cols = line.split(',');
  return {
    id: `prof-${stamp}-${i}`,
    fullName: (cols[idx('fullName')] ?? '').trim() || 'Sin nombre',
    title: (cols[idx('title')] ?? '').trim() || 'Prof.',
    cedula: (cols[idx('cedula')] ?? '').trim() || null,
    type: (cols[idx('type')] ?? '').trim() || 'both',
    subjects: splitList(cols[idx('subjects')] ?? ''),
  };
});

// ── 2) labSet: materias con has_lab=true (para la regla de roles) ──
const { data: subjRows, error: subjErr } = await sb.from('subjects').select('code,has_lab').is('deleted_at', null);
if (subjErr) throw subjErr;
const labSet = new Set(subjRows.filter((s) => s.has_lab).map((s) => s.code));
const validCodes = new Set(subjRows.map((s) => s.code));

// ── validación: todos los códigos del CSV existen ──
const unknown = [];
for (const p of professors) for (const c of p.subjects) if (!validCodes.has(c)) unknown.push(`${p.fullName} → ${c}`);
if (unknown.length) {
  console.error('❌ Códigos inexistentes en subjects:\n' + unknown.join('\n'));
  process.exit(1);
}

// ── 3) academic_load por reconcileProfessorLoad (givesTheory/givesLab) ──
const load = {}; // code → { theory:Set, lab:Set }
const entry = (c) => (load[c] ??= { theory: new Set(), lab: new Set() });
for (const p of professors) {
  const givesTheory = p.type === 'theory' || p.type === 'both';
  const givesLab = p.type === 'practice' || p.type === 'both';
  for (const c of p.subjects) {
    if (givesTheory) entry(c).theory.add(p.id);
    if (givesLab && labSet.has(c)) entry(c).lab.add(p.id);
  }
}

// ── filas a escribir ──
const profSupported = !(await sb.from('professors').select('profession').limit(1)).error;
const profRows = professors.map((p) => {
  const r = { id: p.id, full_name: p.fullName, title: p.title, email: null, cedula: p.cedula, type: p.type, updated_at: now(), deleted_at: null };
  if (profSupported) r.profession = null;
  return r;
});
const linkRows = professors.flatMap((p) => p.subjects.map((c) => ({ professor_id: p.id, subject_code: c })));
const loadRows = [];
for (const [code, v] of Object.entries(load)) {
  for (const pid of v.theory) loadRows.push({ subject_code: code, professor_id: pid, role: 'theory', updated_at: now() });
  for (const pid of v.lab) loadRows.push({ subject_code: code, professor_id: pid, role: 'lab', updated_at: now() });
}

console.log(`Profesores: ${profRows.length} | enlaces: ${linkRows.length} | academic_load: ${loadRows.length} (theory=${loadRows.filter((r) => r.role === 'theory').length}, lab=${loadRows.filter((r) => r.role === 'lab').length})`);
console.log(`profession soportada: ${profSupported} | CSV: ${csvPath}`);
if (DRY) { console.log('--dry: no se escribió nada.'); process.exit(0); }

// ── escribir (upsert idempotente por PK) ──
let r;
r = await sb.from('professors').upsert(profRows, { onConflict: 'id' });
if (r.error) throw r.error;
r = await sb.from('professor_subjects').upsert(linkRows, { onConflict: 'professor_id,subject_code' });
if (r.error) throw r.error;
r = await sb.from('academic_load').upsert(loadRows, { onConflict: 'subject_code,professor_id,role' });
if (r.error) throw r.error;

console.log('✅ Importación completa.');
