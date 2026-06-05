/* Consulta tablas conocidas de Supabase con la anon key y reporta filas/estado. */
const fs = require('fs');
const path = require('path');

const secrets = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'electron', 'secrets.plain.json'), 'utf-8'),
);
const URL = secrets.SUPABASE_URL;
const KEY = secrets.SUPABASE_ANON_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact' };

const TABLES = [
  // nuevas (esquema relacional)
  'professors',
  'subjects',
  'professor_subjects',
  'academic_load',
  'schedule_blocks',
  'logs',
  // viejas (modelo key-value)
  'app_data',
  'app_versions',
];

async function check(t) {
  try {
    const r = await fetch(`${URL}/rest/v1/${t}?select=*&limit=2`, { headers });
    if (r.status === 404 || r.status === 400) {
      const body = await r.json().catch(() => ({}));
      return `${t}: NO EXISTE (${r.status} ${body.message || ''})`;
    }
    if (!r.ok) {
      const body = await r.text();
      return `${t}: HTTP ${r.status} ${body.slice(0, 120)}`;
    }
    const range = r.headers.get('content-range');
    const count = range ? range.split('/').pop() : '?';
    const rows = await r.json();
    const cols = rows[0] ? Object.keys(rows[0]).join(', ') : '(sin filas para inferir columnas)';
    return `${t}: ${count} filas | columnas: ${cols}`;
  } catch (e) {
    return `${t}: ERROR ${e.message}`;
  }
}

async function main() {
  console.log(`Proyecto: ${URL}\n`);
  for (const t of TABLES) {
    console.log('▸ ' + (await check(t)));
  }
}
main().catch((e) => console.error('ERROR:', e.message));
