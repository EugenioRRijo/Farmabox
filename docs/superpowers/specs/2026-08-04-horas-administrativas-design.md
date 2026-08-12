# Horas administrativas por profesor — Diseño

**Fecha:** 2026-08-04

## Problema / objetivo

Ciertos profesores tienen **cargas administrativas** (Jefe de Departamento, Servicio
Comunitario, Coordinador de Pasantías, Coordinación Comisión Técnica del Trabajo Especial
de Grado, etc.) que ocupan horas pero **no son clases**. Hoy el horario individual del
profesor solo refleja clases, así que su carga real queda incompleta.

Se necesita **agregar manualmente** esas horas administrativas a profesores puntuales, que
se vean en su **horario individual** (visualización + export), **distinguidas** de las
clases, y que **sumen al total** — sin afectar el horario de clases ni el de semestre.

## Alcance (acotado)

- **SOLO** en la visualización de horarios **por profesor** (individual) y su export.
  NO aparecen en los horarios por semestre ni en el editor de clases.
- Se agregan **a mano** (no automáticas), solo para los profesores que las tengan.
- **No chocan** con clases ni con otras admin (no hay validación de choque).

## Modelo de datos

Nueva tabla Supabase **`admin_hours`** (independiente de `schedule_blocks`):

| columna | tipo | nota |
|---|---|---|
| id | text PK | |
| professor_id | text | FK lógico a professors |
| role | text | rol/etiqueta (texto libre; la UI sugiere una lista) |
| day | int | 0=Lunes … 4=Viernes |
| start_hour | int | franja (misma escala que los bloques: 0 = 7:00) |
| duration | int | franjas de 45 min |
| updated_at | timestamptz | sellado newest-wins |
| deleted_at | timestamptz | borrado lógico (tombstone) |

Migración (1 línea, la corre el usuario, como las otras). Degradación segura: si la tabla
no existe, la app funciona igual y las admin quedan vacías (el cliente atrapa el error).

Tipo cliente `AdminHour { id, professorId, role, day, startHour, duration }`.

## Sincronización

Mismo patrón que `schedule_blocks`: CRUD por REST (web) e IPC (desktop) → tabla
`admin_hours`. Realtime + poll como el resto. Se carga en `AppDataContext` (`adminHours`).

## UI (visualizador por profesor)

Cuando se filtra por UN profesor en la visualización:
- Botón **"➕ Agregar horas administrativas"** fuera de la rejilla (junto a exportar).
- Formulario: **rol** (Combobox con sugerencias: Coordinación Comisión Técnica TEG ·
  Servicio Comunitario · Jefe de Departamento · Coordinador de Pasantías · *Otro…* libre)
  + **día** + **hora inicio** + **duración**.
- Lista de las admin del profesor con opción de **eliminar**.

## Presentación (pantalla + PDF)

Las admin del profesor se dibujan en su grilla individual **como bloques DISTINTOS**:
color aparte (ej. gris/ámbar) + etiqueta **"ADMINISTRATIVO"** + el rol. Se posicionan por
`day`/`start_hour`/`duration`, igual que las clases pero visualmente diferenciadas.

El **total** pasa a mostrar el desglose:
`TOTAL: 22 HORAS (18 de clase + 4 administrativas)`.

- `ProfessorScheduleGrid` (pantalla) y `buildProfessorPage` (PDF) reciben las admin del
  profesor y las pintan junto a las clases, distinguidas.
- El rango dinámico de filas (ya existe) considera también las admin para no cortarlas.
- El fit-to-one-page (ya existe) sigue garantizando 1 página.

## Fuera de alcance
- Validación de choques admin↔clase o admin↔admin.
- Catálogo cerrado de roles (se permite texto libre).
- Mostrarlas en horarios de semestre/sección.

## Relacionado
- `ProfessorScheduleGrid.tsx`, `PdfExportService.buildProfessorPage`, `lib/professorSchedule`
- Patrón de sync: `CloudStorageService`, `supabaseWeb`, `AppDataContext`
