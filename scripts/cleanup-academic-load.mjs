/**
 * cleanup-academic-load — Limpieza única de la carga académica en Supabase.
 *
 * Regla (según el tipo de cada profesor):
 *   - role='lab'    + type='theory'   → sobra (profesor de teoría en columna práctica) → BORRAR
 *   - role='theory' + type='practice' → sobra (profesor de práctica en columna teoría) → BORRAR
 *   - type='both' → se mantienen ambos roles (da teoría y práctica de verdad)
 *
 * Uso:
 *   node scripts/cleanup-academic-load.mjs           # DRY-RUN: solo muestra qué borraría
 *   node scripts/cleanup-academic-load.mjs --apply   # aplica el borrado
 *
 * Credenciales: se leen de src/frontend/.env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

// ── Leer .env ────────────────────────────────────────────────────────────────
const envPath = join(__dirname, '..', 'src', 'frontend', '.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en src/frontend/.env');
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function rest(path, init = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Cargar datos ─────────────────────────────────────────────────────────────
const professors = await rest('professors?select=id,full_name,type');
const load = await rest('academic_load?select=subject_code,professor_id,role');
const subjects = await rest('subjects?select=code,name');

const profById = new Map(professors.map((p) => [p.id, p]));
const subjName = new Map(subjects.map((s) => [s.code, s.name]));

// ── Clasificar filas ─────────────────────────────────────────────────────────
const toDelete = [];
const dangling = [];
for (const r of load) {
  const p = profById.get(r.professor_id);
  if (!p) { dangling.push(r); continue; }
  const t = p.type; // 'theory' | 'practice' | 'both'
  if (r.role === 'lab' && t === 'theory') toDelete.push({ ...r, why: `${p.full_name} es de teoría` });
  else if (r.role === 'theory' && t === 'practice') toDelete.push({ ...r, why: `${p.full_name} es de práctica` });
}

// ── Reporte ──────────────────────────────────────────────────────────────────
console.log(`\nTotal filas academic_load: ${load.length}`);
console.log(`Profesores: ${professors.length}  |  type 'both': ${professors.filter((p) => p.type === 'both').length}\n`);

console.log(`Filas a BORRAR por rol incorrecto: ${toDelete.length}`);
for (const r of toDelete) {
  console.log(`  - ${subjName.get(r.subject_code) ?? r.subject_code} [${r.role}] → ${r.why}`);
}

console.log(`\nFilas colgantes (profesor borrado): ${dangling.length}`);
for (const r of dangling) {
  console.log(`  - ${subjName.get(r.subject_code) ?? r.subject_code} [${r.role}] prof_id=${r.professor_id}`);
}

// Diagnóstico: profesores que aparecen en teoría Y práctica de la misma materia.
const dup = new Map(); // code -> Set(profId que están en ambos)
const byCode = new Map();
for (const r of load) {
  if (!byCode.has(r.subject_code)) byCode.set(r.subject_code, { theory: new Set(), lab: new Set() });
  byCode.get(r.subject_code)[r.role === 'lab' ? 'lab' : 'theory'].add(r.professor_id);
}
console.log('\nProfesores en AMBAS columnas de una misma materia (posible duplicado visual):');
let dupCount = 0;
for (const [code, roles] of byCode) {
  for (const pid of roles.theory) {
    if (roles.lab.has(pid)) {
      const p = profById.get(pid);
      console.log(`  - ${subjName.get(code) ?? code}: ${p?.full_name ?? pid} (type=${p?.type ?? '??'})`);
      dupCount++;
    }
  }
}
if (dupCount === 0) console.log('  (ninguno)');

// ── Aplicar ──────────────────────────────────────────────────────────────────
if (!APPLY) {
  console.log('\n** DRY-RUN ** — no se borró nada. Corre con --apply para aplicar.\n');
  process.exit(0);
}

if (toDelete.length === 0) {
  console.log('\nNada que borrar. Listo.\n');
  process.exit(0);
}

console.log(`\nAplicando borrado de ${toDelete.length} filas...`);
let ok = 0;
for (const r of toDelete) {
  const q = `academic_load?subject_code=eq.${encodeURIComponent(r.subject_code)}&professor_id=eq.${encodeURIComponent(r.professor_id)}&role=eq.${encodeURIComponent(r.role)}`;
  await rest(q, { method: 'DELETE' });
  ok++;
}
console.log(`Borradas ${ok} filas. Listo.\n`);
