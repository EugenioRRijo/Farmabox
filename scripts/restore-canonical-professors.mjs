/**
 * restore-canonical-professors — Deja como canónico el profesor con ACENTO (el del
 * .docx) por cada nombre, restaurándolo si estaba borrado, repuntando referencias del
 * resto y soft-borrando los duplicados (sin acento).
 *
 * Canónico por grupo (mismo nombre normalizado): prefiere ACENTOS → más referencias → type 'both'.
 * Si el grupo tiene referencias, el canónico queda ACTIVO (deleted_at=null).
 *
 *   node scripts/restore-canonical-professors.mjs           # DRY-RUN
 *   node scripts/restore-canonical-professors.mjs --apply   # aplica
 *
 * IMPORTANTE: asegúrate de que NINGUNA otra PC esté sincronizando mientras corres --apply.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const NOW = new Date().toISOString();
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
const hasAccents = (s) => s !== s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const profs = await rest('professors?select=id,full_name,type,deleted_at'); // TODOS (activos + borrados)
const load = await rest('academic_load?select=subject_code,professor_id,role');
const blocks = await rest('schedule_blocks?select=id,professor_id'); // todos
const links = await rest('professor_subjects?select=professor_id,subject_code');
const refCount = (id) => load.filter((r) => r.professor_id === id).length + blocks.filter((b) => b.professor_id === id).length + links.filter((l) => l.professor_id === id).length;

const groups = new Map();
for (const p of profs) { const k = norm(p.full_name); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }

const plan = [];
for (const g of groups.values()) {
  const sorted = [...g].sort((a, b) => {
    if (hasAccents(a.full_name) !== hasAccents(b.full_name)) return hasAccents(a.full_name) ? -1 : 1; // acentos primero
    const ra = refCount(a.id), rb = refCount(b.id); if (ra !== rb) return rb - ra;
    if ((a.type === 'both') !== (b.type === 'both')) return a.type === 'both' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  const keep = sorted[0], others = sorted.slice(1);
  const groupRefs = g.reduce((n, p) => n + refCount(p.id), 0);
  const restore = !!keep.deleted_at && groupRefs > 0;
  if (others.length === 0 && !restore) continue; // nada que hacer
  plan.push({ keep, others, restore, groupRefs });
}

console.log(`\nGrupos con acción: ${plan.length}`);
let nRestore = 0, nDelete = 0;
for (const { keep, others, restore, groupRefs } of plan) {
  console.log(`\n• "${keep.full_name}" (${keep.type})  ${restore ? '↩ RESTAURAR' : keep.deleted_at ? '(sigue borrado)' : '(activo)'}  · refs grupo: ${groupRefs}`);
  if (restore) nRestore++;
  for (const o of others) { console.log(`    fusionar/borrar ← "${o.full_name}" (${o.type}, ${refCount(o.id)} refs, ${o.deleted_at ? 'borrado' : 'ACTIVO'})`); nDelete++; }
}
console.log(`\nResumen: restaurar ${nRestore} profesores con acento · soft-borrar ${nDelete} duplicados/sin-acento.`);

if (!APPLY) { console.log('\n** DRY-RUN ** — no se modificó nada. Corre con --apply para aplicar.\n'); process.exit(0); }

console.log('\nAplicando...');
let mB = 0, mL = 0, dL = 0, mK = 0, dK = 0;
for (const { keep, others, restore } of plan) {
  if (restore) await rest(`professors?id=eq.${enc(keep.id)}`, { method: 'PATCH', body: JSON.stringify({ deleted_at: null, updated_at: NOW }) });
  const keepLoad = new Set(load.filter((r) => r.professor_id === keep.id).map((r) => `${r.subject_code}|${r.role}`));
  const keepLinks = new Set(links.filter((l) => l.professor_id === keep.id).map((l) => l.subject_code));
  for (const o of others) {
    await rest(`schedule_blocks?professor_id=eq.${enc(o.id)}`, { method: 'PATCH', body: JSON.stringify({ professor_id: keep.id, updated_at: NOW }) });
    mB += blocks.filter((b) => b.professor_id === o.id).length;
    for (const r of load.filter((x) => x.professor_id === o.id)) {
      const k = `${r.subject_code}|${r.role}`, q = `academic_load?professor_id=eq.${enc(o.id)}&subject_code=eq.${enc(r.subject_code)}&role=eq.${enc(r.role)}`;
      if (keepLoad.has(k)) { await rest(q, { method: 'DELETE' }); dL++; } else { await rest(q, { method: 'PATCH', body: JSON.stringify({ professor_id: keep.id, updated_at: NOW }) }); keepLoad.add(k); mL++; }
    }
    for (const l of links.filter((x) => x.professor_id === o.id)) {
      const q = `professor_subjects?professor_id=eq.${enc(o.id)}&subject_code=eq.${enc(l.subject_code)}`;
      if (keepLinks.has(l.subject_code)) { await rest(q, { method: 'DELETE' }); dK++; } else { await rest(q, { method: 'PATCH', body: JSON.stringify({ professor_id: keep.id }) }); keepLinks.add(l.subject_code); mK++; }
    }
    await rest(`professors?id=eq.${enc(o.id)}`, { method: 'PATCH', body: JSON.stringify({ deleted_at: NOW }) });
  }
}
console.log(`\nListo. bloques repunteados: ${mB} | carga: ${mL} mov / ${dL} borr | links: ${mK} mov / ${dK} borr\n`);
