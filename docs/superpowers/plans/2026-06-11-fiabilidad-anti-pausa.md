# Plan de Implementación — Incremento 1: Anti-pausa efectiva + visibilidad de guardado

> **Para ejecutores agénticos:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Que el proyecto Supabase (plan free) nunca se pause aunque nadie abra la app por semanas, y que cualquier fallo de guardado sea visible al instante (nunca silencioso).

**Architecture:** La app ya escribe a Supabase (web directo / desktop offline-first con merge por ítem) y ya tiene keepalive in-app mientras la app está abierta. Este incremento (a) activa un keepalive cloud-side independiente de abrir la app, (b) hace visible el estado de guardado/conexión reutilizando el `isSaving`/`lastSaved` existente y agregando `saveError`, y (c) muestra un banner si la base no responde (p. ej. pausada).

**Tech Stack:** React + TypeScript + Vite (frontend), Electron (desktop), Supabase, GitHub Actions, vitest.

---

## Contexto y hallazgos (de la exploración)

- **Causa raíz probable de "no se guarda bien":** el workflow `fuente-recuperado/.github/workflows/supabase-keepalive.yml` **no corre** porque (1) no está en la raíz del repo git (`ServicioCom/.github/workflows/`) y (2) `fuente-recuperado/` está **sin trackear** (0 archivos en git). Sin keepalive cloud-side, el plan free de Supabase se pausa a ~7 días sin actividad y, una vez pausado, las lecturas/escrituras fallan; los errores hoy se tragan (`console.error`) → "no guarda" en silencio.
- El **escritorio ya tiene keepalive in-app** (`SupabaseKeepaliveService`, arranca en `main.ts`), así que con uso casi diario se mantiene viva; el hueco es cuando nadie abre la app por una semana.
- Estado de guardado: `AppDataContext` ya expone `isSaving` y `lastSaved`; falta `saveError` y un componente visible. Hoy `handleBlocksChange`/`handleUpdateLoad`/`handleUpdateSubject` hacen `console.error` y siguen.

## Estructura de archivos

- Crear: `ServicioCom/.github/workflows/supabase-keepalive.yml` (copia en la raíz REAL del repo).
- Crear: `src/frontend/src/components/layout/SyncStatusBadge.tsx` (indicador de estado).
- Modificar: `src/frontend/src/context/AppDataContext.tsx` (estado `saveError`, dejar de tragar errores).
- Modificar: `src/frontend/src/components/layout/Header.tsx` (montar el badge).
- Modificar: `docs/SUPABASE-Y-DATOS.md` (sección anti-pausa + verificación/despausar).

---

## Task 1: Activar el keepalive cloud-side (anti-pausa real)

**Files:**
- Create: `ServicioCom/.github/workflows/supabase-keepalive.yml` (en la raíz del repo git)
- Reference: `fuente-recuperado/.github/workflows/supabase-keepalive.yml` (ya existe; contenido correcto)

> Esta tarea es operativa (no TDD): el objetivo es que un ping corra en la nube cada ≤3 días **sin** depender de abrir la app.

- [ ] **Step 1: Confirmar la raíz del repo git**

Run: `git rev-parse --show-toplevel`
Expected: la ruta de `ServicioCom` (la raíz del repo).

- [ ] **Step 2: Copiar el workflow a la raíz real del repo**

Copiar el contenido de `fuente-recuperado/.github/workflows/supabase-keepalive.yml` a
`ServicioCom/.github/workflows/supabase-keepalive.yml` (mismo contenido, ya es correcto:
cron cada 3 días + `workflow_dispatch`).

- [ ] **Step 3: Commit del workflow**

```bash
git add .github/workflows/supabase-keepalive.yml
git commit -m "ci: activar keep-alive de Supabase en la raíz del repo (anti-pausa)"
```

- [ ] **Step 4: Cargar los Secrets en GitHub (manual, requiere al usuario)**

Repo → Settings → Secrets and variables → Actions → New repository secret:
- `SUPABASE_URL` = la URL del proyecto (la misma de `src/electron/secrets.plain.json`).
- `SUPABASE_ANON_KEY` = la anon key del proyecto.

- [ ] **Step 5: Disparar el workflow a mano y verificar verde**

GitHub → pestaña **Actions** → *Supabase keep-alive* → **Run workflow**.
Expected: el job termina en verde y el log imprime `Supabase respondió HTTP 200` (o 4xx por RLS, también válido).

- [ ] **Step 6: Respaldo independiente (opcional, recomendado)**

Documentar (en Task 5) un cron-ping externo gratuito (p. ej. cron-job.org) apuntando a
`${SUPABASE_URL}/rest/v1/professors?select=id&limit=1` con headers `apikey` y `Authorization: Bearer`,
por si la Action se desactivara. Redundancia de la capa anti-pausa.

---

## Task 2: `saveError` en AppDataContext + dejar de tragar errores

**Files:**
- Modify: `src/frontend/src/context/AppDataContext.tsx`
- Test: `src/frontend/src/context/saveState.test.ts`

La lógica de estado de guardado (qué texto/estado mostrar) se extrae a una función pura testeable.

- [ ] **Step 1: Escribir el test que falla (estado derivado)**

Crear `src/frontend/src/context/saveState.ts` se hará en Step 3; primero el test:

```ts
// src/frontend/src/context/saveState.test.ts
import { describe, it, expect } from 'vitest';
import { deriveSyncStatus } from './saveState';

describe('deriveSyncStatus', () => {
  it('offline tiene prioridad', () => {
    expect(deriveSyncStatus({ online: false, isSaving: true, saveError: null }).kind).toBe('offline');
  });
  it('guardando cuando isSaving y online', () => {
    expect(deriveSyncStatus({ online: true, isSaving: true, saveError: null }).kind).toBe('saving');
  });
  it('error cuando hay saveError y online y no guardando', () => {
    expect(deriveSyncStatus({ online: true, isSaving: false, saveError: 'x' }).kind).toBe('error');
  });
  it('guardado en estado normal', () => {
    expect(deriveSyncStatus({ online: true, isSaving: false, saveError: null }).kind).toBe('saved');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/frontend/src/context/saveState.test.ts`
Expected: FAIL — `deriveSyncStatus` no existe.

- [ ] **Step 3: Implementar `deriveSyncStatus` (mínimo para pasar)**

```ts
// src/frontend/src/context/saveState.ts
export type SyncKind = 'offline' | 'saving' | 'error' | 'saved';
export interface SyncInputs { online: boolean; isSaving: boolean; saveError: string | null; }
export interface SyncStatusView { kind: SyncKind; label: string; }

export function deriveSyncStatus({ online, isSaving, saveError }: SyncInputs): SyncStatusView {
  if (!online) return { kind: 'offline', label: 'Sin conexión — se subirá al reconectar' };
  if (isSaving) return { kind: 'saving', label: 'Guardando…' };
  if (saveError) return { kind: 'error', label: 'Error al guardar — reintentar' };
  return { kind: 'saved', label: 'Nube conectada · Guardado' };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/frontend/src/context/saveState.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Conectar `saveError` en AppDataContext y dejar de tragar errores**

En `AppDataContext.tsx`: agregar `const [saveError, setSaveError] = useState<string | null>(null);`,
exponerlo en el `value`, y en `handleBlocksChange` (y `handleUpdateLoad`, `handleUpdateSubject`)
reemplazar el `catch { console.error(...) }` silencioso por:

```ts
} catch (e) {
  console.error('Failed to save schedule blocks:', e);
  setSaveError(e instanceof Error ? e.message : 'Error al guardar');
} finally {
  setIsSaving(false);
}
```

Y en el inicio de cada save exitoso, limpiar: `setSaveError(null);` antes del `await`.
Agregar `saveError` a la interfaz del contexto y al objeto `value`.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/context/saveState.ts src/frontend/src/context/saveState.test.ts src/frontend/src/context/AppDataContext.tsx
git commit -m "feat(datos): exponer saveError y dejar de tragar errores de guardado"
```

---

## Task 3: Badge de estado de sincronización en el Header

**Files:**
- Create: `src/frontend/src/components/layout/SyncStatusBadge.tsx`
- Modify: `src/frontend/src/components/layout/Header.tsx`

- [ ] **Step 1: Crear el componente del badge**

```tsx
// src/frontend/src/components/layout/SyncStatusBadge.tsx
import { useEffect, useState } from 'react';
import { Cloud, CloudOff, Loader2, AlertTriangle } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { deriveSyncStatus } from '../../context/saveState';

export function SyncStatusBadge() {
  const { isSaving, saveError } = useAppData();
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const status = deriveSyncStatus({ online, isSaving, saveError });
  const styles: Record<string, string> = {
    offline: 'bg-gray-100 text-gray-600',
    saving: 'bg-blue-50 text-blue-700',
    error: 'bg-red-50 text-red-700',
    saved: 'bg-green-50 text-green-700',
  };
  const Icon = status.kind === 'saving' ? Loader2 : status.kind === 'offline' ? CloudOff : status.kind === 'error' ? AlertTriangle : Cloud;

  return (
    <span
      title={saveError ?? status.label}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${styles[status.kind]}`}
    >
      <Icon className={`w-3.5 h-3.5 ${status.kind === 'saving' ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{status.label}</span>
    </span>
  );
}
```

- [ ] **Step 2: Montar el badge en el Header**

En `Header.tsx`, importar `SyncStatusBadge` y renderizarlo en la barra (junto a los controles
existentes del header). Verificar que `useAppData` esté disponible en ese árbol (lo está: el provider
envuelve la app).

- [ ] **Step 3: Verificación manual (build/type-check)**

Run: `cd src/frontend && npx tsc --noEmit -p tsconfig.json`
Expected: EXIT_CODE 0.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/components/layout/SyncStatusBadge.tsx src/frontend/src/components/layout/Header.tsx
git commit -m "feat(datos): badge de estado de sincronización en el header"
```

---

## Task 4: Banner de "sin conexión a la base compartida" al inicio

**Files:**
- Modify: `src/frontend/src/context/AppDataContext.tsx` (en la carga inicial / `reload`)

- [ ] **Step 1: Detectar fallo de carga inicial y exponerlo**

El contexto ya tiene `error`/`loading` de la carga inicial. Asegurar que si `reload()` falla (p. ej.
proyecto pausado), `error` quede con un mensaje claro tipo "Sin conexión a la base compartida".

- [ ] **Step 2: Mostrar banner cuando `error` está presente**

En el layout principal (donde se consume `useAppData().error`), renderizar un banner superior:

```tsx
{error && (
  <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-4 py-2 text-center">
    Sin conexión a la base compartida — trabajando con los últimos datos locales. Reintentando…
  </div>
)}
```

- [ ] **Step 3: Verificación (type-check)**

Run: `cd src/frontend && npx tsc --noEmit -p tsconfig.json`
Expected: EXIT_CODE 0.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/context/AppDataContext.tsx
git commit -m "feat(datos): banner cuando la base compartida no responde"
```

---

## Task 5: Documentar anti-pausa, verificación y despausar

**Files:**
- Modify: `docs/SUPABASE-Y-DATOS.md`

- [ ] **Step 1: Actualizar la doc**

Agregar/ajustar:
- El keepalive de GitHub debe vivir en la **raíz del repo** (`.github/workflows/`), con los Secrets
  `SUPABASE_URL` / `SUPABASE_ANON_KEY` cargados, corriendo cada 3 días.
- Cómo **verificar** si el proyecto está activo: abrir el dashboard de Supabase; si dice "paused",
  reactivar con "Restore/Resume". También sirve correr el workflow a mano (Actions → Run workflow).
- Respaldo: cron-ping externo (cron-job.org) como redundancia.
- Que el escritorio mantiene viva la base mientras la app esté abierta (keepalive in-app), y que el
  workflow cubre los períodos sin uso.

- [ ] **Step 2: Commit**

```bash
git add docs/SUPABASE-Y-DATOS.md
git commit -m "docs: anti-pausa, verificación y despausar de Supabase"
```

---

## Self-review (cobertura vs spec)

- Objetivo 3 (estado siempre visible) → Tasks 2-4. ✓
- Objetivo 4 (no se pause) → Tasks 1, 5. ✓
- "Dejar de tragar errores" → Task 2. ✓
- Pendiente para el **Incremento 2** (su propio plan): escrituras a prueba de pisado en los caminos
  genuinamente expuestos — `academic_load` y `professor_subjects` (tombstone-por-ausencia en
  `CloudStorageService.pushRemote`) y el camino web (`supabaseWeb.saveScheduleBlocks` /
  `saveAcademicLoad`). Más tiempo real (Fase 3) y nube-por-defecto/retirar carpeta (Fase 4).

## Nota sobre git

`fuente-recuperado/` está sin trackear (0 archivos en git) y la rama actual es `main`. Antes de los
commits de este plan, decidir con el usuario: (a) trackear el proyecto correctamente (con `.gitignore`
para `node_modules`/`dist`) o (b) crear una rama de trabajo. El workflow de Task 1 va a la raíz del repo
sí o sí (requisito de GitHub Actions).
