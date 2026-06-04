/**
 * encrypt-secrets.cjs — Cifra src/electron/secrets.plain.json → src/electron/secrets.enc
 *
 * Uso:  node scripts/encrypt-secrets.cjs
 *
 * El .enc (AES-256-GCM) se empaqueta con la app y se descifra en runtime
 * (src/electron/src/config/env.ts). El .plain.json queda en .gitignore.
 * La passphrase está embebida (ofuscación): protege contra extracción casual,
 * NO contra un atacante decidido. La protección real es la restricción de las
 * keys del lado servidor (RLS de Supabase, restricciones de la API de Gemini).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// DEBE coincidir con env.ts
const PASS = 'fb_USM_Farmabox_2026_x9Qm3vLpZ7wK_secrets';
const SALT = Buffer.from('farmabox-secrets-v1');

const plainPath = path.join(__dirname, '..', 'src', 'electron', 'secrets.plain.json');
const outPath = path.join(__dirname, '..', 'src', 'electron', 'secrets.enc');

const plain = fs.readFileSync(plainPath, 'utf8');
JSON.parse(plain); // validar que es JSON

const key = crypto.scryptSync(PASS, SALT, 32);
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();
const out = Buffer.concat([iv, tag, enc]).toString('base64');

fs.writeFileSync(outPath, out, 'utf8');
console.log('OK → secrets.enc generado (' + out.length + ' bytes base64)');
