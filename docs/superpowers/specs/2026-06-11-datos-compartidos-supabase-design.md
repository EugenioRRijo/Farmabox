# Diseño: Entorno de datos compartido robusto (Supabase, offline-first endurecido)

- **Fecha:** 2026-06-11
- **Estado:** Aprobado (pendiente de plan de implementación)
- **Enfoque elegido:** A — Endurecer el camino Supabase existente

## Contexto

La app (web + escritorio Electron) ya tiene un backend relacional en Supabase como
fuente de datos, con dos modos de almacenamiento ya implementados:

- **Nube (Supabase)** — por defecto, por internet, esquema relacional normalizado,
  merge fila-por-fila (newest-wins + `deleted_at`), y un workflow de keepalive.
- **Carpeta compartida (red local)** — JSON en carpeta de red, mismo merge por ítem.

Piezas relevantes existentes:

- `src/frontend/src/services/BackendService.ts` — capa de transporte (router web/IPC).
- `src/frontend/src/services/supabaseWeb.ts` — datos del modo web, directo a Supabase.
- `src/frontend/src/services/supabaseClient.ts` — cliente web (creds por `.env`).
- `src/electron/src/services/{CloudStorageService,SharedFolderStorageService,SyncStorageBase}.ts`
- `src/electron/src/sync/{merge,diff}.ts` (+ sus tests) — merge offline-first por ítem.
- `src/electron/src/config/{appConfig,env}.ts` — modo y credenciales cifradas.
- `docs/supabase-schema.sql`, `docs/SUPABASE-Y-DATOS.md`, `.github/workflows/supabase-keepalive.yml`.

**No es construir un backend nuevo.** El trabajo es endurecer y dar fiabilidad al
camino de nube ya existente.

## Perfil de uso (decisiones del usuario)

- **Usuarios:** 5-10 personas.
- **Concurrencia:** edición ocasional y simultánea, normalmente de **horarios distintos**
  (secciones/semestres distintos). Requisito: ver cambios de otros y **no pisarse**.
- **Conectividad:** internet casi siempre, con cortes ocasionales → **offline-first**.
- **Auth:** ninguna. Sin login ni identidad por usuario. Todos editan por igual.
- **Restricción de costo:** usar el **plan gratis** de Supabase, con garantía de que
  **no se pause** por inactividad.
- **Carpeta compartida:** el usuario no la quiere; se retira de la interfaz.

## Objetivos

1. Que los datos **no se pierdan** con edición concurrente de horarios distintos.
2. Que cada PC **vea en vivo** los cambios de las demás.
3. Que el estado de guardado/conexión sea **siempre visible** (nunca fallo en silencio).
4. Que el proyecto Supabase (plan gratis) **no se pause** nunca.
5. Que la **nube sea el único modo compartido** visible (sin ambigüedad de modo).

## No-objetivos (fuera de alcance)

- Login, roles o identidad por usuario.
- Servidor self-hosted / LAN (enfoque B descartado).
- Bloqueos por sección, presencia/cursores en vivo, UI de resolución de conflictos
  (enfoque C descartado).
- Migración del esquema relacional (se conserva tal cual).

## Problemas raíz identificados

1. **Escrituras que pisan (pérdida de datos).**
   - `supabaseWeb.saveScheduleBlocks` sube el set completo y marca como borrado
     (`deleted_at`) cualquier bloque vivo que no esté en su vista. Con una vista
     desactualizada, **borra bloques que otra PC acaba de crear**.
   - `supabaseWeb.saveAcademicLoad` hace `delete-all` + `insert`: mismo riesgo.
2. **Sin actualización en vivo (web):** solo refresca al recargar.
3. **Fiabilidad de la nube:** el plan gratis se pausa a ~7 días sin actividad; si el
   keepalive no está activo, las escrituras fallan en silencio. Además, errores de
   escritura se tragan o se muestran como `alert` genérico.

## Diseño por fases

### Fase 1 — Escrituras a prueba de pisado (núcleo)

**Bloques de horario → guardado acotado por (semestre, sección) + diff.**

- Nueva semántica: guardar reconciliando **solo** los bloques del `(semester, section)`
  que se está editando. Dentro de ese alcance: upsert de creados/modificados, y
  tombstone **solo** de los que el usuario quitó dentro de ese alcance. Los bloques de
  otras secciones/semestres **nunca se tocan**.
- API: `saveScheduleBlocks` recibe el alcance explícito, p. ej.
  `saveScheduleBlocks(blocks, { semester, section })`, o se exponen ops granulares
  (`upsertBlock`, `deleteBlock`). Decisión: **guardado acotado por scope** como mecanismo
  principal (mínimo cambio, encaja con "editan horarios distintos").
- **Guarda anti-borrado obsoleto:** registrar el `loadedAt` (momento de la última lectura
  del dataset). Al tombstonear, no borrar filas cuyo `updated_at` sea **más nuevo** que
  `loadedAt` (otra PC las creó/editó después de mi lectura). Esas filas se conservan y el
  próximo refresh las trae.

**Carga académica → diff por materia.**

- Reemplazar `delete-all`+`insert` por reconciliación **por `subject_code`**: solo se
  insertan/borran las filas de la materia editada. Editar la materia X nunca toca la Y.

**Espejo en el escritorio (CloudStorageService / SyncStorageBase):** alinear la misma
semántica acotada para que web y escritorio escriban igual de seguro.

**Tests:** dado estado DB + edición local, las ops son correctas y no borran fuera de
alcance; A y B en secciones distintas no se pierden bloques; A y B en el mismo bloque →
gana el más nuevo, sin duplicar.

### Fase 2 — Estado visible, errores y anti-pausa

**Indicador de estado** (persistente en la UI): "Nube conectada · Guardado" /
"Guardando…" / "Sin conexión — se subirá al reconectar" / "Error al guardar — reintentar".
Refleja conectividad + resultado de la última escritura. Resuelve "no sé qué modo uso".

**Errores nunca en silencio:** toda escritura fallida muestra aviso accionable + reintento
y se loguea; se elimina el swallow de errores y los `alert` genéricos.

**Chequeo al inicio:** si faltan credenciales o la base no responde, banner claro
("Sin conexión a la base compartida — trabajando local") en vez de degradar en silencio.

**Anti-pausa del plan gratis (multi-capa):**

1. **GitHub Action keepalive** (`supabase-keepalive.yml`): verificar que esté activa,
   con los secrets `SUPABASE_URL` / `SUPABASE_ANON_KEY` cargados en el repo, corriendo
   cada ≤3 días (margen frente al límite de ~7). Documentar el setup paso a paso.
2. **Ping de arranque en la app:** al abrir, una lectura liviana (`select ... limit 1`)
   cuenta como actividad; con uso casi diario, refuerza el keepalive.
3. **Respaldo independiente (cron externo):** documentar una alternativa que no dependa
   del repo (p. ej. un cron-ping gratuito) por si la Action se desactiva.
4. **Verificación:** un check manual/documentado para confirmar que el proyecto sigue
   activo (consulta de salud), y qué hacer si se pausó (reactivar desde el dashboard).

### Fase 3 — Tiempo real (ver cambios de otros)

- **Supabase Realtime:** suscripción a `professors`, `subjects`, `professor_subjects`,
  `academic_load`, `schedule_blocks`. Ante un cambio remoto, refrescar (con debounce) el
  dataset afectado en `AppDataContext` y actualizar la UI.
- **Escritorio:** unificar con el pull periódico + `onDataChanged` ya existente para que
  web y escritorio reflejen cambios en vivo de forma consistente.
- Cuidar no re-disparar el refresh por los propios cambios locales (evitar bucles).

### Fase 4 — Nube por defecto + retirar carpeta compartida de la UI

- La nube es el único modo compartido visible. En **Configuración → Almacenamiento** se
  muestra el **estado de la nube** (conectada/última sincronización) en lugar del selector
  de carpeta.
- El código de `SharedFolderStorageService` se conserva como respaldo de emergencia pero
  se quita del flujo normal de UI, eliminando la ambigüedad de "qué modo uso".
- Actualizar `docs/SUPABASE-Y-DATOS.md` acorde.

## Riesgos y mitigaciones

- **Guarda anti-borrado por reloj:** depende de `updated_at` coherente; se sella siempre
  en el servidor/escritura. Mitiga el caso común (vista vieja borra lo nuevo); no busca
  resolver edición byte-a-byte del mismo bloque (eso es newest-wins, aceptado).
- **Realtime y límites del plan free:** suscripciones acotadas y refetch con debounce para
  no exceder cuotas; degradar a pull periódico si Realtime no está disponible.
- **Plan gratis pausado pese a keepalive:** las capas 2-4 (ping de arranque, cron externo,
  verificación) dan redundancia.

## Plan de pruebas

- Unitarias del diff/guardado acotado y de la guarda anti-borrado (extender
  `merge.test.ts` / `diff.test.ts`).
- Simulación de concurrencia (dos clientes lógicos) para bloques y carga académica.
- Manual: dos instancias contra el mismo proyecto Supabase; editar secciones distintas a
  la vez y verificar que nada se pierde y que los cambios aparecen en vivo.

## Orden de entrega

1. Fase 1 (frena la pérdida de datos) → 2. Fase 2 (fiabilidad/visibilidad/anti-pausa) →
3. Fase 3 (tiempo real) → 4. Fase 4 (nube por defecto, retirar carpeta).

La Fase 1 entrega valor por sí sola y puede implementarse/validarse primero.
