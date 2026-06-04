/**
 * env.ts — Carga de credenciales (Supabase + Gemini) CIFRADAS en reposo.
 *
 * Las keys NO están en texto plano en el código ni en el repo. Se leen de
 * `secrets.enc` (AES-256-GCM) y se descifran en runtime en el proceso main.
 * Para regenerar el .enc tras cambiar una key:
 *     edita src/electron/secrets.plain.json  →  node scripts/encrypt-secrets.cjs
 *
 * IMPORTANTE: esto es ofuscación (cifrado en reposo + keys fuera de git/texto
 * plano del .exe), no seguridad absoluta — una app cliente debe poder descifrar
 * para usar la key. La protección real son las restricciones del lado servidor
 * (RLS de Supabase, restricciones de la API de Gemini en Google Cloud).
 *
 * Si no hay secrets.enc ni secrets.plain.json → ENV queda vacío y la app corre
 * 100% offline (sin nube ni IA), exactamente como sin credenciales.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface Secrets {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
}

// DEBE coincidir con scripts/encrypt-secrets.cjs
const PASS = 'fb_USM_Farmabox_2026_x9Qm3vLpZ7wK_secrets';
const SALT = Buffer.from('farmabox-secrets-v1');

const EMPTY: Secrets = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  GEMINI_API_KEY: '',
  GEMINI_MODEL: 'gemini-flash-latest',
};

// secrets.enc / secrets.plain.json viven en src/electron (un nivel sobre dist/).
const BASE = path.join(__dirname, '..', '..');

function fromEncrypted(): Secrets | null {
  try {
    const raw = Buffer.from(fs.readFileSync(path.join(BASE, 'secrets.enc'), 'utf8').trim(), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const key = crypto.scryptSync(PASS, SALT, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return { ...EMPTY, ...(JSON.parse(json) as Partial<Secrets>) };
  } catch {
    return null;
  }
}

function fromPlain(): Secrets | null {
  try {
    const json = fs.readFileSync(path.join(BASE, 'secrets.plain.json'), 'utf8');
    return { ...EMPTY, ...(JSON.parse(json) as Partial<Secrets>) };
  } catch {
    return null;
  }
}

export const ENV: Secrets = fromEncrypted() ?? fromPlain() ?? EMPTY;
