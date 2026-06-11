/**
 * remove-postcorruption-professors — Quita los profesores que el reimport corrupto
 * creó hoy DESPUÉS de las 15:12 (updated_at entre 15:13 y 18:00), para volver al
 * roster real de la mañana (38). Soft-delete del profesor + limpia sus asignaciones
 * (academic_load, professor_subjects) y LIBERA sus bloques (professor_id=null, sin
 * borrar la clase).
 *
 *   node scripts/remove-postcorruption-professors.mjs           # DRY-RUN
 *   node scripts/remove-postcorruption-professors.mjs --apply   # aplica
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const NOW = new Date().toISOString();
const LO = '2026-06-11T12:00', HI = '2026-06-11T18:00'; // ventana post-corrupción (pre-restore 18:24)
const env = Object.fromEntries(readFileSync(join(__dirname, '..', 'src', 'frontend', '.env'), 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function rest(path, init = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${await res.text()}`);
  const t = await res.text(); return t ? JSON.parse(t) : null;
}
const enc = encodeURIComponent;

const all = await rest('professors?select=id,full_name,type,updated_at,deleted_at');
const targets = all.filter((p) => !p.deleted_at && (p.updated_at || '') >= LO && (p.updated_at || '') < HI);
const load = await rest('academic_load?select=professor_id');
const links = await rest('professor_subjects?select=professor_id');
const blocks = await rest('schedule_blocks?select=id,professor_id&deleted_at=is.null');
const cnt = (a, id) => a.filter((x) => x.professor_id === id).length;

console.log(`\nProfesores a QUITAR (post-corrupción, updated_at ${LO}–${HI}): ${targets.length}\n`);
let tl = 0, tk = 0, tb = 0;
for (const p of targets.sort((a, b) => a.full_name.localeCompare(b.full_name))) {
  const l = cnt(load, p.id), k = cnt(links, p.id), b = cnt(blocks, p.id);
  tl += l; tk += k; tb += b;
  console.log(`  • ${p.full_name} (${p.type})  carga:${l} materias:${k} bloques:${b}`);
}
console.log(`\nTotal: ${targets.length} profesores · ${tl} cargas · ${tk} materias-link · ${tb} bloques a liberar`);
console.log(`Quedarán: ${all.filter((p) => !p.deleted_at).length - targets.length} profesores activos.`);

if (!APPLY) { console.log('\n** DRY-RUN ** — no se modificó nada. Corre con --apply.\n'); process.exit(0); }

console.log('\nAplicando...');
for (const p of targets) {
  await rest(`academic_load?professor_id=eq.${enc(p.id)}`, { method: 'DELETE' });
  await rest(`professor_subjects?professor_id=eq.${enc(p.id)}`, { method: 'DELETE' });
  await rest(`schedule_blocks?professor_id=eq.${enc(p.id)}`, { method: 'PATCH', body: JSON.stringify({ professor_id: null, updated_at: NOW }) });
  await rest(`professors?id=eq.${enc(p.id)}`, { method: 'PATCH', body: JSON.stringify({ deleted_at: NOW }) });
}
console.log(`\nListo. ${targets.length} profesores post-corrupción quitados. Roster vuelto a 38.\n`);
