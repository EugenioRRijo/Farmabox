# Diseño: Arreglar el contraste del modo oscuro

Fecha: 2026-06-11
Estado: Aprobado (pendiente revisión final del usuario)

## Contexto y problema

El modo oscuro usa un **"retrofit global"** en `src/frontend/src/index.css`: con `darkMode: 'class'`
(Tailwind) y un toggle que agrega `.dark` a `<html>` (`SettingsContext`), en lugar de variantes
`dark:` por componente se **remapean utilidades comunes** bajo `.dark` con `!important`
(ej. `.dark .bg-white → #1e293b`, `.dark .text-gray-900 → #f1f5f9`).

Ese remapeo está **incompleto**, y de ahí el mal contraste:
- **Fondos de color claros** (`bg-blue-50`, `bg-*-100`, `bg-*-200`) no se remapean → quedan islas
  claras (badges, tarjetas de estado, filas de colisión, celdas de materia del horario).
- **Textos de color y de marca** (`text-brand-navy` ≈ negro, `text-brand-accent`, `text-*-600/700/800/900`)
  no se remapean → quedan **oscuros sobre superficies oscurecidas** = ilegibles.

Hay ~535 usos de colores fijos en ~32 archivos, por lo que migrar a `dark:` por componente sería
enorme. Se opta por **completar el retrofit** (un solo archivo), que arregla toda la app a la vez.

## Objetivo y paleta aprobada

Modo oscuro legible (objetivo de contraste **WCAG AA**) en todas las pantallas, con esta paleta:

| Rol | Color |
|---|---|
| Fondo app | `#0B1220` |
| Tarjeta / superficie (`bg-white`, `bg-gray-100`) | `#161F2E` |
| Elevado (`bg-gray-200`) | `#243044` |
| Texto primario | `#F1F5F9` |
| Texto secundario / muted | `#94A3B8` |
| Acento (fondo) | `#0077EA` |
| Acento (texto/enlace) | `#5AA9FF` |
| Borde base | `#2A3548` / `#334155` |

## Fuera de alcance

- No se migra a variantes `dark:` por componente ni a tokens CSS-variable (mejora futura).
- No se rediseña ninguna pantalla; solo cambia el color en modo oscuro.
- El PDF y su lógica no se tocan (el PDF es siempre claro).

## Diseño

Todo el cambio vive en `src/frontend/src/index.css`, ampliando el bloque `.dark`. Grupos:

### 1. Superficies (ajustar las existentes a la paleta)
- `.dark body` y `.dark .bg-gray-50` → `#0B1220`.
- `.dark .bg-white`, `.dark .bg-gray-100` → `#161F2E`.
- `.dark .bg-gray-200` → `#243044`.
- (Mantener los remaps de texto gris existentes: `text-gray-900→#F1F5F9`, `…800→#E2E8F0`,
  `…700→#CBD5E1`, `…600/500→#94A3B8`; agregar `text-gray-400→#64748B` y placeholders.)

### 2. Textos de color y de marca → tonos claros legibles
- Marca: `.dark .text-brand-navy → #E2E8F0`; `.dark .text-brand-accent → #5AA9FF`;
  `.dark .text-brand-blue → #93C5FD`.
- Por cada familia de color usada, remapear `text-{c}-600/700/800/900` al tono **`-300`** de
  esa familia (claro). Ejemplos:
  - `text-blue-600/700/800/900 → #93C5FD` (blue-300)
  - `text-red-700/800/900 → #FCA5A5` (red-300)
  - `text-green-700/800 → #86EFAC` (green-300)
  - `text-amber-800 / text-yellow-800 → #FCD34D`
  - `text-purple-700/800 → #D8B4FE`, `text-orange-800 → #FDBA74`, etc.
- Placeholder: `.dark .placeholder-gray-400::placeholder → #64748B`.

### 3. Fondos de color → tints oscuros translúcidos
- `bg-{c}-50 → rgba(color, .12)`, `bg-{c}-100 → rgba(color, .16)`, `bg-{c}-200 → rgba(color, .25)`
  usando el RGB base de la familia (ej. blue `59,130,246`; red `239,68,68`; green `34,197,94`;
  amber `245,158,11`; purple `168,85,247`; orange `249,115,22`; teal `20,184,166`; indigo
  `99,102,241`; etc.).
- Esto cubre badges (`Badge`), tarjetas de estado (`StatusCard`), filas del Resumen de Colisiones
  (`bg-red-50/orange-50/purple-50/blue-50` + contadores `bg-*-200`) y las celdas de materia del
  horario (`bg-{c}-100 text-{c}-900 border-{c}-300`, ver `COLORS` en `ScheduleBuilder`).

### 4. Bordes de color
- `border-{c}-200/300 → rgba(color, .30)` (o el tono `-800` oscuro). Mantener los `border-gray-*`
  existentes.

### 5. Botones / superficies de marca
- `.dark .bg-brand-navy → #13294D` (navy aclarado) para que los botones primarios se distingan
  del fondo `#0B1220` y la barra lateral conserve identidad.
- **Trade-off (CSS-only):** no se pueden separar por selector los botones `bg-brand-navy` de la
  barra lateral, por eso se aclara el navy en lugar de usar el acento puro. Cambiar botones a
  acento sería un retoque fino por componente, fuera de este alcance.

### Familias a cubrir
Confirmar con grep las familias realmente usadas y generar los remaps para todas. Candidatas
observadas: `blue, gray, slate, red, green, emerald, amber, yellow, orange, indigo, teal, cyan,
rose, purple, violet, fuchsia, lime`. Para cada una: `bg-50/100/200`, `text-600/700/800/900`,
`border-200/300`.

## Verificación

1. `npm run build` (tsc + vite) y `npm run lint` sin errores (es solo CSS, pero se valida que
   nada se rompa).
2. App en vivo con **tema oscuro** activado (Ajustes → Tema oscuro). Revisar cada pantalla:
   Inicio, Visualización de Horarios, Editor de Horario (incl. celdas de materia y modal de
   detalle), Reportes/Colisiones (resumen + grilla), Profesores, Materias, Ajustes, Chat.
3. En cada una confirmar: títulos/textos legibles sobre su fondo; badges y tarjetas de color con
   texto claro; inputs/selects con borde y texto visibles; botones distinguibles. Objetivo AA
   (texto normal ≥ 4.5:1, texto grande ≥ 3:1).
4. Verificar que el **modo claro no cambió** (los remaps viven solo bajo `.dark`).
