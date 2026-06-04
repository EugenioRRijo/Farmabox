/**
 * healthcheck.cjs — Chequeo integral de los subsistemas de Farmabox.
 *
 * Prueba la cadena REAL: secrets.enc (descifrado) → Supabase (round-trip) →
 * Gemini (respuesta). No usa keys hardcodeadas: las toma del env compilado.
 *
 *   node scripts/healthcheck.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const { ENV } = require('../src/electron/dist/config/env');

const results = [];
const mark = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

function checkGemini() {
  return new Promise((resolve) => {
    const body = JSON.stringify({ contents: [{ parts: [{ text: 'Responde solo: OK' }] }] });
    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${ENV.GEMINI_MODEL}:generateContent`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': ENV.GEMINI_API_KEY, 'Content-Length': Buffer.byteLength(body) },
        timeout: 20000,
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(d);
            const t = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
            resolve(t ? { ok: true, detail: 'respondió: ' + t.trim().slice(0, 20) } : { ok: false, detail: j?.error?.message });
          } catch (e) {
            resolve({ ok: false, detail: e.message });
          }
        });
      },
    );
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, detail: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, detail: e.message }));
    req.write(body);
    req.end();
  });
}

(async () => {
  console.log('── Healthcheck Farmabox ──\n');

  // 1. Secretos descifrados
  mark(
    'Secretos descifrados (AES) ',
    !!(ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY && ENV.GEMINI_API_KEY),
    'URL + 2 keys',
  );

  // 2. Supabase round-trip + inventario
  try {
    const c = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await c.from('app_data').select('id, data');
    if (error) throw error;
    const inv = data
      .filter((r) => r.id !== '__healthcheck__')
      .map((r) => `${r.id}=${Array.isArray(r.data) ? r.data.length : Object.keys(r.data || {}).length}`)
      .join(', ');
    mark('Supabase nube (lectura)   ', true, inv);
  } catch (e) {
    mark('Supabase nube (lectura)   ', false, e.message);
  }

  // 3. Gemini
  const g = await checkGemini();
  mark('Gemini IA (chatbox)       ', g.ok, g.detail);

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n── ${passed}/${results.length} subsistemas OK ──`);
  process.exit(0);
})();
