/**
 * restore-corrupted-blocks — Restaura SOLO los bloques borrados por la corrupción de hoy
 * que son seguros de recuperar.
 *
 * Candidato seguro = bloque borrado que cumple TODO:
 *   1. deleted_at de HOY (2026-06-11) — ventana de la corrupción
 *   2. semester real (no null) — ignora bloques legacy sin semestre
 *   3. su rango horario NO está cubierto por ningún bloque activo en (sem,sec,día) — sin conflicto
 *   4. su materia+tipo NO está ya activa en esa (sem,sec) — la clase está realmente ausente
 * (No se restauran borrados de días previos = ediciones legítimas.)
 *
 *   node scripts/restore-corrupted-blocks.mjs           # DRY-RUN (lista candidatos)
 *   node scripts/restore-corrupted-blocks.mjs --apply   # restaura (deleted_at=null)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const TODAY = '2026-06-11';
const env = Object.fromEntries(readFileSync(join(__dirname, '..', 'src', 'frontend', '.env'), 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function rest(path, init = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${await res.text()}`);
  const t = await res.text(); return t ? JSON.parse(t) : null;
}
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
const fmt = (i) => { const s = 7 * 60 + i * 45, h = (Math.floor(s / 60) % 24), m = s % 60, h12 = ((h + 11) % 12) + 1; return `${h12}:${String(m).padStart(2, '0')}`; };

const active = await rest('schedule_blocks?select=semester,section,day,start_hour,duration,subject_code,type&deleted_at=is.null');
const del = await rest('schedule_blocks?select=id,semester,section,day,start_hour,duration,subject_code,type,deleted_at&deleted_at=not.is.null');
const subs = await rest('subjects?select=code,name');
const subName = new Map(subs.map((s) => [s.code, s.name]));

// Cobertura activa por (sem,sec,día): conjunto de horas cubiertas + materias presentes.
const coveredHours = new Map(); // key sem|sec|day -> Set(hours)
const activeSubjects = new Map(); // key sem|sec -> Set(subject|type)
for (const a of active) {
  const dk = `${a.semester}|${a.section}|${a.day}`;
  if (!coveredHours.has(dk)) coveredHours.set(dk, new Set());
  for (let h = a.start_hour; h < a.start_hour + (a.duration || 1); h++) coveredHours.get(dk).add(h);
  const sk = `${a.semester}|${a.section}`;
  if (!activeSubjects.has(sk)) activeSubjects.set(sk, new Set());
  activeSubjects.get(sk).add(`${a.subject_code}|${a.type}`);
}

const candidates = del.filter((b) => {
  if (!(b.deleted_at || '').startsWith(TODAY)) return false;
  if (b.semester == null) return false;
  const dk = `${b.semester}|${b.section}|${b.day}`, sk = `${b.semester}|${b.section}`;
  const cov = coveredHours.get(dk) || new Set();
  for (let h = b.start_hour; h < b.start_hour + (b.duration || 1); h++) if (cov.has(h)) return false; // conflicto horario
  if ((activeSubjects.get(sk) || new Set()).has(`${b.subject_code}|${b.type}`)) return false; // ya activa
  return true;
});

// Dedup: el mismo slot+materia pudo borrarse varias veces; restaurar uno solo.
const seen = new Set(), uniq = [];
for (const b of candidates) {
  const k = `${b.semester}|${b.section}|${b.day}|${b.start_hour}|${b.subject_code}|${b.type}`;
  if (!seen.has(k)) { seen.add(k); uniq.push(b); }
}

console.log(`\nCandidatos seguros a restaurar (hoy, semestre real, sin conflicto, materia ausente): ${uniq.length}`);
const bySec = {};
for (const b of uniq) { (bySec[`Sem ${b.semester} Sec ${b.section}`] ||= []).push(b); }
for (const [k, arr] of Object.entries(bySec)) {
  console.log(`\n  ${k} (${arr.length}):`);
  for (const b of arr.sort((x, y) => x.day - y.day || x.start_hour - y.start_hour))
    console.log(`    ${DAYS[b.day]} ${fmt(b.start_hour)} ${b.type === 'LAB' ? '[Lab]' : '[Teo]'} ${subName.get(b.subject_code) || b.subject_code}`);
}

if (!APPLY) { console.log(`\n** DRY-RUN ** — no se restauró nada. Corre con --apply para restaurar ${uniq.length} bloques.\n`); process.exit(0); }

console.log('\nRestaurando...');
let n = 0;
for (const b of uniq) { await rest(`schedule_blocks?id=eq.${encodeURIComponent(b.id)}`, { method: 'PATCH', body: JSON.stringify({ deleted_at: null }) }); n++; }
console.log(`\nListo. Bloques restaurados: ${n}\n`);
