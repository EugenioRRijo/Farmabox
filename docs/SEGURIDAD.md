# Seguridad — Farmabox

Resumen honesto de la postura de seguridad tras la auditoría. **Lo que ya está bien** y
**las 2 únicas acciones operativas pendientes** (no son código: las hace el administrador).

## Lo que ya está correcto (no tocar)
- **Secretos fuera de git:** `.env`, `secrets.plain.json` y `secrets.enc` están en `.gitignore`
  (verificado con `git check-ignore`). El repo no filtra credenciales.
- **Key de IA en el proceso main:** `GeminiService` corre en Electron main; el renderer la llama
  por IPC (`chat:send`). La key nunca llega al frontend.
- **Cifrado en reposo:** `secrets.enc` (AES-256-GCM) + `secrets.plain.example.json` como plantilla.
  El PASS de `config/env.ts` es **ofuscación intencional** (una app cliente debe poder descifrar);
  no es un bug a "rotar". La protección real es server-side (abajo).
- **contextIsolation activo**, sin `nodeIntegration` en el renderer.

## Acción 1 — Decidir la postura de RLS (único riesgo real)
Hoy las políticas son abiertas: `for all using (true) with check (true)` (ver
`docs/supabase-schema.sql`). Cualquiera con la anon key (extraíble del `.exe`) tiene CRUD total.

- **Opción A (recomendada para herramienta interna LAN): aceptar y documentar.** Opcional: añadir
  un *passcode* a nivel de app antes de habilitar escritura.
- **Opción B (endurecer): Supabase Auth.** Reemplazar `using (true)` por políticas basadas en
  `auth.uid()` / rol, y autenticar la app. Es más trabajo pero cierra el acceso anónimo.

## Acción 2 — Restringir y (si aplica) rotar la key de Gemini
- En Google AI Studio / Google Cloud: aplicar **restricciones de aplicación/API** a la key para
  que no sea usable fuera del contexto previsto.
- **Rotarla** si las secrets salieron de esta máquina (se compartió el repo/binario con un tercero).
- Tras rotar: editar `src/electron/secrets.plain.json` → `node scripts/encrypt-secrets.cjs` para
  regenerar `secrets.enc`, y actualizar `src/frontend/.env` si cambió algo de Supabase.
