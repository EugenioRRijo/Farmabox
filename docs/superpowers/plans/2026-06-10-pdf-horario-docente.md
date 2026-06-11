# PDF "Horario de Clases Docentes" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar el PDF del horario individual del profesor para replicar el formato institucional "Horario de Clases Docentes", agregar un campo de aula de teoría por materia (con persistencia), y extender la grilla horaria del sistema hasta las 8 PM.

**Architecture:** Frontend React/TS (Vite). El PDF se genera con pdfMake en `PdfExportService.ts`. Las franjas horarias se unifican en una constante compartida usada por el editor, la grilla de colisiones y los PDFs. El aula de teoría es un campo nuevo `classroom` en `PensumSubject`, persistido por las dos rutas (web Supabase directo / Electron IPC). El período académico viene de `useSettings()`.

**Tech Stack:** React 18, TypeScript 5, Vite 5, pdfMake 0.3.5, Supabase, Electron.

**Verificación (el proyecto NO tiene test runner — se sigue el patrón del repo):** cada tarea se valida con `npx tsc --noEmit` + `npx eslint <archivos> --ext ts,tsx` (lint corre con `--max-warnings 0`) y, donde aplique, corriendo la app. Comandos desde `fuente-recuperado/src/frontend`. Commits frecuentes. Spec: `docs/superpowers/specs/2026-06-10-pdf-horario-docente-design.md`.

---

## Task 1: Constante compartida `TIME_SLOTS` (18 franjas hasta 8:30 PM)

**Files:**
- Create: `src/frontend/src/constants/timeSlots.ts`

- [ ] **Step 1: Crear el archivo de constante**

```ts
// Franjas horarias canónicas del horario semanal (45 min c/u), 7:00 AM → 8:30 PM.
// Fuente única de la verdad: usada por el editor de horarios, la grilla de
// colisiones y los PDFs. `startHour` de un ScheduleBlock es un índice en este array.
export const TIME_SLOTS = [
  '7:00-7:45', '7:45-8:30', '8:30-9:15', '9:15-10:00',
  '10:00-10:45', '10:45-11:30', '11:30-12:15', '12:15-1:00',
  '1:00-1:45', '1:45-2:30', '2:30-3:15', '3:15-4:00',
  '4:00-4:45', '4:45-5:30', '5:30-6:15', '6:15-7:00',
  '7:00-7:45', '7:45-8:30',
] as const;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (sin errores).

- [ ] **Step 3: Commit**

```bash
git add fuente-recuperado/src/frontend/src/constants/timeSlots.ts
git commit -m "feat(horario): constante compartida TIME_SLOTS (18 franjas hasta 8:30 PM)"
```

---

## Task 2: ScheduleBuilder usa la constante compartida (habilita agendar hasta 8 PM)

**Files:**
- Modify: `src/frontend/src/components/schedule/ScheduleBuilder.tsx` (líneas ~22-26)

- [ ] **Step 1: Reemplazar el array local por el import**

Borrar el bloque local `const TIME_SLOTS = [ ... ];` (líneas ~22-26, las 16 etiquetas) y agregar el import junto a los demás imports del tope del archivo:

```ts
import { TIME_SLOTS } from '../../constants/timeSlots';
```

El resto del componente ya usa `TIME_SLOTS.length` para clamping (líneas 166, 187, 203, 225, 808, 857), así que funciona con 18 sin más cambios.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/components/schedule/ScheduleBuilder.tsx --ext ts,tsx`
Expected: PASS.

- [ ] **Step 3: Verificación manual**

Correr la app (skill `run`), abrir un horario en el editor: la grilla muestra 18 filas hasta `7:45-8:30`. Arrastrar para crear un bloque en la franja `7:45-8:30` y confirmar que se coloca/guarda.

- [ ] **Step 4: Commit**

```bash
git add fuente-recuperado/src/frontend/src/components/schedule/ScheduleBuilder.tsx
git commit -m "feat(horario): editor usa TIME_SLOTS compartido (agenda hasta 8 PM)"
```

---

## Task 3: VisualCollisionGrid usa la constante compartida

**Files:**
- Modify: `src/frontend/src/components/reports/VisualCollisionGrid.tsx` (líneas ~13-18)

- [ ] **Step 1: Reemplazar `GRID_TIME_SLOTS` local por el import (con alias)**

Borrar el bloque local `const GRID_TIME_SLOTS = [ ... ];` (líneas ~13-18) y agregar:

```ts
import { TIME_SLOTS as GRID_TIME_SLOTS } from '../../constants/timeSlots';
```

Los usos existentes (`GRID_TIME_SLOTS.map`, `.length`) no cambian.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/components/reports/VisualCollisionGrid.tsx --ext ts,tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add fuente-recuperado/src/frontend/src/components/reports/VisualCollisionGrid.tsx
git commit -m "feat(horario): grilla de colisiones usa TIME_SLOTS compartido"
```

---

## Task 4: Agregar campo `classroom` (aula de teoría) a los tipos

**Files:**
- Modify: `src/shared/src/data/pensumData.ts` (interface `PensumSubject`, ~línea 16)
- Modify: `src/frontend/src/services/BackendService.ts` (interface `PensumSubject` espejo, ~línea 47)

- [ ] **Step 1: Tipo compartido**

En `src/shared/src/data/pensumData.ts`, dentro de `interface PensumSubject`, agregar después de `labNumber?: string;`:

```ts
  /** Aula de teoría (salón de clase). Distinto de labNumber, que es el salón de laboratorio. */
  classroom?: string;
```

- [ ] **Step 2: Tipo espejo en BackendService**

En `src/frontend/src/services/BackendService.ts`, en la `interface PensumSubject` local, agregar después de `labNumber?: string;`:

```ts
  classroom?: string;
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add fuente-recuperado/src/shared/src/data/pensumData.ts fuente-recuperado/src/frontend/src/services/BackendService.ts
git commit -m "feat(materias): campo classroom (aula de teoría) en PensumSubject"
```

---

## Task 5: Persistencia web del `classroom` (supabaseWeb)

**Files:**
- Modify: `src/frontend/src/services/supabaseWeb.ts` (mapeos de subjects: ~191, ~211, ~242)

- [ ] **Step 1: Lectura (row → PensumSubject)**

En el objeto que arma `sub: PensumSubject` (~línea 182-192), después de `labNumber: r.lab_number ?? undefined,` agregar:

```ts
      classroom: r.classroom ?? undefined,
```

- [ ] **Step 2: Escritura (`subjRow`)**

En `function subjRow(...)` (~línea 202-216), después de `lab_number: s.labNumber ?? null,` agregar:

```ts
    classroom: s.classroom ?? null,
```

- [ ] **Step 3: Patch en `updateSubject`**

En `updateSubject(...)` (~línea 230-247), después de `if (data.labNumber !== undefined) patch.lab_number = data.labNumber;` agregar:

```ts
  if (data.classroom !== undefined) patch.classroom = data.classroom;
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add fuente-recuperado/src/frontend/src/services/supabaseWeb.ts
git commit -m "feat(materias): persistir classroom en Supabase (ruta web)"
```

---

## Task 6: Persistencia Electron del `classroom` (SubjectService)

**Files:**
- Modify: `src/electron/src/services/SubjectService.ts` (`create` ~78-86, `bulkUpsert` ~45)

Nota: `update()` (línea 94-111) ya propaga `classroom` por el spread genérico `{ ...s, ...updateData }`, y `SSubject = PensumSubject`, así que no requiere cambios. Como `classroom` es una sola palabra en minúscula, no hay mismatch camel/snake al sincronizar a Supabase.

- [ ] **Step 1: Incluir classroom al crear**

En `create(...)`, en el objeto `newSubject` (~línea 78-86), agregar después de `prerequisites: data.prerequisites ?? [],`:

```ts
      ...(data.classroom ? { classroom: data.classroom } : {}),
```

- [ ] **Step 2: Incluir classroom en bulkUpsert**

En `bulkUpsert(...)`, en el objeto `sub` (~línea 37-46), después de `...(raw.labNumber ? { labNumber: String(raw.labNumber) } : {}),` agregar:

```ts
        ...(raw.classroom ? { classroom: String(raw.classroom) } : {}),
```

- [ ] **Step 3: Type-check (electron)**

Run (desde `fuente-recuperado`): `npx tsc --noEmit -p src/electron/tsconfig.json` (si existe; si no, `npm run build` del paquete electron). Si no hay tsconfig de electron, validar con el build general en Task 12.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add fuente-recuperado/src/electron/src/services/SubjectService.ts
git commit -m "feat(materias): persistir classroom en ruta Electron (create/bulkUpsert)"
```

---

## Task 7: UI para editar el aula de teoría en SubjectsPage

**Files:**
- Modify: `src/frontend/src/components/subjects/SubjectsPage.tsx` (varios puntos, espejo de `labNumber`)

Patrón: por cada sitio donde hoy se maneja `labNumber`, agregar el equivalente `classroom`. Sitios exactos:

- [ ] **Step 1: Estado `formData` (crear materia)**

En `useState({...})` de `formData` (~línea 115-125), agregar `classroom: '',` (junto a `labNumber: ''`). En el `setFormData({...})` de reset dentro de `handleSubmit` (~línea 160-170), agregar también `classroom: '',`.

- [ ] **Step 2: Input "Aula" en el formulario de crear**

Junto al campo "Salón de Laboratorio" (~línea 586-593, que usa `formData.labNumber`), agregar un campo análogo:

```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">Aula (teoría)</label>
  <input
    type="text"
    placeholder="Ej. 209"
    value={formData.classroom}
    onChange={e => setFormData({ ...formData, classroom: e.target.value })}
    className="w-full p-2 border rounded"
  />
</div>
```
(Replicar las clases CSS exactas del input de "Salón" vecino para mantener el estilo.)

- [ ] **Step 3: Estado `editForm` (edición inline)**

En el `useState` de `editForm` (~línea 40): `{ hoursTheory: 0, hoursLab: 0, labNumber: '' }` → agregar `classroom: ''`.
Al iniciar edición (~línea 96): agregar `classroom: subject.classroom || ''`.
Al guardar (~línea 104, objeto pasado a la actualización): agregar `classroom: editForm.classroom`.

- [ ] **Step 4: Input inline de aula (fila de edición)**

Junto al input inline de "Salón" (~línea 432-434, `editForm.labNumber`), agregar:

```tsx
<input type="text" className="w-16 p-1 border rounded text-xs ml-1" placeholder="Aula"
  value={editForm.classroom}
  onChange={e => setEditForm({ ...editForm, classroom: e.target.value })} />
```

- [ ] **Step 5: Componente hijo (tipo + input)**

En la interfaz de props del componente hijo (~línea 800-802) actualizar el tipo de `editForm` y `onUpdateEditForm` para incluir `classroom: string`. Y junto a su input de "Salón" (~línea 932, `editForm.labNumber`) agregar el input de `classroom` (mismo patrón que Step 4).

- [ ] **Step 6: Type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/components/subjects/SubjectsPage.tsx --ext ts,tsx`
Expected: PASS (sin variables sin usar).

- [ ] **Step 7: Verificación manual**

Correr la app: editar una materia, escribir un aula (ej. "209"), guardar, recargar → el aula persiste.

- [ ] **Step 8: Commit**

```bash
git add fuente-recuperado/src/frontend/src/components/subjects/SubjectsPage.tsx
git commit -m "feat(materias): UI para editar el aula de teoría (classroom)"
```

---

## Task 8: Helper puro — líneas de "Asignaturas" del profesor

**Files:**
- Modify: `src/frontend/src/services/PdfExportService.ts` (agregar función exportada)

- [ ] **Step 1: Agregar el helper**

Agregar el import de `Semester` a la línea de import del shared (`import { PensumSubject, Professor, Semester } from '../../../shared/src/index';`) y agregar esta función exportada:

```ts
/**
 * Construye las líneas "Asignaturas" del PDF del profesor a partir de sus bloques.
 * Agrupa por (materia, sección) y arma `{Materia} ({T|L|T-L}) ({semestre}°{sección})`.
 * Un bloque sin `type` cuenta como teoría (convención existente).
 */
export function buildProfessorSubjectLines(
  professorId: string,
  blocks: ScheduleBlock[],
  pensum: Semester[],
): string[] {
  const subjects = pensum.flatMap((s) => s.subjects);
  const semesterByCode = new Map<string, number>();
  pensum.forEach((s) => s.subjects.forEach((sub) => semesterByCode.set(sub.code, s.number)));

  const groups = new Map<string, { code: string; section: string; hasT: boolean; hasL: boolean }>();
  for (const b of blocks.filter((x) => x.professorId === professorId)) {
    const section = b.section || 'A';
    const key = `${b.subjectCode}|${section}`;
    const g = groups.get(key) ?? { code: b.subjectCode, section, hasT: false, hasL: false };
    if (b.type === 'LAB') g.hasL = true;
    else g.hasT = true;
    groups.set(key, g);
  }

  return [...groups.values()]
    .map((g) => {
      const name = subjects.find((s) => s.code === g.code)?.name ?? g.code;
      const sem = semesterByCode.get(g.code) ?? 0;
      const tipo = g.hasT && g.hasL ? 'T-L' : g.hasL ? 'L' : 'T';
      return { sem, name, text: `${name} (${tipo}) (${sem}°${g.section})` };
    })
    .sort((a, b) => a.sem - b.sem || a.name.localeCompare(b.name))
    .map((l) => l.text);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add fuente-recuperado/src/frontend/src/services/PdfExportService.ts
git commit -m "feat(pdf): helper buildProfessorSubjectLines (asignaturas T/L)"
```

---

## Task 9: Rediseñar el PDF del profesor (formato institucional vertical)

**Files:**
- Modify: `src/frontend/src/services/PdfExportService.ts`
  - Agregar `getPortraitDocDefinition()`.
  - Reemplazar `buildProfessorPage(...)` (~líneas 246-294).
  - Cambiar firmas de `generateProfessorSchedulePdf` y `generateAllProfessorsSchedulesPdf`.
  - Importar `TIME_SLOTS` y eliminar el array `timeSlots` local del PDF de profesor.

- [ ] **Step 1: Imports y definición de documento vertical**

Agregar al tope: `import { TIME_SLOTS } from '../constants/timeSlots';`

Agregar (junto a `getBaseDocDefinition`):

```ts
const getPortraitDocDefinition = (): TDocumentDefinitions => ({
  pageSize: 'LETTER',
  pageOrientation: 'portrait',
  pageMargins: [28, 28, 28, 28],
  header: (currentPage: number) => ({
    text: String(currentPage),
    alignment: 'right',
    margin: [0, 10, 18, 0],
    fontSize: 9,
    color: '#333333',
  }),
  styles: {
    docHeader: { fontSize: 11, bold: true },
    tableHeader: { fontSize: 8, bold: true, fillColor: '#f0f0f0' },
  },
  content: [],
});
```

- [ ] **Step 2: Reemplazar `buildProfessorPage` por la versión institucional**

Reemplazar toda la función `buildProfessorPage` actual por:

```ts
/** Una página (vertical) del horario institucional de UN profesor. */
const buildProfessorPage = (
  professor: Professor,
  blocks: ScheduleBlock[],
  pensum: Semester[],
  academicPeriod: string,
  logoDataUrl: string | null
): Content[] => {
  const subjects = pensum.flatMap((s) => s.subjects);
  const days = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];
  const myBlocks = blocks.filter((b) => b.professorId === professor.id);

  // Grilla: texto repetido por franja (sin combinar celdas).
  const body: TableCell[][] = [];
  body.push([
    { text: 'HORA', style: 'tableHeader', alignment: 'center' },
    ...days.map((d) => ({ text: d, style: 'tableHeader', alignment: 'center' as const })),
  ]);
  TIME_SLOTS.forEach((label, row) => {
    const r: TableCell[] = [{ text: label, alignment: 'center', fontSize: 7, bold: true }];
    for (let d = 0; d < 5; d++) {
      const block = myBlocks.find((b) => b.day === d && row >= b.startHour && row < b.startHour + b.duration);
      if (!block) {
        r.push({ text: '', fontSize: 7 });
        continue;
      }
      const subj = subjects.find((s) => s.code === block.subjectCode);
      const name = subj?.name ?? block.subjectCode;
      if (block.type === 'LAB') {
        r.push({ text: [{ text: 'Laboratorio\n' }, { text: name }], alignment: 'center', fontSize: 6 });
      } else {
        const aula = subj?.classroom ? `\nAula ${subj.classroom}` : '';
        r.push({ text: [{ text: name }, { text: aula, bold: true }], alignment: 'center', fontSize: 6 });
      }
    }
    body.push(r);
  });

  const totalHoras = myBlocks.reduce((sum, b) => sum + (b.duration || 0), 0);
  const asignaturas = buildProfessorSubjectLines(professor.id, blocks, pensum);

  const content: Content[] = [];
  if (logoDataUrl) content.push({ image: logoDataUrl, width: 90, alignment: 'center', margin: [0, 0, 0, 4] });
  content.push(
    { text: 'FACULTAD DE FARMACIA', style: 'docHeader', alignment: 'center' },
    { text: 'HORARIO DE CLASES DOCENTES', style: 'docHeader', alignment: 'center' },
    { text: `PERIODO ${academicPeriod}`, style: 'docHeader', alignment: 'center', margin: [0, 0, 0, 10] },
    {
      columns: [
        { text: `Docente: ${professor.fullName.toUpperCase()}`, bold: true, fontSize: 11 },
        { text: professor.cedula ? `C.I. ${professor.cedula}` : '', bold: true, fontSize: 11, alignment: 'right' },
      ],
      margin: [0, 0, 0, 2],
    },
    {
      columns: [
        { width: 'auto', text: 'Asignaturas:', bold: true, fontSize: 11 },
        { width: '*', text: asignaturas.join('\n'), bold: true, fontSize: 11, margin: [4, 0, 0, 0] },
      ],
      margin: [0, 0, 0, 10],
    },
    {
      table: { headerRows: 1, widths: [60, '*', '*', '*', '*', '*'], body },
      layout: {
        hLineWidth: () => 0.7,
        vLineWidth: () => 0.7,
        hLineColor: () => '#555555',
        vLineColor: () => '#555555',
        paddingLeft: () => 2,
        paddingRight: () => 2,
        paddingTop: () => 2,
        paddingBottom: () => 2,
      },
    },
    { text: `TOTAL: ${totalHoras} HORAS`, bold: true, fontSize: 11, margin: [0, 8, 0, 0] }
  );
  return content;
};
```

- [ ] **Step 3: Actualizar las dos funciones de export (firmas + uso vertical)**

Reemplazar `generateProfessorSchedulePdf` y `generateAllProfessorsSchedulesPdf` por:

```ts
/** Horario semanal de UN profesor (formato institucional, vertical). */
export const generateProfessorSchedulePdf = async (
  professor: Professor,
  blocks: ScheduleBlock[],
  pensum: Semester[],
  academicPeriod: string,
) => {
  const logoDataUrl = await loadLogo();
  const docDefinition = getPortraitDocDefinition();
  docDefinition.content = buildProfessorPage(professor, blocks, pensum, academicPeriod, logoDataUrl);
  const safe = professor.fullName.replace(/[^a-zA-Z0-9]+/g, '_');
  await pdfMake.createPdf(docDefinition).download(`Horario_${safe}.pdf`);
};

/** Horario individual de CADA profesor con bloques (una página por profesor). */
export const generateAllProfessorsSchedulesPdf = async (
  professors: Professor[],
  blocks: ScheduleBlock[],
  pensum: Semester[],
  academicPeriod: string,
  filename: string = 'Horarios_Profesores'
) => {
  const logoDataUrl = await loadLogo();
  const withBlocks = professors.filter((p) => blocks.some((b) => b.professorId === p.id));
  if (withBlocks.length === 0) throw new Error('Ningún profesor tiene clases asignadas.');

  const allContent: Content[] = [];
  withBlocks.forEach((prof, index) => {
    allContent.push(...buildProfessorPage(prof, blocks, pensum, academicPeriod, logoDataUrl));
    if (index < withBlocks.length - 1) allContent.push({ text: '', pageBreak: 'before' });
  });

  const docDefinition = getPortraitDocDefinition();
  docDefinition.content = allContent;
  const finalName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  await pdfMake.createPdf(docDefinition).download(finalName);
};
```

Eliminar el array `timeSlots` local que tenía la versión anterior del PDF de profesor (ya se usa `TIME_SLOTS`).

- [ ] **Step 4: Lint del archivo**

Run: `npx eslint src/services/PdfExportService.ts --ext ts,tsx`
Expected: PASS.

Nota: el `tsc --noEmit` global quedará en rojo a propósito hasta la Task 11, porque `ScheduleVisualization.tsx` aún llama las firmas viejas (3 args). Se valida con `tsc` al terminar la Task 11. No commitear un `tsc` verde aquí; el gate de tipos es la Task 11.

- [ ] **Step 5: Commit**

```bash
git add fuente-recuperado/src/frontend/src/services/PdfExportService.ts
git commit -m "feat(pdf): horario de profesor con formato institucional vertical"
```

---

## Task 10: Extender la grilla del PDF por semestre a 18 franjas

**Files:**
- Modify: `src/frontend/src/services/PdfExportService.ts` (`buildSchedulePage`, ~líneas 52-57 y el `forEach`)

- [ ] **Step 1: Usar `TIME_SLOTS` en `buildSchedulePage`**

En `buildSchedulePage`, borrar el array local `const timeSlots = [ ... ];` (14 etiquetas) y reemplazar el `timeSlots.forEach((timeLabel, rowIndex) => {` por `TIME_SLOTS.forEach((timeLabel, rowIndex) => {`. (Ya está importado `TIME_SLOTS` desde Task 9.)

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/services/PdfExportService.ts --ext ts,tsx`
Expected: PASS (sin `timeSlots` sin usar).

- [ ] **Step 3: Commit**

```bash
git add fuente-recuperado/src/frontend/src/services/PdfExportService.ts
git commit -m "feat(pdf): grilla por semestre hasta 8:30 PM (TIME_SLOTS compartido)"
```

---

## Task 11: Cablear el período académico en ScheduleVisualization

**Files:**
- Modify: `src/frontend/src/components/visualization/ScheduleVisualization.tsx`

- [ ] **Step 1: Importar y leer el período**

Agregar import: `import { useSettings } from '../../context/SettingsContext';`
En el cuerpo del componente, junto a `useAppData()`: `const { academicPeriod } = useSettings();`

- [ ] **Step 2: Actualizar las llamadas de export**

En `exportProfessor`, reemplazar la llamada por:
```ts
      await generateProfessorSchedulePdf(prof, scheduleBlocks, pensum, academicPeriod);
```
(eliminar la línea `const allSubjects = pensum.flatMap(...)` previa si queda sin uso).

En `exportEachProfessor`, reemplazar el cuerpo por:
```ts
      try {
          await generateAllProfessorsSchedulesPdf(professors, scheduleBlocks, pensum, academicPeriod);
      } catch {
          alert('Ningún profesor tiene clases asignadas para exportar.');
      }
```
(eliminar `const allSubjects = ...` si queda sin uso).

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/components/visualization/ScheduleVisualization.tsx --ext ts,tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add fuente-recuperado/src/frontend/src/components/visualization/ScheduleVisualization.tsx
git commit -m "feat(visualizacion): pasar período académico a los PDF de profesor"
```

---

## Task 12: Migración Supabase + verificación end-to-end

**Files:** (sin código nuevo)

- [ ] **Step 1: Agregar la columna en Supabase**

En el editor SQL de Supabase ejecutar:
```sql
alter table subjects add column if not exists classroom text;
```

- [ ] **Step 2: Build completo**

Run (desde `src/frontend`): `npm run build`
Expected: `tsc && vite build` termina sin errores (el warning de tamaño de chunk es preexistente).

- [ ] **Step 3: Lint global de los archivos tocados**

Run: `npx eslint src/services/PdfExportService.ts src/components/visualization/ScheduleVisualization.tsx src/components/subjects/SubjectsPage.tsx src/components/schedule/ScheduleBuilder.tsx src/components/reports/VisualCollisionGrid.tsx --ext ts,tsx`
Expected: 0 warnings.

- [ ] **Step 4: Verificación manual (app)**

1. Materias: editar una materia, asignarle un aula (ej. "209"); recargar → persiste.
2. Editor de horarios: agendar una clase en `7:45-8:30` (noche) → se guarda y se ve.
3. Visualización → filtrar un profesor → Exportar PDF → "Horario de {profesor}": verificar logo USM, `PERIODO {academicPeriod}`, `Docente:`/`C.I.`, `Asignaturas (T-L)(sem°sección)`, grilla con `Aula NNN` (teoría) y `Laboratorio` (lab), y `TOTAL: N HORAS`.
4. Menú "Cada profesor (individual)" → una hoja por profesor, con número de página.
5. Comparar contra la imagen de referencia del usuario.

- [ ] **Step 5: Commit (si hubo ajustes)**

```bash
git add -A
git commit -m "chore(horario): verificación e2e del PDF institucional y franjas 8 PM"
```

---

## Notas de cierre

- El PDF "por sección y semestre" mantiene su formato; solo extendió su grilla a 18 franjas.
- La barra de filtros / combobox / menú de export no cambian (solo reciben el período).
- Si la columna `classroom` no existe en Supabase, la edición de aula no persistirá (la app no se rompe; las celdas de teoría saldrán sin aula).
