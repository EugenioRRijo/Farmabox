# Turnos + grilla de horario extensible — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax.

**Goal:** Que cada horario arranque mostrando solo la franja de su turno (Diurno sem 1-4 / Vespertino sem 5-10) y que la grilla se pueda extender de a 45 min sin tope (hasta la noche).

**Architecture:** Se centraliza la lógica de bloques horarios (hoy `TIME_SLOTS` fijo duplicado en 3 archivos) en `lib/timeSlots.ts` con etiquetas generadas por fórmula (bloque i = 7:00 AM + 45·i). `ScheduleBuilder` calcula un rango visible dinámico `[visMin, visMax]` = unión de (ventana por defecto del turno) ∪ (rango de los bloques existentes) ∪ (expansión del usuario), y renderiza esas filas en vez de 16 fijas. Botones "+45 min" mueven la expansión.

**Tech Stack:** React + TypeScript + Vite, vitest.

---

## Estructura de archivos

- Crear: `src/frontend/src/lib/timeSlots.ts` — helpers puros (etiqueta de bloque, turno, ventana, piso).
- Crear: `src/frontend/src/lib/timeSlots.test.ts` — tests vitest.
- Modificar: `src/frontend/src/components/schedule/ScheduleBuilder.tsx` — rango visible dinámico + controles +45 min + badge de turno.
- Modificar: `src/frontend/src/components/reports/ReportsPage.tsx` — usar `slotLabel` en `formatBlockTime`, quitar `TIME_SLOTS` local.
- Modificar: `src/frontend/src/components/reports/VisualCollisionGrid.tsx` — usar helpers, quitar `GRID_TIME_SLOTS`.
- Modificar: `src/frontend/src/services/PdfExportService.ts` — generar filas por rango usado con `slotLabel`.

---

## Task 1: Helpers puros de bloques horarios (`timeSlots.ts`)

**Files:**
- Create: `src/frontend/src/lib/timeSlots.ts`
- Test: `src/frontend/src/lib/timeSlots.test.ts`

- [x] **Step 1: Escribir el test que falla**

```ts
// src/frontend/src/lib/timeSlots.test.ts
import { describe, it, expect } from 'vitest';
import { slotLabel, turnoForSemester, defaultWindowForTurno, MIN_SLOT } from './timeSlots';

describe('slotLabel', () => {
  it('coincide con las etiquetas actuales de mañana/tarde', () => {
    expect(slotLabel(0)).toBe('7:00-7:45');
    expect(slotLabel(7)).toBe('12:15-1:00');
    expect(slotLabel(8)).toBe('1:00-1:45');
    expect(slotLabel(15)).toBe('6:15-7:00');
  });
  it('genera la noche (índices >= 16) sin tope', () => {
    expect(slotLabel(16)).toBe('7:00-7:45'); // 7:00 PM (el orden de filas desambigua)
    expect(slotLabel(17)).toBe('7:45-8:30'); // contiene las 8:00 PM
    expect(slotLabel(20)).toBe('10:00-10:45');
  });
});

describe('turnoForSemester', () => {
  it('1-4 Diurno, 5-10 Vespertino', () => {
    expect(turnoForSemester(1)).toBe('Diurno');
    expect(turnoForSemester(4)).toBe('Diurno');
    expect(turnoForSemester(5)).toBe('Vespertino');
    expect(turnoForSemester(10)).toBe('Vespertino');
  });
});

describe('defaultWindowForTurno', () => {
  it('Diurno 0-7 (7am-1pm), Vespertino 8-17 (1pm-8:30pm)', () => {
    expect(defaultWindowForTurno('Diurno')).toEqual({ start: 0, end: 7 });
    expect(defaultWindowForTurno('Vespertino')).toEqual({ start: 8, end: 17 });
  });
  it('MIN_SLOT es 0 (piso 7am)', () => {
    expect(MIN_SLOT).toBe(0);
  });
});
```

- [x] **Step 2: Correr el test y verificar que falla**

Run: `cd src/frontend && npx vitest run src/lib/timeSlots.test.ts`
Expected: FAIL — `timeSlots` no existe.

- [x] **Step 3: Implementar `timeSlots.ts`**

```ts
// src/frontend/src/lib/timeSlots.ts
/**
 * timeSlots — Bloques de la grilla de horario generados por fórmula.
 * Bloque i = 7:00 AM + 45·i min. Reemplaza las listas TIME_SLOTS fijas
 * (antes duplicadas en 3 componentes) y permite extender sin tope (noche).
 */
const DAY_START_MIN = 7 * 60; // 7:00 AM
const SLOT_MIN = 45;

export type Turno = 'Diurno' | 'Vespertino';

/** Minutos del día (desde medianoche) → "h:mm" en 12h sin AM/PM (como el formato actual). */
function fmt(totalMin: number): string {
  const h24 = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  const h12 = ((h24 + 11) % 12) + 1; // 0->12, 13->1, 19->7 ...
  return `${h12}:${m.toString().padStart(2, '0')}`;
}

/** Etiqueta "inicio-fin" del bloque i (i >= 0). Ej: slotLabel(0) === "7:00-7:45". */
export function slotLabel(i: number): string {
  const start = DAY_START_MIN + i * SLOT_MIN;
  return `${fmt(start)}-${fmt(start + SLOT_MIN)}`;
}

/** Turno derivado del semestre: 1-4 Diurno, 5-10 Vespertino. */
export function turnoForSemester(n: number): Turno {
  return n <= 4 ? 'Diurno' : 'Vespertino';
}

/** Ventana de bloques visible por defecto según el turno (índices inclusive). */
export function defaultWindowForTurno(t: Turno): { start: number; end: number } {
  return t === 'Diurno' ? { start: 0, end: 7 } : { start: 8, end: 17 };
}

/** Piso del día: no se permiten bloques antes de las 7:00 AM. */
export const MIN_SLOT = 0;
```

- [x] **Step 4: Correr el test y verificar que pasa**

Run: `cd src/frontend && npx vitest run src/lib/timeSlots.test.ts`
Expected: PASS (todos los `it`).

- [x] **Step 5: Commit**

```bash
git add src/frontend/src/lib/timeSlots.ts src/frontend/src/lib/timeSlots.test.ts
git commit -m "feat(horarios): helpers de bloques por formula (turno + ventana por defecto)"
```

---

## Task 2: ScheduleBuilder — rango visible dinámico + controles +45 min + badge

**Files:**
- Modify: `src/frontend/src/components/schedule/ScheduleBuilder.tsx`

Contexto actual: `const TIME_SLOTS = [...16 strings...]` (líneas ~22-27). `tableData` se
construye con `TIME_SLOTS.map(() => ...)` y filtra `b.startHour < TIME_SLOTS.length`. El
render hace `TIME_SLOTS.map((timeLabel, rowIndex) => <tr>)` (líneas ~650-665) usando
`tableData[rowIndex]`. Hay prop `semesterNumber`, `readOnly`.

- [x] **Step 1: Importar helpers y borrar el TIME_SLOTS fijo**

Reemplazar el bloque `const TIME_SLOTS = [ ... ];` (líneas ~22-27) por un import al inicio del archivo:

```ts
import { slotLabel, turnoForSemester, defaultWindowForTurno, MIN_SLOT } from '@/lib/timeSlots';
```

(Eliminar por completo la constante `TIME_SLOTS` local.)

- [x] **Step 2: Calcular turno, ventana y rango visible**

Dentro del componente, después de `blocksToDisplay` (línea ~155), agregar:

```ts
    const turno = turnoForSemester(semesterNumber);
    const win = defaultWindowForTurno(turno);
    // Expansión manual del usuario (índices absolutos). Arranca en la ventana del turno.
    const [expandMin, setExpandMin] = useState(win.start);
    const [expandMax, setExpandMax] = useState(win.end);
    // Al cambiar de semestre/turno, resetear la expansión a la ventana nueva.
    useEffect(() => {
        const w = defaultWindowForTurno(turnoForSemester(semesterNumber));
        setExpandMin(w.start);
        setExpandMax(w.end);
    }, [semesterNumber]);

    // Rango cubierto por los bloques existentes (para no ocultar ninguna clase).
    const blockRange = useMemo(() => {
        let lo = Infinity, hi = -Infinity;
        for (const b of blocksToDisplay) {
            if (b.startHour < lo) lo = b.startHour;
            const end = b.startHour + b.duration - 1;
            if (end > hi) hi = end;
        }
        return blocksToDisplay.length ? { lo, hi } : null;
    }, [blocksToDisplay]);

    const visMin = Math.max(MIN_SLOT, Math.min(win.start, expandMin, blockRange?.lo ?? win.start));
    const visMax = Math.max(win.end, expandMax, blockRange?.hi ?? win.end);
    const visibleRows = Array.from({ length: visMax - visMin + 1 }, (_, k) => visMin + k);
```

- [x] **Step 3: Ajustar `tableData` para cubrir hasta `visMax`**

En el `useMemo` de `tableData` (línea ~157), cambiar la inicialización y el clamp:

```ts
    const tableData = useMemo(() => {
        const rowCount = visMax + 1; // indexado por índice ABSOLUTO de bloque (0..visMax)
        const data: CellData[][] = Array.from({ length: rowCount }, () =>
            DAYS.map(() => ({ blocks: [] as ScheduleBlock[], rowspan: 1, isEmpty: true }))
        );
```

y en el filtro de `dayBlocks` reemplazar `b.startHour < TIME_SLOTS.length` por `b.startHour <= visMax`. Reemplazar también cualquier otro uso de `TIME_SLOTS.length` dentro de este memo por `rowCount`. Agregar `visMax` a las dependencias del `useMemo`.

- [x] **Step 4: Renderizar las filas visibles (no las 16 fijas)**

Reemplazar `{TIME_SLOTS.map((timeLabel, rowIndex) => (` (línea ~650) por:

```tsx
                                    {visibleRows.map((rowIndex) => (
                                        <tr key={rowIndex}>
                                            {/* Time Column */}
                                            <td
                                                className="px-2 py-3 text-center text-xs font-semibold text-black bg-white"
                                                style={{
                                                    border: '2px solid black',
                                                    borderRight: '2px solid black',
                                                    borderTop: rowIndex === visMin ? '2px solid black' : '1px solid black',
                                                    borderBottom: rowIndex === visMax ? '2px solid black' : '1px solid black',
                                                    width: '100px',
                                                    minHeight: '50px'
                                                }}
                                            >
                                                {slotLabel(rowIndex)}
                                            </td>
```

(El resto del cuerpo de la fila —el `DAYS.map` con `tableData[rowIndex][dayIndex]`— queda igual, ya que `rowIndex` sigue siendo el índice absoluto.)

- [x] **Step 5: Botones "+45 min" (solo editable) y badge de turno**

Badge: en la cabecera, junto a `<span>SEMESTRE {semesterNumber}° SECCIÓN "{section}"</span>` (línea ~599), agregar:

```tsx
                                            <span className={`ml-2 px-2 py-0.5 rounded-full text-[11px] font-bold ${turno === 'Diurno' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}`}>
                                                {turno}
                                            </span>
```

Botón "más temprano" (arriba de la tabla, solo si editable y se puede subir): justo antes de `<table ...>` (línea ~625), dentro del `div.overflow-x-auto`:

```tsx
                            {!readOnly && visMin > MIN_SLOT && (
                                <button
                                    onClick={() => setExpandMin(Math.max(MIN_SLOT, visMin - 1))}
                                    className="w-full py-1.5 text-xs font-medium text-brand-navy hover:bg-brand-pale/40 border-b border-dashed border-gray-300 transition-colors"
                                >
                                    + 45 min (más temprano)
                                </button>
                            )}
```

Botón "más tarde" (debajo de la tabla, sin tope): justo después de `</table>`:

```tsx
                            {!readOnly && (
                                <button
                                    onClick={() => setExpandMax(visMax + 1)}
                                    className="w-full py-1.5 text-xs font-medium text-brand-navy hover:bg-brand-pale/40 border-t border-dashed border-gray-300 transition-colors"
                                >
                                    + 45 min (más tarde)
                                </button>
                            )}
```

- [x] **Step 6: Verificar compilación**

Run: `cd src/frontend && npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0.

- [x] **Step 7: Commit**

```bash
git add src/frontend/src/components/schedule/ScheduleBuilder.tsx
git commit -m "feat(horarios): grilla con rango por turno + extender +45 min + badge de turno"
```

---

## Task 3: Quitar TIME_SLOTS duplicado en ReportsPage y VisualCollisionGrid

**Files:**
- Modify: `src/frontend/src/components/reports/ReportsPage.tsx`
- Modify: `src/frontend/src/components/reports/VisualCollisionGrid.tsx`

- [x] **Step 1: ReportsPage — usar `slotLabel` en `formatBlockTime`**

En `ReportsPage.tsx`: agregar `import { slotLabel } from '@/lib/timeSlots';`. Borrar la
constante local `const TIME_SLOTS = [...]` (línea ~172). Reemplazar `formatBlockTime`
(líneas ~184-193) por una versión basada en `slotLabel` (inicio del bloque `start`, fin del
bloque `start + duration - 1`):

```ts
  const formatBlockTime = (start: number, duration: number) => {
      const startPart = slotLabel(start).split('-')[0];
      const endPart = slotLabel(start + Math.max(1, duration) - 1).split('-')[1];
      return `${startPart} - ${endPart}`;
  };
```

- [x] **Step 2: VisualCollisionGrid — usar helpers, quitar `GRID_TIME_SLOTS`**

En `VisualCollisionGrid.tsx`: revisar el uso de `GRID_TIME_SLOTS` (línea ~13). Si solo se
usa para etiquetas/cantidad de filas fijas, reemplazar las etiquetas por `slotLabel(i)` y
mantener el rango fijo 0..15 que ya usa (esta vista de colisiones puede seguir con su rango
base; no necesita la extensión nocturna). Importar `slotLabel` y generar las etiquetas con
`Array.from({ length: 16 }, (_, i) => slotLabel(i))` donde antes usaba `GRID_TIME_SLOTS`.

- [x] **Step 3: Verificar compilación**

Run: `cd src/frontend && npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0.

- [x] **Step 4: Commit**

```bash
git add src/frontend/src/components/reports/ReportsPage.tsx src/frontend/src/components/reports/VisualCollisionGrid.tsx
git commit -m "refactor(horarios): centralizar etiquetas de bloque (quita TIME_SLOTS duplicado)"
```

---

## Task 4: PDF — filas por rango usado en vez de 16 fijas

**Files:**
- Modify: `src/frontend/src/services/PdfExportService.ts`

- [x] **Step 1: Leer la construcción de la tabla del horario en el PDF**

Run: `cd src/frontend && grep -n "TIME_SLOTS\|startHour\|buildSchedulePage\|rows" src/services/PdfExportService.ts`
Identificar dónde arma las filas de hora (probablemente con un arreglo fijo de 16).

- [x] **Step 2: Generar filas por rango usado con `slotLabel`**

Importar `import { slotLabel, turnoForSemester, defaultWindowForTurno } from '../lib/timeSlots';`.
En `buildSchedulePage`, calcular el rango a partir de los bloques del config:
`min = Math.min(win.start, ...startHours)`, `max = Math.max(win.end, ...startHour+duration-1)`
(con `win = defaultWindowForTurno(turnoForSemester(config.semesterNumber))`), y construir las
filas iterando `i` de `min` a `max` usando `slotLabel(i)` para la columna de hora, en lugar de
la lista fija. Así el PDF de un horario diurno no incluye filas de tarde/noche vacías y uno
con clase nocturna llega hasta esa hora.

- [x] **Step 3: Verificar compilación**

Run: `cd src/frontend && npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0.

- [x] **Step 4: Commit**

```bash
git add src/frontend/src/services/PdfExportService.ts
git commit -m "feat(pdf): exportar el horario por el rango de horas usado (turno/noche)"
```

---

## Self-Review (cobertura vs spec)

- Turno por semestre → Task 1 (`turnoForSemester`) + Task 2 (badge/ventana). ✓
- Ventana por defecto (Diurno 0-7, Vespertino 8-17) → Task 1 + Task 2. ✓
- Nunca ocultar clases existentes → Task 2 (`blockRange` en `visMin/visMax`). ✓
- Extender +45 min sin tope (abajo) y hasta 7am (arriba) → Task 2 (botones). ✓
- Centralizar TIME_SLOTS (3 archivos) → Tasks 1, 3. ✓
- PDF por rango usado → Task 4. ✓
- Visualización (solo lectura) → usa `ScheduleBuilder` con `readOnly` → hereda la ventana sin botones. ✓
- Compatibilidad de datos (índices 0-15 iguales) → garantizada por la fórmula de `slotLabel`. ✓

Nota: la grilla de colisiones (Task 3, Step 2) se mantiene en su rango base 0-15 a propósito
(análisis, no necesita noche); se documenta como decisión, no como omisión.
