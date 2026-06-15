/**
 * cleanup-orphan-links.mjs — Borra enlaces materia↔profesor (professor_subjects) y
 * cargas (academic_load) HUÉRFANOS: los que apuntan a un profesor que ya NO está activo
 * (tombstoneado). Origen: al eliminar el seed viejo (45 profesores de ejemplo, 11-jun)
 * no se limpiaron sus enlaces. Esto NO lo genera la importación.
 *
 * Conservador: NO toca las filas de profesores (deja los tombstones para el sync);
 * solo quita los enlaces/cargas colgantes que ensucian la lista de profesores por materia.
 *
 * Uso:  node scripts/cleanup-orphan-links.mjs [--dry]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');

const env = readFileSync(path.join(ROOT, 'src', 'frontend', '.env'), 'utf-8');
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const sb = createClient(get('VITE_SUPABASE_URL'), get('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

// 1) ids de profesores ACTIVOS
const { data: active, error: e1 } = await sb.from('professors').select('id').is('deleted_at', null);
if (e1) throw e1;
const activeIds = new Set(active.map((p) => p.id));

// 2) enlaces/cargas cuyo professor_id NO está activo
const { data: links, error: e2 } = await sb.from('professor_subjects').select('professor_id,subject_code');
if (e2) throw e2;
const { data: load, error: e3 } = await sb.from('academic_load').select('professor_id,subject_code,role');
if (e3) throw e3;

const orphanLinkProfs = [...new Set(links.filter((l) => !activeIds.has(l.professor_id)).map((l) => l.professor_id))];
const orphanLoadProfs = [...new Set(load.filter((l) => !activeIds.has(l.professor_id)).map((l) => l.professor_id))];
const orphanLinkCount = links.filter((l) => !activeIds.has(l.professor_id)).length;
const orphanLoadCount = load.filter((l) => !activeIds.has(l.professor_id)).length;

console.log(`Activos: ${activeIds.size}`);
console.log(`professor_subjects: ${links.length} (huérfanos: ${orphanLinkCount}, de ${orphanLinkProfs.length} profesores no activos)`);
console.log(`academic_load: ${load.length} (huérfanos: ${orphanLoadCount}, de ${orphanLoadProfs.length} profesores no activos)`);
if (DRY) { console.log('--dry: no se borró nada.'); process.exit(0); }
if (!orphanLinkProfs.length && !orphanLoadProfs.length) { console.log('Nada que limpiar.'); process.exit(0); }

let delLinks = 0, delLoad = 0;
for (const c of chunk(orphanLinkProfs, 50)) {
  const r = await sb.from('professor_subjects').delete().in('professor_id', c).select('professor_id');
  if (r.error) throw r.error; delLinks += r.data?.length ?? 0;
}
for (const c of chunk(orphanLoadProfs, 50)) {
  const r = await sb.from('academic_load').delete().in('professor_id', c).select('professor_id');
  if (r.error) throw r.error; delLoad += r.data?.length ?? 0;
}
console.log(`Enlaces huérfanos borrados: ${delLinks} | cargas huérfanas borradas: ${delLoad}`);
console.log('✅ Limpieza de huérfanos completa.');
