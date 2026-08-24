# Atribución por equipo + actividad en vivo — Diseño

**Fecha:** 2026-08-13 · **Estado:** aprobado · **Alcance:** .exe (atribución completa); web solo firma sus escrituras

## Problema

La sincronización sigue siendo confusa: los usuarios no saben QUÉ PC subió cada cambio ni
se enteran cuando entran cambios de otra PC. Se pidió: identificar el equipo que sube
(SIN usuarios/roles/login) y ver la actividad en vivo.

## Decisiones (con el usuario)

1. **Identidad = la máquina, sin usuarios:** cada PC firma sus escrituras con un nombre
   amigable **editable en la app** (fallback: `os.hostname()`). En web: nombre en
   localStorage, fallback "Navegador".
2. **En vivo = aviso + panel:** toast discreto cuando entran cambios de otra PC + panel
   "Actividad reciente" en el header (historial de la sesión). La vista previa de
   Sincronizar muestra "por {equipo} · {cuándo}" en cada ítem.

## Modelo de datos

Columna **`updated_by text`** (nullable) en: `professors`, `subjects`, `academic_load`,
`schedule_blocks`, `admin_hours`. Migración **2.8** idempotente
(`docs/migracion-2.8-atribucion-equipo.sql`). Degradación: los clientes usan el patrón
`stripCol` existente — sin migración todo sigue funcionando, solo sin atribución.
`logs` y `professor_subjects` quedan fuera (no aportan a la atribución).

## Regla de oro del sellado

`updatedBy` viaja CON el sello del ítem (se estampa donde se estampa `updatedAt`, es
decir al GUARDAR con contenido cambiado o al tombstonear) — NUNCA al push (el push sube
ítems ajenos fusionados y no debe re-firmarlos). El merge (`mergeRaw`) copia ítems
completos → la atribución del ganador viaja sola.

## Contrato (NORMATIVO para los dos agentes)

### Nombre del equipo (electron)
- Config persistida junto a la config existente (mismo mecanismo que `sharedDir`):
  clave `deviceName`; default `os.hostname()`.
- IPC nuevos: `config:getDeviceName` → `{data: string}`; `config:setDeviceName(name)` →
  `{data: {ok: true, name: string}}` (name trimmed, 1..40 chars; vacío → vuelve al hostname).
- `sync:status` pasa a devolver `device` = nombre amigable (fallback hostname).
- Preload: `config.getDeviceName()`, `config.setDeviceName(name)`.

### Sellado (electron)
- `Stamped` (sync/merge.ts) gana `updatedBy?: string`.
- `SyncStorageBase` recibe el deviceName (setter `setDeviceName(name)` cableado desde
  main; default `os.hostname()`): `stampArray`, `saveAcademicLoad` y `savePensum`
  estampan `updatedBy` cada vez que re-sellan `updatedAt` o tombstonean.
- `CloudStorageService`: push mapea `updatedBy`→`updated_by` (con `stripCol` por tabla);
  pull mapea de vuelta.

### Preview con atribución (electron + espejo frontend)
`SyncPreviewItem` gana campos opcionales:
```ts
interface SyncPreviewItem { kind; label; detail?; by?: string; at?: string }
// by = updated_by de la versión que se muestra (remota para nuevo/actualizado/eliminado,
//      local para subes); at = updatedAt/deletedAt ISO de esa versión.
```

### Aviso en vivo (electron → frontend)
- `SyncStorageBase.syncNow()` calcula ANTES de fusionar un resumen con
  `buildSyncPreview(local, remote, now)` (barato, en memoria) y lo devuelve:
  `syncNow(): Promise<{ok, merged, changed, summary?: RemoteChangeSummary}>`.
```ts
interface RemoteChangeSummary {
  at: string;                                   // ISO
  devices: string[];                            // únicos, "(equipo desconocido)" si null
  counts: { nuevos: number; actualizados: number; eliminados: number };
  porDataset: { title: string; n: number }[];   // solo n>0, títulos humanos
}
```
  (solo se llena si hay ítems entrantes: nuevo/actualizado/eliminado > 0; los `subes` NO
  van al resumen — son salientes.)
- main.ts: en los 3 puntos que hoy mandan `data-changed` tras syncNow con `changed`
  (realtime, poll periódico, sync:now e incluso el onMerged del push), enviar
  `webContents.send('data-changed', summary)` (summary puede ser undefined).
- Preload: `onDataChanged(cb: (summary?: unknown) => void)` — pasa el payload.

### Frontend
- `BackendService`: espeja `RemoteChangeSummary`, `SyncPreviewItem.by/at`,
  `getDeviceName()/setDeviceName()` (web: localStorage `farmabox.deviceName`, default
  "Navegador"); `onRemoteDataChanged(cb)` pasa el summary.
- **ActivityFeed** (nuevo, en memoria de la sesión): módulo/contexto simple con
  `push(entry)` y lista reactiva (máx. 50). Entrada: `{at, devices, counts, porDataset}`.
- `AppDataContext.onRemoteDataChanged`: sigue haciendo reload(true) + si summary con
  cambios: `toast` discreto ("⬇ Cambios de {device}: 2 bloques, 1 profesor") y push al feed.
- **Panel "Actividad reciente"**: icono `History` en el Header junto al SyncButton, con
  badge de no-vistos; dropdown con las entradas ("14:32 — PC Laboratorio: 2 bloques de
  horario, 1 profesor"). Vacío: "Sin actividad de otras PCs en esta sesión."
- **SyncButton**: cada ítem del preview muestra `by`/`at` ("por PC Laboratorio · hace 5 min");
  en la franja inferior, "Equipo: {nombre}" gana un lápiz para editar el nombre (usa
  get/setDeviceName; al guardar refresca el estado local).
- **Sellado web/admin:** `supabaseWeb` estampa `updated_by` (deviceName web) en las filas
  CAMBIADAS de `saveScheduleBlocks`/`saveAcademicLoad` y en creates/updates de profesores
  y materias (con degradación si la columna no existe — patrón stripProf/stripBlock*);
  `adminHoursClient`/`AppDataContext` estampan `updatedBy` en add/remove de horas admin
  (AdminHourSync gana `updatedBy?`, fila `updated_by`).

## Errores y bordes

- Sin migración 2.8: stripCol omite la columna; preview sin "por X"; resumen con
  "(equipo desconocido)". Nada se rompe.
- Ítems viejos sin `updated_by` → "(equipo desconocido)" solo si hay que mostrarlos.
- El toast se suprime si el resumen viene vacío (pull sin cambios entrantes).
- Nombre de equipo: cambiarlo NO re-firma nada retroactivamente (solo escrituras futuras).

## Testing

- Unit (vitest): sellado updatedBy en stampArray/tombstone; push/pull mapea updated_by;
  summary de syncNow (con/sin cambios; agrupación de devices; subes excluidos);
  preview.by/at por kind; merge conserva atribución del ganador.
- Runtime: app real + inserción REST simulando otra PC (`updated_by: 'PC-Prueba'`) →
  toast con "PC-Prueba", entrada en el panel, y "por PC-Prueba" en la vista previa.
