# Sincronización de datos multi-PC — opciones y recomendaciones

**Fecha:** 2026-08-03
**Contexto:** Farmabox comparte profesores/materias/horarios entre varias PCs vía Supabase,
offline-first, sin login. Este documento resume **cómo funciona hoy**, **qué falla**, y
**varias maneras de robustecerlo**, con una recomendación priorizada.

---

## 1. Cómo sincroniza hoy

**Modelo:** offline-first. Cada PC guarda los datos localmente (JSON en `userData/data/`)
y sincroniza contra las tablas relacionales de Supabase (`professors`, `subjects`,
`professor_subjects`, `academic_load`, `schedule_blocks`, `logs`).

**Escritorio (`.exe` — `CloudStorageService` + `SyncStorageBase`):**
- **Merge por-ítem "newest-wins":** cada fila tiene `updated_at`; al fusionar, gana la más
  reciente. Borrado lógico con `deleted_at` (tombstones).
- **Push seguro:** `pushDataOnly` hace pull+merge ANTES de subir (Incremento 2), para no
  pisar `academic_load`/`professor_subjects`.
- **Realtime** (Supabase) + **poll cada 60 s** como red de seguridad.
- **UI (#7a):** pospone el `reload` mientras estás editando, para no pisar tu trabajo.

**Web (navegador — `supabaseWeb.ts`):**
- **LWW grueso:** `saveScheduleBlocks` (reemplaza el set completo) y `saveAcademicLoad`
  (borra-todo-e-inserta) **re-sellan `updated_at: now()` en TODAS las filas** al guardar.
  → Esto **pierde el sellado por-ítem** y es propenso a pisar cambios de otras PCs.

**Bloqueo optimista (migración `docs/migracion-2.3-concurrencia.sql`):**
- Trigger `farmabox_guard_newest_wins`: en la BD, **descarta** cualquier UPDATE cuyo
  `updated_at` sea más viejo que el guardado (newest-wins **atómico**, cierra el TOCTOU
  pull→push). Idempotente. **⚠️ Verificar si ya se corrió** (era "pendiente del usuario").

---

## 2. Qué falla (observado)

1. **Duplicación de profesores (incidente jun-2026, revivido esta sesión):** una operación
   "borra-todo-e-inserta" / reimport creó profesores nuevos con **IDs generados**
   (`prof-<timestamp>`) sin fusionar con los canónicos → 29 personas duplicadas (con y sin
   tilde). El export mostraba "Prof. X, Prof. X".
   **Raíz:** IDs no deterministas + el import inserta en vez de fusionar por identidad.

2. **Convergencia multi-PC incompleta:** limpiar UNA PC + Supabase **no basta**. Si otra PC
   con datos viejos abre y sincroniza, puede **re-subir** los duplicados (el newest-wins
   actualiza filas pero no borra las que otra PC re-crea como activas).

3. **Camino WEB frágil:** el LWW grueso puede pisar cambios concurrentes hechos desde el
   escritorio (o desde otro navegador).

4. **Pausa del free tier (keepalive):** RESUELTO esta sesión (Secrets de GitHub Actions).

---

## 3. Opciones para robustecer (de menor a mayor esfuerzo)

### Opción A — Correr la migración 2.3 (bloqueo optimista) ⭐ **base de todo**
- **Qué:** ejecutar `docs/migracion-2.3-concurrencia.sql` en Supabase → SQL Editor.
- **Da:** newest-wins **atómico en la BD** + habilita Realtime + columna `version`.
- **Esfuerzo:** minutos. Idempotente. Degradación segura (sin ella, cae al poll).
- **Cierra:** la ventana de "lost update" cuando 2 PCs editan la misma fila casi a la vez.
- **No cierra:** la duplicación por IDs (Opción C) ni el LWW web (Opción B).

### Opción B — Arreglar el camino WEB (sellado por-ítem)
- **Qué:** que `supabaseWeb.saveScheduleBlocks`/`saveAcademicLoad` **conserven el
  `updated_at` por fila** (como `SyncStorageBase.stampArray` en el escritorio) en vez de
  re-sellar todo a `now()`, y hagan **upsert diferencial** en vez de borra-todo-e-inserta.
- **Da:** la web deja de pisar; mismo modelo que el `.exe`.
- **Esfuerzo:** medio (reescribir 2 funciones + pruebas).

### Opción C — IDs deterministas de profesores + de-dup en el import ⭐ **cura la raíz**
- **Qué:** que el ID del profesor derive de su **identidad** (ej. cédula, o slug del nombre
  normalizado sin tildes) en vez de un timestamp. Y que **importar = fusionar por identidad**
  (upsert por nombre/cédula normalizada), nunca insertar ciego.
- **Da:** re-importar la lista JM **ya no duplica**; converge idempotentemente.
- **Esfuerzo:** medio. Incluye un de-dup de una sola vez (ya tenemos el patrón `wkey`).
- **Nota:** es lo que habría evitado TODO el problema de esta sesión.

### Opción D — Migración de limpieza en el arranque del build
- **Qué:** al abrir una versión nueva, la app corre una migración local única que
  **reemplaza** profesores/carga por el estado canónico de Supabase (o embebido), y sube
  tombstones de lo viejo.
- **Da:** garantiza que TODAS las PCs converjan al actualizar (cierra el problema #2).
- **Esfuerzo:** medio. Riesgo: hay que versionar la migración para que corra una sola vez.

### Opción E — Backups automáticos (red de seguridad) ⭐ **barato y salva vidas**
- **Qué:** un `pg_dump`/export JSON diario (ej. en el GitHub Action que ya corre para el
  keepalive) guardado como artifact, o snapshot local al arrancar.
- **Da:** poder revertir una corrupción en minutos (como el respaldo `backups/` de hoy).
- **Esfuerzo:** bajo. **No previene** problemas, pero los hace recuperables.

### Opción F — (Ambicioso) mover la lógica al servidor
- **Qué:** Supabase Edge Functions / RPC que hagan las escrituras "inteligentes"
  (upsert-por-identidad, merge) en vez de que cada cliente decida; o un modelo op-based/CRDT.
- **Da:** un solo punto de verdad para las reglas de merge; clientes "tontos".
- **Esfuerzo:** alto. Solo si el equipo crece o la concurrencia se vuelve intensa. **YAGNI**
  hoy para una herramienta interna de pocos usuarios.

---

## 4. Recomendación priorizada (incremental, sin romper producción)

| # | Acción | Esfuerzo | Por qué primero |
|---|--------|----------|-----------------|
| 1 | **Opción A** — correr migración 2.3 | Min. | Base atómica; ya está escrita |
| 2 | **Opción E** — backup diario automático | Bajo | Red de seguridad inmediata |
| 3 | **Opción C** — IDs deterministas + import que fusiona | Medio | Cura la raíz de los duplicados |
| 4 | **Opción B** — sellado por-ítem en la web | Medio | Cierra el último camino que pisa |
| 5 | **Opción D** — migración de limpieza al arrancar | Medio | Solo si alguna PC no converge sola |

**Regla de oro (aprendida hoy):** ninguna operación de datos debe ser "borra-todo-e-inserta"
ni generar IDs por timestamp. Todo cambio = **upsert por identidad estable** + **tombstone**,
conservando `updated_at` por fila.

---

## 5. Fuera de alcance por ahora
- Seguridad/RLS (diferida por el usuario esta sesión).
- Auth multi-usuario (YAGNI para herramienta interna).

## Relacionado
- `docs/migracion-2.3-concurrencia.sql`, `docs/supabase-schema.sql`, `docs/SEGURIDAD.md`
- Memoria: `datos-compartidos-supabase`, `professor-load-dual-table`
