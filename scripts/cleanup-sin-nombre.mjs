/**
 * cleanup-sin-nombre.mjs — Elimina los profesores basura "Sin nombre" creados por una
 * importación mal parseada, replicando deleteProfessor de la app:
 *   - borra sus professor_subjects y academic_load (hard)
 *   - libera sus schedule_blocks (professor_id = null)
 *   - tombstonea el profesor (deleted_at = now) para que se propague a todas las PCs
 *
 * Uso:  node scripts/cleanup-sin-nombre.mjs [--dry]
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
const now = () => new Date().toISOString();
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

// 1) ids basura
const { data: garbage, error: e1 } = await sb
  .from('professors').select('id').eq('full_name', 'Sin nombre').is('deleted_at', null);
if (e1) throw e1;
const ids = garbage.map((g) => g.id);
console.log(`Profesores "Sin nombre" activos: ${ids.length}`);
if (!ids.length) { console.log('Nada que limpiar.'); process.exit(0); }
if (DRY) { console.log('--dry: no se borró nada.'); process.exit(0); }

// 2) borrar enlaces + carga + liberar bloques
let delLinks = 0, delLoad = 0;
for (const c of chunk(ids, 50)) {
  const r1 = await sb.from('professor_subjects').delete().in('professor_id', c).select('professor_id');
  if (r1.error) throw r1.error; delLinks += r1.data?.length ?? 0;
  const r2 = await sb.from('academic_load').delete().in('professor_id', c).select('professor_id');
  if (r2.error) throw r2.error; delLoad += r2.data?.length ?? 0;
  const r3 = await sb.from('schedule_blocks').update({ professor_id: null, updated_at: now() }).in('professor_id', c).select('id');
  if (r3.error) throw r3.error;
}
console.log(`Enlaces borrados: ${delLinks} | academic_load borrados: ${delLoad}`);

// 3) tombstone profesores
let soft = 0;
for (const c of chunk(ids, 50)) {
  const r = await sb.from('professors').update({ deleted_at: now(), updated_at: now() }).in('id', c).select('id');
  if (r.error) throw r.error; soft += r.data?.length ?? 0;
}
console.log(`Profesores tombstoneados: ${soft}`);
console.log('✅ Limpieza completa.');
