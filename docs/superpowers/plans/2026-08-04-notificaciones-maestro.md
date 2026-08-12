# Notificaciones + Farmabox Maestro — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el administrador envíe mensajes personalizados desde una app aparte ("Farmabox Maestro") y que todas las PCs con Farmabox los muestren como pop-up inmediato.

**Architecture:** Una tabla nueva `notifications` en el Supabase existente. Una app nueva e independiente (`src/maestro`) escribe/edita/borra mensajes; Farmabox (renderer) los lee directo de Supabase (Realtime + poll) y muestra un pop-up de los no vistos. La lógica pura (mapeo, visibilidad, "visto") vive en `src/shared` y la reutilizan ambos lados.

**Tech Stack:** TypeScript, React, Electron 28.2.0, electron-builder 26.7.0, Vite 5, @supabase/supabase-js ^2.107, Vitest. Monorepo con npm workspaces (`src/frontend`, `src/electron`, `src/shared`, y el nuevo `src/maestro`).

## Global Constraints

- **No commitear el repo de la app sin que el usuario lo pida.** El usuario difiere los commits (regla vigente de la sesión). Los pasos "Commit" de abajo son *checkpoints locales*: deja los cambios en el working tree; no hagas `git push` ni commits salvo que el usuario lo indique.
- **El usuario corre las migraciones a mano** en el SQL Editor de Supabase. Ningún paso las ejecuta.
- **Nunca "borra-todo-e-inserta".** Siempre `upsert` por `id` estable. Los ids de notificación se generan con `crypto.randomUUID()` (prefijo `notif-`), no con `Date.now()` puro.
- **Degradación segura:** si la tabla `notifications` no existe todavía, el receptor atrapa el error y no muestra nada; Farmabox sigue funcionando.
- **RLS abierto** (seguridad diferida por el usuario): no se toca. "Solo el maestro envía" se garantiza porque solo él tiene la app Maestro.
- **Maestro sin auto-update** en v1.
- **Valores de Supabase** (URL + anon key) ya están en `src/frontend/.env` (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, ambos SET). Maestro tendrá su propio `.env` con los mismos valores.
- Tras cambios de código: `npx tsc --noEmit` en el workspace tocado + `npx vitest run <archivo>` para los tests. El build de la app es solo `tsc` (no bloquea por un lint preexistente de electron).

---

## File Structure

**Compartido (reusado por receptor y Maestro):**
- Create: `src/shared/src/logic/notifications.ts` — tipo `AppNotification`, mapeo fila↔objeto, `isVisible`, `shouldPop`, `pendingPops`, `markSeen`.
- Create: `src/shared/src/logic/notifications.test.ts` — tests vitest de la lógica pura.

**Migración:**
- Create: `docs/migracion-2.5-notificaciones.sql` — crea la tabla + la agrega a la publicación realtime.

**Receptor (Farmabox existente):**
- Create: `src/frontend/src/services/notificationsClient.ts` — `fetchNotifications`, `subscribeNotifications` (usa el `supabase` del renderer).
- Create: `src/frontend/src/hooks/useNotifications.ts` — cola de pops + "visto" en localStorage.
- Create: `src/frontend/src/components/notifications/NotificationPopup.tsx` — modal del pop-up.
- Modify: `src/frontend/src/App.tsx:116` — montar `<NotificationPopup />` junto a `<ChatWidget />`.

**App Maestro (nueva, workspace `src/maestro`):**
- Create: `src/maestro/package.json`, `tsconfig.json`, `tsconfig.main.json`, `vite.config.ts`, `.env`, `index.html`
- Create: `src/maestro/electron/main.ts`, `src/maestro/electron/preload.ts`
- Create: `src/maestro/src/main.tsx`, `src/maestro/src/MaestroApp.tsx`, `src/maestro/src/maestroClient.ts`, `src/maestro/src/index.css`
- Modify: `package.json` (raíz) — agregar `src/maestro` a `workspaces`.

---

## Phase A — Tabla + lógica compartida + receptor (se despliega como Farmabox v2.3.16)

### Task 1: Migración + lógica pura compartida

**Files:**
- Create: `docs/migracion-2.5-notificaciones.sql`
- Create: `src/shared/src/logic/notifications.ts`
- Test: `src/shared/src/logic/notifications.test.ts`

**Interfaces:**
- Produces:
  - `interface AppNotification { id: string; title: string; body: string; createdAt: string; updatedAt: string; expiresAt?: string | null; deletedAt?: string | null }`
  - `interface NotificationRow { id: string; title: string; body: string; created_at: string; updated_at: string; expires_at: string | null; deleted_at: string | null }`
  - `rowToNotification(r: NotificationRow): AppNotification`
  - `notificationToRow(n: AppNotification): NotificationRow`
  - `isVisible(n: AppNotification, nowIso: string): boolean`
  - `shouldPop(n: AppNotification, seen: Record<string,string>, nowIso: string): boolean`
  - `pendingPops(list: AppNotification[], seen: Record<string,string>, nowIso: string): AppNotification[]` (visibles y no vistos, más nuevos primero)
  - `markSeen(seen: Record<string,string>, n: AppNotification): Record<string,string>`

- [ ] **Step 1: Escribir la migración SQL**

Create `docs/migracion-2.5-notificaciones.sql`:

```sql
-- Migración 2.5 — tabla de notificaciones (mensajes del maestro a todas las PCs).
-- Independiente de los horarios. RLS se deja abierto como el resto (seguridad diferida).
create table if not exists notifications (
  id         text primary key,
  title      text not null default '',
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  deleted_at timestamptz
);

-- Realtime: que las PCs reciban cambios en vivo. Si ya está en la publicación, ignora el error.
do $$
begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null;
end $$;
```

- [ ] **Step 2: Escribir el test que falla**

Create `src/shared/src/logic/notifications.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  rowToNotification,
  notificationToRow,
  isVisible,
  shouldPop,
  pendingPops,
  markSeen,
  type AppNotification,
} from './notifications';

const base: AppNotification = {
  id: 'notif-1',
  title: 'Aviso',
  body: 'Reunión mañana',
  createdAt: '2026-08-04T10:00:00.000Z',
  updatedAt: '2026-08-04T10:00:00.000Z',
  expiresAt: null,
  deletedAt: null,
};
const NOW = '2026-08-04T12:00:00.000Z';

describe('notifications logic', () => {
  it('mapea fila↔objeto en ambos sentidos', () => {
    const row = notificationToRow(base);
    expect(row.created_at).toBe(base.createdAt);
    expect(rowToNotification(row)).toEqual(base);
  });

  it('isVisible: oculta borradas y vencidas', () => {
    expect(isVisible(base, NOW)).toBe(true);
    expect(isVisible({ ...base, deletedAt: NOW }, NOW)).toBe(false);
    expect(isVisible({ ...base, expiresAt: '2026-08-04T11:00:00.000Z' }, NOW)).toBe(false);
    expect(isVisible({ ...base, expiresAt: '2026-08-04T13:00:00.000Z' }, NOW)).toBe(true);
  });

  it('shouldPop: salta si es visible y no vista; no salta si el updatedAt coincide', () => {
    expect(shouldPop(base, {}, NOW)).toBe(true);
    expect(shouldPop(base, { 'notif-1': base.updatedAt }, NOW)).toBe(false);
    // editada (updatedAt cambió) → vuelve a saltar
    const edited = { ...base, updatedAt: '2026-08-04T11:30:00.000Z' };
    expect(shouldPop(edited, { 'notif-1': base.updatedAt }, NOW)).toBe(true);
  });

  it('pendingPops: solo visibles no vistas, más nuevas primero', () => {
    const a = { ...base, id: 'notif-a', createdAt: '2026-08-04T09:00:00.000Z', updatedAt: '2026-08-04T09:00:00.000Z' };
    const b = { ...base, id: 'notif-b', createdAt: '2026-08-04T11:00:00.000Z', updatedAt: '2026-08-04T11:00:00.000Z' };
    const deleted = { ...base, id: 'notif-c', deletedAt: NOW };
    const out = pendingPops([a, b, deleted], {}, NOW);
    expect(out.map((n) => n.id)).toEqual(['notif-b', 'notif-a']);
  });

  it('markSeen: registra el updatedAt visto', () => {
    const seen = markSeen({}, base);
    expect(seen['notif-1']).toBe(base.updatedAt);
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `cd src/shared && npx vitest run src/logic/notifications.test.ts`
Expected: FAIL ("Cannot find module './notifications'").

- [ ] **Step 4: Implementar la lógica pura**

Create `src/shared/src/logic/notifications.ts`:

```ts
/**
 * Lógica PURA de notificaciones (mensajes del maestro a todas las PCs).
 * Compartida entre el receptor (Farmabox) y la app Maestro. Sin dependencias de
 * Supabase ni de React: solo tipos y funciones puras, fáciles de testear.
 */
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO — editar re-sella; el receptor lo usa para re-mostrar
  expiresAt?: string | null; // ISO | null: pasado ese momento no se muestra
  deletedAt?: string | null; // ISO | null: tombstone
}

/** Fila tal cual en Supabase (snake_case). */
export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  deleted_at: string | null;
}

export function rowToNotification(r: NotificationRow): AppNotification {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    expiresAt: r.expires_at,
    deletedAt: r.deleted_at,
  };
}

export function notificationToRow(n: AppNotification): NotificationRow {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    created_at: n.createdAt,
    updated_at: n.updatedAt,
    expires_at: n.expiresAt ?? null,
    deleted_at: n.deletedAt ?? null,
  };
}

/** Visible = no borrada y no vencida (comparando ISO como strings, orden lexicográfico = cronológico). */
export function isVisible(n: AppNotification, nowIso: string): boolean {
  if (n.deletedAt) return false;
  if (n.expiresAt && n.expiresAt <= nowIso) return false;
  return true;
}

/** El mapa de "visto" es { [id]: updatedAt visto }. Salta si es visible y su updatedAt difiere del visto. */
export function shouldPop(n: AppNotification, seen: Record<string, string>, nowIso: string): boolean {
  if (!isVisible(n, nowIso)) return false;
  return seen[n.id] !== n.updatedAt;
}

/** Notificaciones que deben mostrarse: visibles y no vistas, más nuevas primero (por createdAt). */
export function pendingPops(
  list: AppNotification[],
  seen: Record<string, string>,
  nowIso: string,
): AppNotification[] {
  return list
    .filter((n) => shouldPop(n, seen, nowIso))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function markSeen(seen: Record<string, string>, n: AppNotification): Record<string, string> {
  return { ...seen, [n.id]: n.updatedAt };
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `cd src/shared && npx vitest run src/logic/notifications.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Checkpoint (commit local diferido)**

```bash
git add docs/migracion-2.5-notificaciones.sql src/shared/src/logic/notifications.ts src/shared/src/logic/notifications.test.ts
# Commit DIFERIDO por preferencia del usuario: dejar staged, no commitear salvo que lo pida.
```

---

### Task 2: Cliente de notificaciones del receptor

**Files:**
- Create: `src/frontend/src/services/notificationsClient.ts`

**Interfaces:**
- Consumes: `rowToNotification`, `AppNotification`, `NotificationRow` (Task 1); `supabase` de `src/frontend/src/services/supabaseClient.ts`.
- Produces:
  - `fetchNotifications(): Promise<AppNotification[]>` — trae las no borradas; `[]` si no hay supabase o la tabla no existe.
  - `subscribeNotifications(onChange: () => void): () => void` — realtime sobre `notifications`; devuelve función para desuscribir.

- [ ] **Step 1: Implementar el cliente**

Create `src/frontend/src/services/notificationsClient.ts`:

```ts
/**
 * Cliente de notificaciones del RECEPTOR (Farmabox). Habla directo a Supabase con el
 * mismo `supabase` del renderer (funciona también en el .exe: la anon key va horneada en
 * el bundle). Es SOLO LECTURA: el único que escribe es la app Maestro. Degrada seguro:
 * si no hay supabase o la tabla aún no existe, devuelve vacío sin romper la app.
 */
import { supabase } from './supabaseClient';
import {
  rowToNotification,
  type AppNotification,
  type NotificationRow,
} from '../../../shared/src/logic/notifications';

export async function fetchNotifications(): Promise<AppNotification[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('notifications').select('*').is('deleted_at', null);
  if (error || !data) return []; // tabla ausente / RLS / red → sin notificaciones
  return (data as NotificationRow[]).map(rowToNotification);
}

export function subscribeNotifications(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const ch = supabase.channel('farmabox-notifications');
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => onChange());
  ch.subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd src/frontend && npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Checkpoint (commit local diferido)**

```bash
git add src/frontend/src/services/notificationsClient.ts
```

---

### Task 3: Hook `useNotifications` (cola de pops + "visto")

**Files:**
- Create: `src/frontend/src/hooks/useNotifications.ts`

**Interfaces:**
- Consumes: `fetchNotifications`, `subscribeNotifications` (Task 2); `pendingPops`, `markSeen`, `AppNotification` (Task 1).
- Produces: `useNotifications(): { current: AppNotification | null; dismiss: (n: AppNotification) => void }` — `current` es el pop más nuevo pendiente; `dismiss` lo marca visto y avanza al siguiente.

- [ ] **Step 1: Implementar el hook**

Create `src/frontend/src/hooks/useNotifications.ts`:

```ts
/**
 * useNotifications — cola de pop-ups del receptor. Trae las notificaciones (Realtime + poll
 * de respaldo cada 30s), calcula cuáles no ha visto esta PC y las expone de una en una.
 * El "visto" se guarda en localStorage por PC ({ [id]: updatedAt }), así un mensaje editado
 * (updatedAt distinto) vuelve a saltar, y uno ya visto no repite en cada sync.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNotifications, subscribeNotifications } from '../services/notificationsClient';
import { pendingPops, markSeen, type AppNotification } from '../../../shared/src/logic/notifications';

const SEEN_KEY = 'farmabox.seenNotifications';

function loadSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
function saveSeen(seen: Record<string, string>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* almacenamiento lleno / no disponible: ignorar */
  }
}

export function useNotifications(): { current: AppNotification | null; dismiss: (n: AppNotification) => void } {
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const seenRef = useRef<Record<string, string>>(loadSeen());

  const refresh = useCallback(async () => {
    const list = await fetchNotifications();
    setQueue(pendingPops(list, seenRef.current, new Date().toISOString()));
  }, []);

  useEffect(() => {
    void refresh();
    const unsub = subscribeNotifications(() => void refresh());
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [refresh]);

  const dismiss = useCallback((n: AppNotification) => {
    seenRef.current = markSeen(seenRef.current, n);
    saveSeen(seenRef.current);
    setQueue((q) => q.filter((x) => x.id !== n.id));
  }, []);

  return { current: queue[0] ?? null, dismiss };
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd src/frontend && npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Checkpoint (commit local diferido)**

```bash
git add src/frontend/src/hooks/useNotifications.ts
```

---

### Task 4: Pop-up + montaje + verificación

**Files:**
- Create: `src/frontend/src/components/notifications/NotificationPopup.tsx`
- Modify: `src/frontend/src/App.tsx` (import + montar junto a `<ChatWidget />`, línea ~116)

**Interfaces:**
- Consumes: `useNotifications` (Task 3).
- Produces: `NotificationPopup` (componente sin props).

- [ ] **Step 1: Implementar el componente**

Create `src/frontend/src/components/notifications/NotificationPopup.tsx`:

```tsx
/**
 * NotificationPopup — muestra los avisos del maestro como modal encima de la app.
 * Toma el pop más nuevo pendiente de useNotifications y, al pulsar "Entendido", lo marca
 * visto y avanza al siguiente. Si no hay pendientes, no renderiza nada.
 */
import { Bell } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';

export function NotificationPopup() {
  const { current, dismiss } = useNotifications();
  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 rounded-t-xl bg-blue-600 px-5 py-3 text-white">
          <Bell className="h-5 w-5" />
          <span className="text-base font-bold">{current.title || 'Aviso'}</span>
        </div>
        <div className="whitespace-pre-wrap px-5 py-4 text-sm text-gray-800">{current.body}</div>
        <div className="flex justify-end border-t px-5 py-3">
          <button
            onClick={() => dismiss(current)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Montar en App.tsx**

En `src/frontend/src/App.tsx`, agregar el import junto a los otros de componentes:

```tsx
import { NotificationPopup } from '@/components/notifications/NotificationPopup';
```

Y montarlo junto a `<ChatWidget />` (línea ~116), dentro de `<MainLayout>`:

```tsx
      <ChatWidget />
      <NotificationPopup />
      <Toaster position="top-right" />
```

- [ ] **Step 3: Verificar tipos + lint**

Run: `cd src/frontend && npx tsc --noEmit && npx eslint src/components/notifications/NotificationPopup.tsx src/hooks/useNotifications.ts src/services/notificationsClient.ts --ext ts,tsx`
Expected: sin errores.

- [ ] **Step 4: Verificación manual (dev)**

Corre el frontend en dev (`npm run dev` desde `src/frontend`, sirve en :5173). Con la migración 2.5 ya corrida, inserta a mano una fila en `notifications` desde el SQL Editor de Supabase:
```sql
insert into notifications (id, title, body) values ('notif-test', 'Prueba', 'Hola a todas las PCs');
```
Expected: en ~1s (Realtime) o ≤30s (poll) aparece el pop-up con "Prueba / Hola…". Al pulsar "Entendido" desaparece y no vuelve al recargar. Editar la fila (`update notifications set body='corregido', updated_at=now() where id='notif-test'`) → vuelve a saltar. Borrar (`update notifications set deleted_at=now() where id='notif-test'`) → no vuelve a aparecer.

- [ ] **Step 5: Checkpoint (commit local diferido)**

```bash
git add src/frontend/src/components/notifications/NotificationPopup.tsx src/frontend/src/App.tsx
```

> **Nota de despliegue (fin de Fase A):** el receptor ya funciona. Se despliega como **Farmabox v2.3.16** con el pipeline de siempre (bump `src/electron/package.json` sin commit → `npm run build --workspaces` → copiar `src/frontend/dist/*` a `src/electron/frontend/` → `CSC_IDENTITY_AUTO_DISCOVERY=false npm run package --workspace=src/electron` → `gh release create v2.3.16 -R EugenioRRijo/Farmabox-releases <exe> <blockmap> latest.yml`). **No desplegar hasta que el usuario lo pida** (regla de despliegue irreversible). Ver memoria release-pipeline.

---

## Phase B — App Maestro (instalador aparte)

### Task 5: Scaffold del workspace `src/maestro`

**Files:**
- Modify: `package.json` (raíz) — agregar `"src/maestro"` a `workspaces`.
- Create: `src/maestro/package.json`, `src/maestro/.env`, `src/maestro/index.html`, `src/maestro/vite.config.ts`, `src/maestro/tsconfig.json`, `src/maestro/tsconfig.main.json`, `src/maestro/electron/main.ts`, `src/maestro/electron/preload.ts`, `src/maestro/src/main.tsx`, `src/maestro/src/index.css`

**Interfaces:**
- Produces: una app Electron mínima que carga un renderer React vacío ("Farmabox Maestro"). El main compila a `dist-main/main.js`; el renderer a `dist/`.

- [ ] **Step 1: Agregar el workspace a la raíz**

En `package.json` (raíz), cambiar:
```json
"workspaces": ["src/frontend","src/electron","src/shared"]
```
por:
```json
"workspaces": ["src/frontend","src/electron","src/shared","src/maestro"]
```

- [ ] **Step 2: Crear `src/maestro/package.json`**

```json
{
  "name": "@scheduler/maestro",
  "version": "1.0.0",
  "description": "Farmabox Maestro — enviar notificaciones a las PCs",
  "author": "Eugenio Rijo",
  "main": "dist-main/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.main.json && vite build",
    "package": "electron-builder"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.107.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "electron": "28.2.0",
    "electron-builder": "^26.7.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "typescript": "^5.9.3",
    "vite": "^5.4.0"
  },
  "build": {
    "electronVersion": "28.2.0",
    "appId": "ve.edu.usm.farmabox.maestro",
    "productName": "Farmabox Maestro",
    "directories": { "output": "dist-installer" },
    "files": ["dist-main/**/*", "dist/**/*"],
    "win": { "target": ["nsis"], "forceCodeSigning": false },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "shortcutName": "Farmabox Maestro",
      "artifactName": "Farmabox-Maestro-Setup-${version}.${ext}"
    }
  }
}
```

- [ ] **Step 3: Crear `src/maestro/.env`**

Copia los MISMOS valores que `src/frontend/.env` (URL + anon key):
```
VITE_SUPABASE_URL=<mismo valor que src/frontend/.env>
VITE_SUPABASE_ANON_KEY=<mismo valor que src/frontend/.env>
```

- [ ] **Step 4: Crear config de build**

`src/maestro/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' para que el index.html cargue los assets bajo file:// dentro del .exe.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist' },
});
```

`src/maestro/tsconfig.json` (renderer):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src", "../shared/src/logic/notifications.ts"]
}
```

`src/maestro/tsconfig.main.json` (proceso Electron):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist-main",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["electron"]
}
```

- [ ] **Step 5: Crear el proceso Electron**

`src/maestro/electron/main.ts`:
```ts
import { app, BrowserWindow } from 'electron';
import * as path from 'path';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 720,
    height: 800,
    title: 'Farmabox Maestro',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  // En dev Vite sirve en :5173; empaquetado carga el index.html construido.
  if (process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
```

`src/maestro/electron/preload.ts`:
```ts
// Maestro habla directo a Supabase desde el renderer; no necesita puente IPC.
// Preload mínimo para satisfacer contextIsolation.
export {};
```

- [ ] **Step 6: Crear el renderer mínimo**

`src/maestro/index.html`:
```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Farmabox Maestro</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/maestro/src/index.css`:
```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #f3f4f6; color: #111827; }
```

`src/maestro/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { MaestroApp } from './MaestroApp';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MaestroApp />
  </React.StrictMode>,
);
```

Create un placeholder temporal `src/maestro/src/MaestroApp.tsx` (se completa en Task 7):
```tsx
export function MaestroApp() {
  return <div style={{ padding: 24 }}><h1>Farmabox Maestro</h1></div>;
}
```

- [ ] **Step 7: Instalar dependencias del nuevo workspace**

Run: `npm install` (desde la raíz `fuente-recuperado`)
Expected: instala react/vite/electron-builder para `@scheduler/maestro` sin errores.

- [ ] **Step 8: Verificación manual (dev)**

Run (desde `src/maestro`, 2 terminales):
```bash
npx vite            # terminal 1 → sirve en :5173
```
```bash
VITE_DEV_SERVER_URL=http://localhost:5173 npx electron dist-main/main.js   # tras 'npx tsc -p tsconfig.main.json'
```
Expected: abre una ventana "Farmabox Maestro" con el encabezado. (Si Electron sale sin ventana, revisar que `ELECTRON_RUN_AS_NODE` NO esté en '1' — ver memoria launch-electron-app.)

- [ ] **Step 9: Checkpoint (commit local diferido)**

```bash
git add package.json src/maestro
```

---

### Task 6: Cliente de Maestro (enviar / editar / eliminar / listar)

**Files:**
- Create: `src/maestro/src/maestroClient.ts`
- Test: `src/maestro/src/maestroClient.test.ts`

**Interfaces:**
- Consumes: `notificationToRow`, `rowToNotification`, `AppNotification` (Task 1).
- Produces:
  - `newNotification(title: string, body: string, expiresAt: string | null, nowIso: string): AppNotification` (genera id `notif-<uuid>`, sella created/updated) — **pura y testeable**.
  - `listNotifications(): Promise<AppNotification[]>` — historial no borrado (usa supabase).
  - `saveNotification(n: AppNotification): Promise<void>` — upsert.
  - `deleteNotification(id: string, nowIso: string): Promise<void>` — sella `deleted_at`.

- [ ] **Step 1: Escribir el test que falla (parte pura)**

Create `src/maestro/src/maestroClient.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { newNotification } from './maestroClient';

describe('newNotification', () => {
  it('genera id notif-*, sella created=updated y respeta expiresAt', () => {
    const n = newNotification('  Hola  ', ' cuerpo ', null, '2026-08-04T12:00:00.000Z');
    expect(n.id).toMatch(/^notif-/);
    expect(n.title).toBe('Hola');
    expect(n.body).toBe('cuerpo');
    expect(n.createdAt).toBe('2026-08-04T12:00:00.000Z');
    expect(n.updatedAt).toBe('2026-08-04T12:00:00.000Z');
    expect(n.expiresAt).toBeNull();
    expect(n.deletedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd src/maestro && npx vitest run src/maestroClient.test.ts`
Expected: FAIL ("Cannot find module './maestroClient'").

- [ ] **Step 3: Implementar el cliente**

Create `src/maestro/src/maestroClient.ts`:
```ts
/**
 * Cliente de la app Maestro: crea/guarda/edita/elimina/lista notificaciones en Supabase.
 * La parte de red usa el cliente supabase; `newNotification` es pura (testeable).
 */
import { createClient } from '@supabase/supabase-js';
import {
  notificationToRow,
  rowToNotification,
  type AppNotification,
  type NotificationRow,
} from '../../shared/src/logic/notifications';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

/** Crea una notificación nueva (pura: no toca red). */
export function newNotification(
  title: string,
  body: string,
  expiresAt: string | null,
  nowIso: string,
): AppNotification {
  const id = `notif-${crypto.randomUUID()}`;
  return {
    id,
    title: title.trim(),
    body: body.trim(),
    createdAt: nowIso,
    updatedAt: nowIso,
    expiresAt: expiresAt,
    deletedAt: null,
  };
}

function requireSb() {
  if (!supabase) throw new Error('Supabase no configurado (revisa src/maestro/.env).');
  return supabase;
}

export async function listNotifications(): Promise<AppNotification[]> {
  const { data, error } = await requireSb()
    .from('notifications')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as NotificationRow[]).map(rowToNotification);
}

export async function saveNotification(n: AppNotification): Promise<void> {
  const { error } = await requireSb().from('notifications').upsert(notificationToRow(n));
  if (error) throw error;
}

export async function deleteNotification(id: string, nowIso: string): Promise<void> {
  const { error } = await requireSb()
    .from('notifications')
    .update({ deleted_at: nowIso, updated_at: nowIso })
    .eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd src/maestro && npx vitest run src/maestroClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint (commit local diferido)**

```bash
git add src/maestro/src/maestroClient.ts src/maestro/src/maestroClient.test.ts
```

---

### Task 7: UI de Maestro (Redactar + Historial con editar/eliminar)

**Files:**
- Modify: `src/maestro/src/MaestroApp.tsx` (reemplaza el placeholder)

**Interfaces:**
- Consumes: `newNotification`, `listNotifications`, `saveNotification`, `deleteNotification`, `AppNotification` (Task 6).

- [ ] **Step 1: Implementar la UI**

Replace `src/maestro/src/MaestroApp.tsx`:
```tsx
/**
 * MaestroApp — panel para redactar y administrar las notificaciones que ven todas las PCs.
 * Redactar (título + cuerpo + vencimiento opcional) y un historial con editar/eliminar.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  newNotification,
  listNotifications,
  saveNotification,
  deleteNotification,
} from './maestroClient';
import type { AppNotification } from '../../shared/src/logic/notifications';

export function MaestroApp() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [expires, setExpires] = useState(''); // yyyy-mm-ddThh:mm o ''
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const refresh = useCallback(async () => {
    try {
      setItems(await listNotifications());
    } catch (e) {
      setStatus('Error al cargar: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resetForm = () => {
    setTitle('');
    setBody('');
    setExpires('');
    setEditingId(null);
  };

  const submit = async () => {
    if (!title.trim() && !body.trim()) return;
    const nowIso = new Date().toISOString();
    const expiresAt = expires ? new Date(expires).toISOString() : null;
    try {
      if (editingId) {
        const existing = items.find((i) => i.id === editingId);
        if (existing) {
          await saveNotification({ ...existing, title: title.trim(), body: body.trim(), expiresAt, updatedAt: nowIso });
        }
      } else {
        await saveNotification(newNotification(title, body, expiresAt, nowIso));
      }
      setStatus(editingId ? 'Mensaje actualizado.' : 'Mensaje enviado.');
      resetForm();
      await refresh();
    } catch (e) {
      setStatus('Error al guardar: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const startEdit = (n: AppNotification) => {
    setEditingId(n.id);
    setTitle(n.title);
    setBody(n.body);
    setExpires(n.expiresAt ? n.expiresAt.slice(0, 16) : '');
  };

  const remove = async (id: string) => {
    try {
      await deleteNotification(id, new Date().toISOString());
      setStatus('Mensaje eliminado.');
      if (editingId === id) resetForm();
      await refresh();
    } catch (e) {
      setStatus('Error al eliminar: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Farmabox Maestro</h1>
      <p style={{ color: '#6b7280', marginTop: 0 }}>Envía avisos a todas las PCs con Farmabox.</p>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>Título</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inp} placeholder="Ej. Reunión de coordinación" />
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 10 }}>Mensaje</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} style={{ ...inp, resize: 'vertical' }} placeholder="Escribe el aviso…" />
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 10 }}>Vence (opcional)</label>
        <input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} style={inp} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={submit} style={btnPrimary}>{editingId ? 'Guardar cambios' : 'Enviar'}</button>
          {editingId && <button onClick={resetForm} style={btnGhost}>Cancelar</button>}
        </div>
        {status && <p style={{ fontSize: 12, color: '#2563eb', marginBottom: 0 }}>{status}</p>}
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 24 }}>Enviados</h2>
      {items.length === 0 && <p style={{ color: '#9ca3af' }}>Aún no hay mensajes.</p>}
      {items.map((n) => (
        <div key={n.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>{n.title || '(sin título)'}</div>
          <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap' }}>{n.body}</div>
          {n.expiresAt && <div style={{ fontSize: 11, color: '#9ca3af' }}>Vence: {new Date(n.expiresAt).toLocaleString()}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => startEdit(n)} style={btnGhost}>Editar</button>
            <button onClick={() => remove(n.id)} style={btnDanger}>Eliminar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, marginTop: 4 };
const btnPrimary: React.CSSProperties = { background: '#2563eb', color: '#fff', border: 0, borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { background: '#f3f4f6', color: '#374151', border: 0, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' };
const btnDanger: React.CSSProperties = { background: '#fee2e2', color: '#b91c1c', border: 0, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' };
```

- [ ] **Step 2: Verificar tipos**

Run: `cd src/maestro && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 3: Verificación manual (dev, end-to-end con el receptor)**

Con la migración 2.5 corrida: abre Maestro en dev (Task 5 Step 8) y el frontend de Farmabox en otra ventana (Task 4 Step 4). En Maestro: escribe título+mensaje → **Enviar**. Expected: aparece en "Enviados" y salta el pop-up en Farmabox. Prueba **Editar** (cambia el texto, guarda) → re-salta en Farmabox con el texto nuevo. Prueba **Eliminar** → desaparece de "Enviados" y ya no salta.

- [ ] **Step 4: Checkpoint (commit local diferido)**

```bash
git add src/maestro/src/MaestroApp.tsx
```

---

### Task 8: Empaquetar el instalador de Maestro

**Files:** (sin código nuevo; usa la config de Task 5)

- [ ] **Step 1: Compilar main + renderer**

Run (desde `src/maestro`): `npm run build`
Expected: genera `dist-main/main.js` (tsc) y `dist/` (vite) sin errores.

- [ ] **Step 2: Empaquetar**

Run (desde `src/maestro`): `CSC_IDENTITY_AUTO_DISCOVERY=false npm run package`
Expected: genera `src/maestro/dist-installer/Farmabox-Maestro-Setup-1.0.0.exe`. (Si falla por symlinks, correr como Administrador / Modo desarrollador; si falla por lock, cerrar cualquier "Farmabox Maestro" abierto.)

- [ ] **Step 3: Verificación manual (instalado)**

Instala el `.exe`, ábrelo, envía un mensaje de prueba y confirma que salta en una Farmabox instalada (que ya tenga v2.3.16). 

- [ ] **Step 4: Checkpoint (commit local diferido)**

```bash
git add src/maestro
```

> **Entrega:** el instalador de Maestro es solo para la PC del administrador (no se publica en el repo de releases). Farmabox receptor se despliega como v2.3.16 por el auto-update (ver nota al final de Fase A). **Ningún despliegue/instalación se hace sin que el usuario lo pida.**

---

## Phase C — Caja de sugerencias (canal inverso)

Farmabox envía sugerencias (error/mejora) → Maestro las lee. El emisor va en el mismo build de Farmabox v2.3.16; el lector, en el mismo instalador de Maestro.

### Task 9: Migración 2.6 + lógica pura de sugerencias

**Files:**
- Create: `docs/migracion-2.6-sugerencias.sql`
- Create: `src/shared/src/logic/suggestions.ts`
- Test: `src/shared/src/logic/suggestions.test.ts`

**Interfaces:**
- Produces:
  - `type SuggestionKind = 'error' | 'improvement'`
  - `interface AppSuggestion { id: string; kind: SuggestionKind; body: string; author?: string | null; createdAt: string; updatedAt: string; resolvedAt?: string | null; deletedAt?: string | null }`
  - `interface SuggestionRow { id: string; kind: string; body: string; author: string | null; created_at: string; updated_at: string; resolved_at: string | null; deleted_at: string | null }`
  - `rowToSuggestion(r: SuggestionRow): AppSuggestion`
  - `suggestionToRow(s: AppSuggestion): SuggestionRow`
  - `newSuggestion(kind: SuggestionKind, body: string, author: string, nowIso: string): AppSuggestion` (id `sug-<uuid>`, pura)

- [ ] **Step 1: Escribir la migración SQL**

Create `docs/migracion-2.6-sugerencias.sql`:
```sql
-- Migración 2.6 — caja de sugerencias (cualquier PC reporta error/mejora; el maestro las lee).
create table if not exists suggestions (
  id          text primary key,
  kind        text not null default 'improvement',
  body        text not null default '',
  author      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz,
  deleted_at  timestamptz
);

do $$
begin
  alter publication supabase_realtime add table suggestions;
exception when duplicate_object then null;
end $$;
```

- [ ] **Step 2: Escribir el test que falla**

Create `src/shared/src/logic/suggestions.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { rowToSuggestion, suggestionToRow, newSuggestion, type AppSuggestion } from './suggestions';

const base: AppSuggestion = {
  id: 'sug-1',
  kind: 'error',
  body: 'La exportación falla',
  author: 'Ana',
  createdAt: '2026-08-04T10:00:00.000Z',
  updatedAt: '2026-08-04T10:00:00.000Z',
  resolvedAt: null,
  deletedAt: null,
};

describe('suggestions logic', () => {
  it('mapea fila↔objeto', () => {
    const row = suggestionToRow(base);
    expect(row.created_at).toBe(base.createdAt);
    expect(rowToSuggestion(row)).toEqual(base);
  });

  it('newSuggestion: id sug-*, recorta y sella; author vacío → null', () => {
    const s = newSuggestion('improvement', '  más colores  ', '   ', '2026-08-04T12:00:00.000Z');
    expect(s.id).toMatch(/^sug-/);
    expect(s.kind).toBe('improvement');
    expect(s.body).toBe('más colores');
    expect(s.author).toBeNull();
    expect(s.createdAt).toBe('2026-08-04T12:00:00.000Z');
    expect(s.resolvedAt).toBeNull();
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `cd src/shared && npx vitest run src/logic/suggestions.test.ts`
Expected: FAIL ("Cannot find module './suggestions'").

- [ ] **Step 4: Implementar la lógica pura**

Create `src/shared/src/logic/suggestions.ts`:
```ts
/**
 * Lógica PURA de sugerencias (canal inverso: las PCs reportan error/mejora; el maestro lee).
 * Compartida entre el emisor (Farmabox) y el lector (Maestro).
 */
export type SuggestionKind = 'error' | 'improvement';

export interface AppSuggestion {
  id: string;
  kind: SuggestionKind;
  body: string;
  author?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  deletedAt?: string | null;
}

export interface SuggestionRow {
  id: string;
  kind: string;
  body: string;
  author: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  deleted_at: string | null;
}

export function rowToSuggestion(r: SuggestionRow): AppSuggestion {
  return {
    id: r.id,
    kind: r.kind === 'error' ? 'error' : 'improvement',
    body: r.body,
    author: r.author,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolvedAt: r.resolved_at,
    deletedAt: r.deleted_at,
  };
}

export function suggestionToRow(s: AppSuggestion): SuggestionRow {
  return {
    id: s.id,
    kind: s.kind,
    body: s.body,
    author: s.author ?? null,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    resolved_at: s.resolvedAt ?? null,
    deleted_at: s.deletedAt ?? null,
  };
}

/** Crea una sugerencia nueva (pura). author vacío → null. */
export function newSuggestion(
  kind: SuggestionKind,
  body: string,
  author: string,
  nowIso: string,
): AppSuggestion {
  return {
    id: `sug-${crypto.randomUUID()}`,
    kind,
    body: body.trim(),
    author: author.trim() || null,
    createdAt: nowIso,
    updatedAt: nowIso,
    resolvedAt: null,
    deletedAt: null,
  };
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `cd src/shared && npx vitest run src/logic/suggestions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Checkpoint (commit local diferido)**

```bash
git add docs/migracion-2.6-sugerencias.sql src/shared/src/logic/suggestions.ts src/shared/src/logic/suggestions.test.ts
```

---

### Task 10: Emisor de sugerencias en Farmabox

**Files:**
- Create: `src/frontend/src/services/suggestionsClient.ts`
- Create: `src/frontend/src/components/suggestions/SuggestionBox.tsx`
- Modify: `src/frontend/src/App.tsx` (montar `<SuggestionBox />` junto a `<NotificationPopup />`)

**Interfaces:**
- Consumes: `newSuggestion`, `suggestionToRow`, `AppSuggestion`, `SuggestionKind` (Task 9); `supabase` (supabaseClient); `toast` (react-hot-toast, ya usado en la app).
- Produces: `submitSuggestion(s: AppSuggestion): Promise<void>`; componente `SuggestionBox`.

- [ ] **Step 1: Implementar el cliente**

Create `src/frontend/src/services/suggestionsClient.ts`:
```ts
/**
 * Emisor de sugerencias (Farmabox → Supabase). Escritura directa con el `supabase` del
 * renderer (RLS abierto). El maestro las lee desde la app Maestro.
 */
import { supabase } from './supabaseClient';
import { suggestionToRow, type AppSuggestion } from '../../../shared/src/logic/suggestions';

export async function submitSuggestion(s: AppSuggestion): Promise<void> {
  if (!supabase) throw new Error('No hay conexión para enviar la sugerencia.');
  const { error } = await supabase.from('suggestions').insert(suggestionToRow(s));
  if (error) throw error;
}
```

- [ ] **Step 2: Implementar el componente**

Create `src/frontend/src/components/suggestions/SuggestionBox.tsx`:
```tsx
/**
 * SuggestionBox — botón flotante (abajo-izquierda) para que cualquier PC reporte un error o
 * pida una mejora. Abre un formulario (tipo + mensaje + nombre opcional) y lo envía a Supabase.
 */
import { useState } from 'react';
import { MessageSquarePlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { submitSuggestion } from '../../services/suggestionsClient';
import { newSuggestion, type SuggestionKind } from '../../../../shared/src/logic/suggestions';

export function SuggestionBox() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SuggestionKind>('error');
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await submitSuggestion(newSuggestion(kind, body, author, new Date().toISOString()));
      toast.success('¡Gracias! Tu sugerencia fue enviada.');
      setBody('');
      setAuthor('');
      setKind('error');
      setOpen(false);
    } catch (e) {
      toast.error('No se pudo enviar: ' + (e instanceof Error ? e.message : 'error'));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Enviar sugerencia"
        className="fixed bottom-4 left-4 z-[900] flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-emerald-700"
      >
        <MessageSquarePlus className="h-4 w-4" /> Sugerencia
      </button>

      {open && (
        <div className="fixed inset-0 z-[950] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between rounded-t-xl bg-emerald-600 px-5 py-3 text-white">
              <span className="text-base font-bold">Enviar sugerencia</span>
              <button onClick={() => setOpen(false)} aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="flex gap-2">
                <button onClick={() => setKind('error')} className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold ${kind === 'error' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-300 text-gray-600'}`}>Error</button>
                <button onClick={() => setKind('improvement')} className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold ${kind === 'improvement' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-300 text-gray-600'}`}>Mejora</button>
              </div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Describe el error o la mejora que necesitas…" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Tu nombre o PC (opcional)" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <button onClick={() => setOpen(false)} className="rounded-md px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100">Cancelar</button>
              <button onClick={send} disabled={sending || !body.trim()} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {sending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Montar en App.tsx**

Agregar el import y montar junto a `<NotificationPopup />` (línea ~116):
```tsx
import { SuggestionBox } from '@/components/suggestions/SuggestionBox';
```
```tsx
      <ChatWidget />
      <NotificationPopup />
      <SuggestionBox />
      <Toaster position="top-right" />
```

- [ ] **Step 4: Verificar tipos + lint**

Run: `cd src/frontend && npx tsc --noEmit && npx eslint src/components/suggestions/SuggestionBox.tsx src/services/suggestionsClient.ts --ext ts,tsx`
Expected: sin errores.

- [ ] **Step 5: Verificación manual (dev)**

Con la migración 2.6 corrida y el frontend en dev: pulsa "Sugerencia", elige Error/Mejora, escribe y envía. Expected: toast de éxito y aparece una fila en `suggestions` (verifícalo en el SQL Editor: `select kind, body, author from suggestions order by created_at desc limit 1;`).

- [ ] **Step 6: Checkpoint (commit local diferido)**

```bash
git add src/frontend/src/services/suggestionsClient.ts src/frontend/src/components/suggestions/SuggestionBox.tsx src/frontend/src/App.tsx
```

---

### Task 11: Lector de sugerencias en Maestro (pestañas)

**Files:**
- Modify: `src/maestro/src/maestroClient.ts` (agregar ops de sugerencias)
- Create: `src/maestro/src/NotificationsPanel.tsx` (mover aquí la UI de notificaciones de Task 7)
- Create: `src/maestro/src/SuggestionsPanel.tsx`
- Modify: `src/maestro/src/MaestroApp.tsx` (convertir en contenedor de pestañas)

**Interfaces:**
- Consumes: `rowToSuggestion`, `AppSuggestion`, `SuggestionRow` (Task 9); helpers de red de `maestroClient` (Task 6).
- Produces: `listSuggestions()`, `resolveSuggestion(id, nowIso)`, `deleteSuggestion(id, nowIso)`; componentes `NotificationsPanel`, `SuggestionsPanel`.

- [ ] **Step 1: Agregar las ops de sugerencias al cliente**

Al final de `src/maestro/src/maestroClient.ts`, agregar el import y las funciones:
```ts
import { rowToSuggestion, type AppSuggestion, type SuggestionRow } from '../../shared/src/logic/suggestions';

export async function listSuggestions(): Promise<AppSuggestion[]> {
  const { data, error } = await requireSb()
    .from('suggestions')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as SuggestionRow[]).map(rowToSuggestion);
}

export async function resolveSuggestion(id: string, nowIso: string): Promise<void> {
  const { error } = await requireSb()
    .from('suggestions')
    .update({ resolved_at: nowIso, updated_at: nowIso })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteSuggestion(id: string, nowIso: string): Promise<void> {
  const { error } = await requireSb()
    .from('suggestions')
    .update({ deleted_at: nowIso, updated_at: nowIso })
    .eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 2: Extraer la UI de notificaciones a NotificationsPanel**

Create `src/maestro/src/NotificationsPanel.tsx` y **mueve tal cual** el cuerpo del componente de Task 7 (todo el estado y JSX de redactar + historial) a un componente `export function NotificationsPanel()`. Deja los estilos `inp/btnPrimary/btnGhost/btnDanger` en este archivo (o expórtalos desde aquí). El contenido es idéntico al de Task 7; solo cambia el nombre de la función a `NotificationsPanel` y se quita el `<h1>Farmabox Maestro</h1>` de cabecera (pasa al contenedor).

- [ ] **Step 3: Crear SuggestionsPanel**

Create `src/maestro/src/SuggestionsPanel.tsx`:
```tsx
/** Pestaña de sugerencias recibidas: lista error/mejora con marcar-resuelta y eliminar. */
import { useCallback, useEffect, useState } from 'react';
import { listSuggestions, resolveSuggestion, deleteSuggestion } from './maestroClient';
import type { AppSuggestion } from '../../shared/src/logic/suggestions';

export function SuggestionsPanel() {
  const [items, setItems] = useState<AppSuggestion[]>([]);
  const [status, setStatus] = useState('');

  const refresh = useCallback(async () => {
    try {
      setItems(await listSuggestions());
    } catch (e) {
      setStatus('Error al cargar: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resolve = async (id: string) => {
    try {
      await resolveSuggestion(id, new Date().toISOString());
      await refresh();
    } catch (e) {
      setStatus('Error: ' + (e instanceof Error ? e.message : String(e)));
    }
  };
  const remove = async (id: string) => {
    try {
      await deleteSuggestion(id, new Date().toISOString());
      await refresh();
    } catch (e) {
      setStatus('Error: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div>
      {status && <p style={{ fontSize: 12, color: '#b91c1c' }}>{status}</p>}
      {items.length === 0 && <p style={{ color: '#9ca3af' }}>No hay sugerencias todavía.</p>}
      {items.map((s) => (
        <div
          key={s.id}
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            padding: 12,
            marginBottom: 8,
            opacity: s.resolvedAt ? 0.55 : 1,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: s.kind === 'error' ? '#fee2e2' : '#d1fae5',
                color: s.kind === 'error' ? '#b91c1c' : '#047857',
              }}
            >
              {s.kind === 'error' ? 'ERROR' : 'MEJORA'}
            </span>
            {s.author && <span style={{ fontSize: 12, color: '#6b7280' }}>de {s.author}</span>}
            {s.resolvedAt && <span style={{ fontSize: 12, color: '#059669' }}>✓ resuelta</span>}
          </div>
          <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', marginTop: 6 }}>{s.body}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{new Date(s.createdAt).toLocaleString()}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {!s.resolvedAt && (
              <button onClick={() => resolve(s.id)} style={{ background: '#d1fae5', color: '#047857', border: 0, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                Marcar resuelta
              </button>
            )}
            <button onClick={() => remove(s.id)} style={{ background: '#fee2e2', color: '#b91c1c', border: 0, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
              Eliminar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Convertir MaestroApp en contenedor de pestañas**

Replace `src/maestro/src/MaestroApp.tsx`:
```tsx
/** MaestroApp — dos pestañas: enviar Notificaciones y leer Sugerencias recibidas. */
import { useState } from 'react';
import { NotificationsPanel } from './NotificationsPanel';
import { SuggestionsPanel } from './SuggestionsPanel';

export function MaestroApp() {
  const [tab, setTab] = useState<'notif' | 'sug'>('notif');
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Farmabox Maestro</h1>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0 16px' }}>
        <button onClick={() => setTab('notif')} style={tabBtn(tab === 'notif')}>Notificaciones</button>
        <button onClick={() => setTab('sug')} style={tabBtn(tab === 'sug')}>Sugerencias recibidas</button>
      </div>
      {tab === 'notif' ? <NotificationsPanel /> : <SuggestionsPanel />}
    </div>
  );
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    border: 0,
    borderRadius: 8,
    padding: '8px 14px',
    fontWeight: 600,
    cursor: 'pointer',
    background: active ? '#2563eb' : '#e5e7eb',
    color: active ? '#fff' : '#374151',
  };
}
```

- [ ] **Step 5: Verificar tipos**

Run: `cd src/maestro && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 6: Verificación manual (end-to-end)**

Con las migraciones 2.5 y 2.6 corridas: en Farmabox envía una sugerencia (Task 10 Step 5). En Maestro → pestaña "Sugerencias recibidas": aparece con su etiqueta ERROR/MEJORA y autor. Pulsa "Marcar resuelta" (se atenúa) y "Eliminar" (desaparece).

- [ ] **Step 7: Checkpoint (commit local diferido)**

```bash
git add src/maestro/src/maestroClient.ts src/maestro/src/NotificationsPanel.tsx src/maestro/src/SuggestionsPanel.tsx src/maestro/src/MaestroApp.tsx
```

> **Nota:** re-empaquetar el instalador de Maestro (Task 8) tras esta tarea para que incluya la pestaña de sugerencias.

---

## Self-Review (cobertura del spec)

- Tabla `notifications` (id/title/body/created_at/updated_at/expires_at/deleted_at) → Task 1 (migración) + tipo/mapeo.
- Transporte = Supabase existente + Realtime → Task 2 (subscribe) + poll en Task 3.
- App Maestro separada (redactar/editar/eliminar/historial) → Tasks 5–8.
- Pop-up inmediato de no vistos, editar re-salta (por updatedAt), borrar cierra/oculta, vencimiento respetado → Tasks 1 (lógica) + 3 (hook) + 4 (UI) + verificación end-to-end en Task 7 Step 3.
- "Visto" local por PC → Task 3.
- Degradación segura si falta la tabla → Task 2 (`fetchNotifications` devuelve `[]`).
- Ids estables no-timestamp → Task 6 (`crypto.randomUUID()`).
- Independencia del live → Maestro no importa nada de horarios; receptor usa un canal/tabla aparte.
- Empaque: 2º instalador (Maestro) + versión nueva de Farmabox (v2.3.16) → Task 8 + nota Fase A.
- Fuera de alcance (urgencias, acuse de lectura, adjuntos, RLS) → respetado (no hay tareas para eso).
- **Sugerencias:** tabla `suggestions` + lógica pura (Task 9); caja emisora en Farmabox con tipo Error/Mejora + mensaje + nombre opcional (Task 10); pestaña lectora en Maestro con marcar-resuelta + eliminar (Task 11). Emisor viaja en Farmabox v2.3.16; lector en el instalador de Maestro (re-empaquetar Task 8).
- Ids de sugerencia estables no-timestamp → Task 9 (`crypto.randomUUID()`).
