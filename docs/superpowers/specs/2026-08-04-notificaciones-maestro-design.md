# Notificaciones + Farmabox Maestro — Diseño

**Fecha:** 2026-08-04

## Problema / objetivo

El administrador (el "maestro") necesita enviar **mensajes personalizados** (avisos,
recordatorios, alertas) a **todas las PCs** donde está instalado Farmabox, sin depender de
publicar una versión nueva ni de tocar los datos de horarios.

La herramienta de envío debe ser **independiente del live**: no lee ni modifica horarios,
profesores ni carga académica, y no se ve afectada por lo que hagan las otras PCs.

## Alcance (acotado)

- Una **app de escritorio nueva y separada** ("Farmabox Maestro"), solo en la PC del
  administrador, para redactar/editar/eliminar mensajes.
- Las PCs con Farmabox **reciben** cada mensaje y lo muestran como **pop-up inmediato**
  encima de la app.
- El maestro puede **editar** y **eliminar** un mensaje ya enviado; el cambio se refleja en
  todas las PCs.
- **Sin** niveles de urgencia, **sin** acuse de lectura ("quién lo vio"), **sin** adjuntar
  imágenes/enlaces. Broadcast a todas las PCs (no hay segmentación por PC).

## Arquitectura general

Dos apps + una tabla nueva en el Supabase que ya existe:

```
┌──────────────────────┐        escribe/edita/borra        ┌─────────────────────┐
│  Farmabox Maestro    │ ────────────────────────────────▶ │  Supabase            │
│  (solo tu PC)        │                                    │  tabla notifications │
│  - redactar          │ ◀──────────────────────────────── │  (aparte de horarios)│
│  - historial         │        lee su propio historial     └─────────────────────┘
└──────────────────────┘                                              │
                                                       Realtime + poll │ (solo lectura)
                                                                       ▼
                                                         ┌──────────────────────────┐
                                                         │  Farmabox (demás PCs)     │
                                                         │  pop-up al llegar un      │
                                                         │  mensaje NO visto todavía │
                                                         └──────────────────────────┘
```

Se reutiliza el Supabase actual (misma URL/anon key), su Realtime y su keepalive ya
montados. La tabla `notifications` es independiente de los datos de horario, así que
Maestro nunca toca el live.

## Modelo de datos

Tabla nueva **`notifications`** (independiente de `schedule_blocks`, `professors`, etc.):

| columna | tipo | nota |
|---|---|---|
| id | text PK | id de cliente (no timestamp puro; ver "Reglas") |
| title | text | título del aviso |
| body | text | cuerpo del mensaje |
| created_at | timestamptz | cuándo se creó |
| updated_at | timestamptz | sellado newest-wins; **editar re-sella** |
| expires_at | timestamptz null | **opcional**: pasado ese momento el mensaje ya no aparece |
| deleted_at | timestamptz null | borrado lógico (tombstone) → desaparece de todas las PCs |

Migración (1 línea conceptual, la corre el usuario en el SQL Editor, como las otras):
`create table if not exists notifications (...)` con esas columnas. Se guarda en
`docs/migracion-2.5-notificaciones.sql`.

Tipo cliente compartido: `AppNotification { id, title, body, createdAt, updatedAt,
expiresAt?, deletedAt? }`.

**Degradación segura:** si la tabla no existe todavía (una PC recibe la app antes de que
se corra la migración), el receptor atrapa el error y simplemente no muestra nada; Farmabox
sigue funcionando igual.

## App Maestro (emisor)

App de escritorio nueva e independiente:

- **Redactar:** campos *título* + *cuerpo* + *(opcional)* fecha de vencimiento → botón
  **Enviar**. Al enviar, hace `upsert` en `notifications`.
- **Historial:** lista de los mensajes enviados (no borrados), cada uno con **Editar**
  (re-sella `updated_at`) y **Eliminar** (marca `deleted_at`, tombstone).
- Se conecta **solo** a Supabase (misma URL + anon key publicable). No carga ni muestra
  datos de horarios.
- Sin auto-update en v1 (solo está en tu PC; si cambia, se reinstala a mano).

## Farmabox (receptor)

Cambios dentro de la app existente (por eso requiere una versión nueva para desplegarse):

- Un módulo de notificaciones se **suscribe** a la tabla `notifications` (Realtime, con
  poll de respaldo — mismo patrón que el resto del sync) y trae los mensajes vigentes.
- **Pop-up:** al detectar un mensaje **no visto** por esta PC (nuevo o **editado**), muestra
  un modal encima de la app con *título* + *cuerpo* y un botón **"Entendido"**.
- **"Visto" local:** cada PC guarda en `localStorage` (`farmabox.seenNotifications`) los ids
  ya mostrados **junto con el `updated_at` visto**, para (a) no repetir el pop-up en cada
  sincronización y (b) volver a mostrarlo si el mensaje fue **editado** (su `updated_at`
  cambió respecto al visto).
- **Eliminar:** un mensaje con `deleted_at` desaparece; si su pop-up estaba abierto, se
  cierra solo.
- **Vencimiento:** los mensajes con `expires_at` en el pasado no se muestran.
- Si la app está minimizada/en segundo plano al llegar, se enfoca la ventana (best-effort);
  el pop-up igual queda visible al volver.

## Sincronización / reglas

- Mismo patrón newest-wins + tombstone que el resto del sistema: nunca "borra-todo-e-
  inserta"; siempre `upsert` por id estable. Los ids se generan por identidad estable, no
  por `Date.now()` puro (coherente con la regla de oro del proyecto para evitar duplicados).
- El receptor es **solo lectura** sobre `notifications`; el único que escribe es Maestro.
- Con el RLS de Supabase abierto (diferido por el usuario), "solo el maestro envía" se
  garantiza porque **solo el administrador tiene la app Maestro**, no por seguridad en la
  BD. Candado real (RLS/clave de servicio) = incremento aparte.

## Empaque y despliegue

- **Maestro:** nuevo target de electron-builder → `Farmabox-Maestro-Setup-<v>.exe`
  (`appId` y `productName` propios: `ve.edu.usm.farmabox.maestro`). Vive como workspace
  aparte en el monorepo (`src/maestro`) reutilizando el cliente de Supabase.
- **Farmabox receptor:** el código nuevo se publica en una **versión nueva** (ej. v2.3.16)
  por el pipeline de auto-update de siempre (`EugenioRRijo/Farmabox-releases`).

## Fuera de alcance (v1)

- Niveles de urgencia / prioridad (se eligió solo pop-up).
- Acuse de lectura o de entrega por PC.
- Adjuntos (imágenes, enlaces, archivos).
- Segmentar destinatarios (siempre es broadcast a todas las PCs).
- Seguridad/RLS real en la tabla (queda abierta como el resto; diferida por el usuario).
- Auto-update de la app Maestro.

## Extensión: Caja de sugerencias (canal inverso)

Complemento pedido por el usuario: además de que el maestro **envíe** avisos, cualquier PC
puede **enviar sugerencias** (reportar un error o pedir una mejora) que el maestro **lee en
la app Maestro**. Es el canal inverso, con la misma arquitectura (Supabase + tabla aparte).

**Modelo de datos** — tabla nueva `suggestions` (migración 2.6, la corre el usuario):

| columna | tipo | nota |
|---|---|---|
| id | text PK | `sug-<uuid>` |
| kind | text | `'error'` \| `'improvement'` |
| body | text | el mensaje |
| author | text null | nombre/PC opcional de quien envía |
| created_at | timestamptz | |
| updated_at | timestamptz | sellado newest-wins |
| resolved_at | timestamptz null | marcada como resuelta/leída |
| deleted_at | timestamptz null | tombstone |

**Farmabox (emisor de la sugerencia):** un botón flotante "Enviar sugerencia" abre un
formulario: **tipo** (Error / Mejora) + **mensaje** + **nombre (opcional)** → Enviar
(inserta en `suggestions`). Escritura directa a Supabase (RLS abierto).

**Maestro (lector):** una pestaña **"Sugerencias recibidas"** lista las no borradas
(más nuevas primero), muestra tipo/mensaje/autor/fecha y estado, con **"Marcar resuelta"**
(sella `resolved_at`) y **"Eliminar"** (tombstone). Las resueltas se ven atenuadas.

**Fuera de alcance:** respuestas/hilos, adjuntos, notificar al emisor, seguridad RLS real.

## Relacionado

- Patrón de sync/Realtime: `supabaseWeb.ts`, `CloudStorageService`, `AppDataContext`.
- Keepalive y tabla base de Supabase: memoria [[datos-compartidos-supabase]].
- Pipeline de release/instalador: memoria [[release-pipeline]].
- Arranque de la app empaquetada (desarmar `ELECTRON_RUN_AS_NODE`): [[launch-electron-app]].
