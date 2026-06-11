# Diseño: PDF "Horario de Clases Docentes" (horario individual del profesor)

Fecha: 2026-06-10
Estado: Aprobado (pendiente revisión final del usuario)

## Contexto y problema

La sección de Visualización exporta el horario individual de un profesor. El formato
actual (`generateProfessorSchedulePdf` en `src/frontend/src/services/PdfExportService.ts`)
es genérico y poco organizado. La coordinación de la Facultad de Farmacia usa un formato
institucional estándar ("HORARIO DE CLASES DOCENTES") que debe replicarse fielmente para
que el documento sea oficial y legible. El usuario aportó una imagen de referencia.

Objetivo: que el PDF individual del profesor (y la exportación "cada profesor (individual)")
reproduzcan ese formato institucional, en **una hoja vertical** por profesor, bien organizada.

## Fuera de alcance

- El **formato** del PDF "por sección y semestre" (`buildSchedulePage` / `generateAllSchedulesPdf`)
  **no cambia** (sí adopta la grilla extendida de 18 franjas, ver Parte 4, para no ocultar clases nocturnas).
- La barra de filtros, el combobox y el menú de exportación ya implementados **no cambian**
  (solo se les pasa un dato nuevo: el período académico).

## Referencia (elementos a reproducir)

Hoja vertical (carta), por profesor:

1. Número de página arriba a la derecha.
2. Logo USM centrado (ya disponible vía `loadLogo()` → `/logo_usm.png`).
3. Título centrado, tres líneas en negrita:
   - `FACULTAD DE FARMACIA`
   - `HORARIO DE CLASES DOCENTES`
   - `PERIODO {academicPeriod}`  (ej. "PERIODO 2026-01")
4. Línea de identificación: `Docente: {NOMBRE EN MAYÚSCULAS}` a la izquierda y
   `C.I. {cedula}` a la derecha (misma línea). Si no hay cédula, se omite el "C.I.".
5. `Asignaturas:` con una entrada por cada (materia, sección) que dicta el profesor,
   con formato `{Materia} ({T|L|T-L}) ({semestre}°{sección})`. Líneas de continuación
   alineadas bajo la primera asignatura.
6. Grilla semanal completa: columna `HORA` + `LUNES…VIERNES`, **18 franjas de 45 min**
   (7:00-7:45 … 7:45-8:30, cubriendo hasta las 8 PM — ver Parte 4). El texto
   **se repite en cada franja** de un bloque (sin combinar celdas / sin rowSpan),
   tal como la referencia.
   - Celda de **teoría**: línea 1 = nombre de la materia; línea 2 = `Aula {classroom}` en negrita.
   - Celda de **laboratorio**: línea 1 = `Laboratorio`; línea 2 = nombre de la materia.
7. `TOTAL: {N} HORAS` debajo de la grilla, alineado a la izquierda
   (N = suma de las `duration` de los bloques del profesor).

## Diseño

### Parte 1 — Nuevo campo: aula de teoría por materia

`labNumber` es el salón de **laboratorio**. Se agrega un campo separado para el aula de
**teoría**: `classroom?: string` en `PensumSubject`.

Puntos de edición:
- Tipo en `src/shared/src/data/pensumData.ts` (interface `PensumSubject`, junto a `labNumber`).
- Espejo del tipo en `src/frontend/src/services/BackendService.ts` (interface `PensumSubject` local).
- (Consistencia) `src/shared/src/logic/validators/IScheduleValidator.ts` si declara el sub-tipo de materia.
- UI de edición en `src/frontend/src/components/subjects/SubjectsPage.tsx`: agregar un input
  "Aula" junto al de "Salón" en los tres puntos donde hoy se edita `labNumber`
  (form de creación `formData`, `editForm` inline, y el `editForm` del componente hijo).
- Persistencia web en `src/frontend/src/services/supabaseWeb.ts`:
  - Lectura: mapear `classroom: r.classroom ?? undefined` (lectura de subjects).
  - Escritura: `subjRow()` → `classroom: s.classroom ?? null`.
  - Patch: en `updateSubject()` → `if (data.classroom !== undefined) patch.classroom = data.classroom;`
- Persistencia Electron: el handler IPC de subjects (`window.electronAPI.subjects.create/update`,
  proceso principal de Electron) debe pasar el campo `classroom` a la misma tabla `subjects`.
  Verificar y extender el mapeo del proceso principal si no es passthrough.
- **Base de datos (Supabase)** — columna nueva (requerido para que persista):
  ```sql
  alter table subjects add column if not exists classroom text;
  ```

### Parte 2 — PDF rediseñado (vertical)

En `src/frontend/src/services/PdfExportService.ts`:

- Definición de documento **vertical** para páginas de profesor (nueva
  `getPortraitDocDefinition()` o parámetro de orientación; `getBaseDocDefinition` sigue landscape
  para el PDF por semestre).
- Número de página vía `header: (currentPage) => ({ text: String(currentPage), alignment: 'right', ... })`.
- Reescribir `buildProfessorPage(professor, blocks, subjects, logoDataUrl, academicPeriod)` para
  producir el layout de la referencia:
  - Membrete (logo + 3 líneas de título con el período).
  - Identificación con columnas: `Docente: {fullName.toUpperCase()}` | `C.I. {cedula}`.
  - Bloque `Asignaturas:` (ver derivación abajo).
  - Grilla 18×5 **repitiendo** texto por franja (sin `covered`/`rowSpan`):
    para cada (día, fila) buscar bloque con `block.day === día` y
    `fila ∈ [startHour, startHour+duration)`. Usa la constante compartida `TIME_SLOTS` (Parte 4).
    - teoría → `[ {text: name}, {text: 'Aula '+classroom, bold:true} ]` (omitir línea si no hay `classroom`).
    - lab → `[ {text: 'Laboratorio'}, {text: name} ]`.
  - `TOTAL: {sumaDuraciones} HORAS` al final, alineado a la izquierda.

Derivación de **Asignaturas**:
- Tomar `myBlocks` del profesor; agrupar por `(subjectCode, section)`.
- Por grupo: `name` = de `subjects`; `semestre` = `block.semester` o, si falta, el semestre del
  pensum que contiene `subjectCode`; `sección` = `block.section || 'A'`; `tipo` = "T-L" si hay
  bloques THEORY y LAB, "T" si solo teoría, "L" si solo lab. Un bloque sin `type` cuenta
  como teoría (convención existente: `b.type === 'THEORY' || !b.type`).
- Formato por línea: `{name} ({tipo}) ({semestre}°{sección})`. Ordenar por semestre y nombre.

`generateProfessorSchedulePdf` y `generateAllProfessorsSchedulesPdf` usan
`buildProfessorPage` con la definición vertical; la segunda mantiene un salto de página por profesor.

### Parte 3 — Cableado del período académico

- `src/frontend/src/components/visualization/ScheduleVisualization.tsx`: obtener
  `academicPeriod` con `useSettings()` y pasarlo a `generateProfessorSchedulePdf(...)` y
  `generateAllProfessorsSchedulesPdf(...)` (firma extendida con `academicPeriod: string`).

### Parte 4 — Extensión de franjas horarias hasta las 8 PM (system-wide)

Hoy las franjas llegan a las 7 PM y están **duplicadas** en varios archivos (con rangos
inconsistentes: 14 vs 16). Se extienden a **18 franjas** (agregando `7:00-7:45` = 19:00–19:45
y `7:45-8:30` = 19:45–20:30, que cubre las 8 PM) y se **unifican en una constante compartida**.

- Crear `src/frontend/src/constants/timeSlots.ts` que exporte el array `TIME_SLOTS` (18 etiquetas
  `7:00-7:45` … `7:45-8:30`). (Junto a `constants/routes.ts`.)
- Reemplazar los arrays locales por el import compartido en:
  - `src/frontend/src/components/schedule/ScheduleBuilder.tsx` (`TIME_SLOTS`, línea 22) —
    es la fuente donde se **colocan** los bloques; con 18 franjas, `startHour` admite 0–17,
    permitiendo agendar hasta las 8 PM. Verificar los `Math.min(..., TIME_SLOTS.length)` (ya parametrizados).
  - `src/frontend/src/components/reports/VisualCollisionGrid.tsx` (`GRID_TIME_SLOTS`, línea 13).
  - `src/frontend/src/services/PdfExportService.ts`: el PDF de profesor y el PDF por semestre
    (`buildSchedulePage`, hoy 14 franjas) pasan a usar las 18 franjas compartidas, para no ocultar
    clases nocturnas.
- Revisar usos de la grilla de colisiones en `ReportsPage.tsx` y cualquier constante/`80px*filas`
  o `16` hardcodeado ligado al número de franjas; ajustar a `TIME_SLOTS.length`.
- Sin migración de datos: `startHour` sigue siendo un índice; los bloques existentes no cambian.

## Supuestos

- El aula de teoría es **por materia** (como `labNumber`), no por bloque ni por sección.
- "TOTAL: N HORAS" usa la suma de `duration` (horas académicas de 45 min), consistente con el
  resto de la app.
- Sin `classroom`, la celda de teoría muestra solo el nombre (sin línea de aula); el PDF no se rompe.
- El nombre del docente se muestra en mayúsculas, sin prefijo de título (como la referencia).

## Verificación

1. **Datos**: agregar la columna `classroom` en Supabase; en la app, editar una materia y
   asignarle un aula; confirmar que persiste tras recargar.
2. **Compilación**: `npm run build` (tsc + vite) y `npm run lint` sin warnings.
3. **PDF individual**: en Visualización, filtrar un profesor → Exportar PDF → "Horario de {profesor}":
   verificar membrete + período, "Docente"/"C.I.", "Asignaturas" con (T-L)(sem°sección),
   grilla con "Aula NNN" en teoría y "Laboratorio" en lab, y "TOTAL: N HORAS".
4. **PDF todos**: menú "Cada profesor (individual)" → una hoja por profesor con numeración de página.
5. **Franjas 8 PM**: en el creador de horarios, agendar una clase en la franja `7:45-8:30` (noche);
   confirmar que se guarda y aparece en la grilla, en la de colisiones y en los PDFs (profesor y semestre).
6. Comparar contra la imagen de referencia.
