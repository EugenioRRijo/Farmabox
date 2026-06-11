/**
 * wipe-all-professors — Vacía TODOS los profesores para empezar de cero (la facultad
 * los vuelve a cargar con su info y asigna quién da cada materia).
 *
 * Hace:
 *   - soft-delete de TODOS los profesores activos (deleted_at)
 *   - borra TODA la carga académica (academic_load) y los links (professor_subjects)
 *   - LIBERA los bloques de horario (professor_id = null) — conserva las clases/horas
 * NO toca: materias (subjects), semestres, ni las horas de los bloques.
 *
 *   node scripts/wipe-all-professors.mjs           # DRY-RUN
 *   node scripts/wipe-all-professors.mjs --apply   # aplica
 *
 * IMPORTANTE: cierra Farmabox en TODAS las PCs antes de --apply (si una sincroniza,
 * vuelve a subir los profesores y deshace el vaciado).
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

const profs = await rest('professors?select=id&deleted_at=is.null');
const load = await rest('academic_load?select=subject_code');
const links = await rest('professor_subjects?select=professor_id');
const blocksWithProf = await rest('schedule_blocks?select=id&professor_id=not.is.null&deleted_at=is.null');

console.log('\nVaciado de profesores — impacto:');
console.log(`  profesores activos a soft-borrar: ${profs.length}`);
console.log(`  filas academic_load a borrar:      ${load.length}`);
console.log(`  professor_subjects a borrar:       ${links.length}`);
console.log(`  bloques a liberar (professor=null): ${blocksWithProf.length}`);
console.log('  (materias, semestres y horas de bloques: INTACTOS)');

if (!APPLY) { console.log('\n** DRY-RUN ** — no se modificó nada. Corre con --apply.\n'); process.exit(0); }

console.log('\nAplicando...');
// 1. borrar carga y links (filtros que matchean todo)
await rest('academic_load?subject_code=not.is.null', { method: 'DELETE' });
await rest('professor_subjects?professor_id=not.is.null', { method: 'DELETE' });
// 2. liberar bloques
await rest('schedule_blocks?professor_id=not.is.null', { method: 'PATCH', body: JSON.stringify({ professor_id: null, updated_at: NOW }) });
// 3. soft-delete de todos los profesores. CLAVE: bump de updated_at = NOW para que el
//    tombstone GANE el merge newest-wins de cualquier PC con caché vieja (si no, una PC
//    con updated_at más nuevo "resucitaría" al profesor al sincronizar).
await rest('professors?deleted_at=is.null', { method: 'PATCH', body: JSON.stringify({ deleted_at: NOW, updated_at: NOW }) });
console.log('\nListo. Profesores vaciados — 0 profesores activos. La facultad los carga desde cero.\n');
