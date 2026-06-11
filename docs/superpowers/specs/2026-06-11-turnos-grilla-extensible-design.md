# Diseño: Turnos (Diurno/Vespertino) + grilla de horario extensible

- **Fecha:** 2026-06-11
- **Estado:** Aprobado (pendiente de plan de implementación)

## Contexto

La grilla de horario (`ScheduleBuilder`) usa una lista **fija** de 16 bloques de 45 min
(7:00 AM – 7:00 PM), `TIME_SLOTS`, **duplicada en 3 archivos**:
`components/schedule/ScheduleBuilder.tsx`, `components/reports/ReportsPage.tsx`,
`components/reports/VisualCollisionGrid.tsx`. Cada bloque de horario guarda
`startHour` = índice en esa lista (0-15) y `duration` = cantidad de bloques.

Limitaciones actuales: (1) no hay concepto de turno; la grilla muestra siempre las 16
filas (7am-7pm) aunque un horario de mañana no use la tarde; (2) **no se puede pasar de las
7:00 PM**, así que no se cubren clases de noche.

## Objetivo

- Asignar un **turno por semestre**: 1°-4° = Diurno, 5°-10° = Vespertino.
- Que cada horario **arranque mostrando solo la franja de su turno** (interfaz limpia), sin
  ocultar ninguna clase ya existente.
- Permitir **extender la grilla de a 45 min, sin tope**, para cubrir cualquier turno del
  día (del diurno al nocturno), agregando los bloques que el usuario necesite.

## Requisitos (confirmados con el usuario)

1. **Turno por semestre:** `n ≤ 4 → Diurno`, `n ≥ 5 → Vespertino`.
2. **Franja visible por defecto:**
   - Diurno: 7:00 AM – 1:00 PM (índices 0-7).
   - Vespertino: 1:00 PM – 8:30 PM (índices 8-17; el bloque 17 = 7:45–8:30 PM contiene las
     8:00 PM, así la franja "llega a las 8" como pidió el usuario).
   - Más **cualquier fila que ya tenga un bloque** (nunca oculta una clase).
3. **Extender de a 45 min**, en la grilla editable: hacia abajo (más tarde → noche, **sin
   límite**) y hacia arriba (más temprano, hasta el **piso de 7:00 AM**).
4. Es **visual por turno** (el turno se deriva del semestre, no se guarda ni se edita).
5. Aplica a: grilla editable (Horarios), Visualización (solo lectura), **PDF**, y un badge
   "Diurno/Vespertino" en la cabecera del horario.

## No-objetivos (YAGNI)

- Turno editable/guardado por sección (se deriva del semestre).
- Bloques antes de las 7:00 AM (7:00 AM es el piso del día).
- Tres turnos como dato separado: "nocturno" se cubre extendiendo el vespertino, no es una
  categoría aparte.

## Diseño

### 1. Bloques por fórmula (centralizado)

Nuevo módulo `src/frontend/src/lib/timeSlots.ts` que reemplaza las 3 listas fijas:

- `slotLabel(i: number): string` → etiqueta del bloque `i`, generada como
  `7:00 AM + 45·i min`, en formato 12h sin AM/PM (consistente con el actual). Ej:
  `slotLabel(0) = "7:00-7:45"`, `slotLabel(8) = "1:00-1:45"`, `slotLabel(16) = "7:00-7:45"`
  (7:00 PM; el orden de filas desambigua, igual que hoy), `slotLabel(17) = "7:45-8:30"`.
- `turnoForSemester(n: number): 'Diurno' | 'Vespertino'` → `n <= 4 ? 'Diurno' : 'Vespertino'`.
- `defaultWindowForTurno(t): { start: number; end: number }` → Diurno `{0, 7}`,
  Vespertino `{8, 17}` (1:00 PM – 8:30 PM).
- `MIN_SLOT = 0` (piso 7:00 AM). Sin tope superior (cualquier `i ≥ 0` es válido).

Compatibilidad: los índices 0-15 mapean a las mismas horas que la lista vieja → **los
horarios ya creados no se rompen**; los índices ≥ 16 son la extensión (noche).

### 2. ScheduleBuilder: ventana visible dinámica

- `turno = turnoForSemester(semesterNumber)`; `defaultWindow = defaultWindowForTurno(turno)`.
- A partir de los bloques de esta grilla (semestre+sección):
  `blockMin = min(startHour)`, `blockMax = max(startHour + duration - 1)` (o vacío).
- Estado de expansión del usuario: `expandMin` (≥ 0) y `expandMax` (sin tope), inicial =
  `defaultWindow`.
- **Rango visible** `[visMin, visMax]` = unión de `defaultWindow`, `[blockMin, blockMax]` y
  `[expandMin, expandMax]`. Se renderizan las filas `visMin..visMax` (en vez de 0..15 fijo).
- **Controles "+45 min"** (solo en modo editable): arriba decrementa `expandMin` hasta 0;
  abajo incrementa `expandMax` sin límite. Cada clic agrega/revela una fila de 45 min.
- Al colocar una clase en una fila nueva, esa fila queda visible siempre (entra por
  `[blockMin, blockMax]`); si el usuario expandió pero no colocó nada, al recargar se
  colapsa al `defaultWindow`.

### 3. Etiquetas de hora consistentes

`formatBlockTime` (en `ReportsPage`) y cualquier render de horas pasa a usar `slotLabel` /
helpers de `timeSlots.ts`, así los índices de noche (≥ 16) se formatean bien. Se elimina la
duplicación de `TIME_SLOTS` en los 3 archivos.

### 4. PDF

`PdfExportService` genera la tabla del horario usando el **rango usado** (de `blockMin` a
`blockMax`, acotado por debajo al inicio del turno) en lugar de las 16 filas fijas, con
`slotLabel`. Un horario diurno sale sin filas de tarde/noche vacías; uno con clase nocturna
incluye hasta esa hora.

### 5. Badge de turno

En la cabecera de cada horario (ScheduleBuilder y Visualización) se muestra un badge
**"Diurno"** o **"Vespertino"** derivado del semestre.

## Casos borde

- Bloque más allá de las 8:00 PM (ej. índice 20) en un horario diurno → su fila se muestra
  igual (regla "nunca ocultar una clase").
- Horario diurno vacío → muestra solo 7:00 AM – 1:00 PM.
- Bloque cuya duración termina fuera de la ventana → `visMax` se ajusta para incluir el fin.
- Solo lectura (Visualización) → sin botones "+45 min"; muestra `defaultWindow ∪ bloques`.

## Compatibilidad de datos

`startHour`/`duration` no cambian de significado. Solo se agregan índices ≥ 16 (noche). Sin
migración.

## Pruebas

- Unitarias de `timeSlots.ts`: `slotLabel` para mañana/tarde/noche; `turnoForSemester`
  (1,4 → Diurno; 5,10 → Vespertino); `defaultWindowForTurno`; cálculo del rango visible
  (unión de ventana por defecto + rango de bloques + expansión) con casos: vacío, bloque en
  la franja, bloque fuera de la franja, expansión arriba/abajo.
- Manual: horario de 1° (arranca 7am-1pm), de 6° (arranca 1pm-8pm), agregar +45 min hasta
  pasar las 8pm y colocar una clase; verificar que persiste al recargar; revisar el PDF.

## Orden de entrega

1. `timeSlots.ts` + tests (helpers puros).
2. ScheduleBuilder: rango visible dinámico + controles "+45 min" + badge.
3. Reemplazar `TIME_SLOTS` duplicados (ReportsPage, VisualCollisionGrid) por los helpers.
4. PDF: rango usado en vez de 16 filas fijas.
