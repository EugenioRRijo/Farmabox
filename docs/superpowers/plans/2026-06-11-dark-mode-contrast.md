# Arreglo de contraste del modo oscuro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans o subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Completar el retrofit de modo oscuro en `src/frontend/src/index.css` para que toda la app tenga contraste legible (AA) en tema oscuro.

**Architecture:** Todo en un archivo CSS, bajo el selector `.dark` (Tailwind `darkMode:'class'`). Se ajustan superficies a la paleta aprobada y se agregan remapeos para fondos de color, textos de color/marca y bordes de color que hoy no se remapean. Sin tocar componentes ni el modo claro.

**Tech Stack:** Tailwind CSS 3, Vite.

**Verificación:** el repo no testea CSS; se valida con `npm run build` + `npm run lint` y revisión visual pantalla por pantalla en tema oscuro.

---

## Task 1: Ajustar superficies a la paleta aprobada

**Files:** Modify `src/frontend/src/index.css` (bloque `.dark` existente, ~líneas 30-50)

- [ ] **Step 1: Reemplazar los valores de superficie existentes**

Cambiar los hex de las reglas existentes a la paleta aprobada:
- `.dark body` → `background-color:#0B1220; color:#E2E8F0`
- `.dark .bg-white` → `#161F2E`
- `.dark .bg-gray-50` → `#0B1220`
- `.dark .bg-gray-100` → `#161F2E`
- `.dark .bg-gray-200` → `#243044`
(Los remaps de `text-gray-*`, `border-gray-*`, `hover:bg-gray-*`, `divide-gray-*` y `shadow-*`
existentes se mantienen.)

- [ ] **Step 2: Commit**

```bash
git add fuente-recuperado/src/frontend/src/index.css
git commit -m "style(dark): alinear superficies a la paleta aprobada"
```

---

## Task 2: Remaps de color (fondos, textos, bordes, marca)

**Files:** Modify `src/frontend/src/index.css` (agregar al final del bloque de modo oscuro, antes de `/* Modo compacto */`)

- [ ] **Step 1: Agregar este bloque CSS completo**

```css
/* ── Modo oscuro: colores de marca, texto de color y fondos de color ───────── */
.dark .text-gray-400 { color: #64748b !important; }
.dark .placeholder-gray-400::placeholder,
.dark .placeholder\:text-gray-400::placeholder { color: #64748b !important; }

/* Marca */
.dark .text-brand-navy { color: #e2e8f0 !important; }
.dark .text-brand-blue { color: #93c5fd !important; }
.dark .text-brand-accent { color: #5aa9ff !important; }
.dark .bg-brand-navy { background-color: #13294d !important; }
.dark .bg-brand-pale { background-color: rgba(0,119,234,.16) !important; }
.dark .hover\:bg-brand-pale\/50:hover { background-color: rgba(0,119,234,.12) !important; }

/* Familias de color: fondos claros → tints oscuros; textos → tono claro (-300);
   bordes claros → tinte. Los fondos sólidos -600/-700/-900 (botones/badges fuertes)
   se dejan como están: ya contrastan con texto blanco. */
.dark .bg-blue-50{background-color:rgba(59,130,246,.12)!important}
.dark .bg-blue-100{background-color:rgba(59,130,246,.16)!important}
.dark .bg-blue-200{background-color:rgba(59,130,246,.25)!important}
.dark .text-blue-500,.dark .text-blue-600,.dark .text-blue-700,.dark .text-blue-800,.dark .text-blue-900{color:#93c5fd!important}
.dark .border-blue-200,.dark .border-blue-300{border-color:rgba(59,130,246,.32)!important}

.dark .bg-sky-50{background-color:rgba(14,165,233,.12)!important}
.dark .bg-sky-100{background-color:rgba(14,165,233,.16)!important}
.dark .bg-sky-200{background-color:rgba(14,165,233,.25)!important}
.dark .text-sky-500,.dark .text-sky-600,.dark .text-sky-700,.dark .text-sky-800,.dark .text-sky-900{color:#7dd3fc!important}
.dark .border-sky-200,.dark .border-sky-300{border-color:rgba(14,165,233,.32)!important}

.dark .bg-indigo-50{background-color:rgba(99,102,241,.12)!important}
.dark .bg-indigo-100{background-color:rgba(99,102,241,.16)!important}
.dark .bg-indigo-200{background-color:rgba(99,102,241,.25)!important}
.dark .text-indigo-500,.dark .text-indigo-600,.dark .text-indigo-700,.dark .text-indigo-800,.dark .text-indigo-900{color:#a5b4fc!important}
.dark .border-indigo-200,.dark .border-indigo-300{border-color:rgba(99,102,241,.32)!important}

.dark .bg-violet-50{background-color:rgba(139,92,246,.12)!important}
.dark .bg-violet-100{background-color:rgba(139,92,246,.16)!important}
.dark .bg-violet-200{background-color:rgba(139,92,246,.25)!important}
.dark .text-violet-500,.dark .text-violet-600,.dark .text-violet-700,.dark .text-violet-800,.dark .text-violet-900{color:#c4b5fd!important}
.dark .border-violet-200,.dark .border-violet-300{border-color:rgba(139,92,246,.32)!important}

.dark .bg-purple-50{background-color:rgba(168,85,247,.12)!important}
.dark .bg-purple-100{background-color:rgba(168,85,247,.16)!important}
.dark .bg-purple-200{background-color:rgba(168,85,247,.25)!important}
.dark .text-purple-500,.dark .text-purple-600,.dark .text-purple-700,.dark .text-purple-800,.dark .text-purple-900{color:#d8b4fe!important}
.dark .border-purple-200,.dark .border-purple-300,.dark .border-purple-400{border-color:rgba(168,85,247,.32)!important}

.dark .bg-fuchsia-50{background-color:rgba(217,70,239,.12)!important}
.dark .bg-fuchsia-100{background-color:rgba(217,70,239,.16)!important}
.dark .bg-fuchsia-200{background-color:rgba(217,70,239,.25)!important}
.dark .text-fuchsia-500,.dark .text-fuchsia-600,.dark .text-fuchsia-700,.dark .text-fuchsia-800,.dark .text-fuchsia-900{color:#f0abfc!important}
.dark .border-fuchsia-200,.dark .border-fuchsia-300{border-color:rgba(217,70,239,.32)!important}

.dark .bg-pink-50{background-color:rgba(236,72,153,.12)!important}
.dark .bg-pink-100{background-color:rgba(236,72,153,.16)!important}
.dark .bg-pink-200{background-color:rgba(236,72,153,.25)!important}
.dark .text-pink-500,.dark .text-pink-600,.dark .text-pink-700,.dark .text-pink-800,.dark .text-pink-900{color:#f9a8d4!important}
.dark .border-pink-200,.dark .border-pink-300{border-color:rgba(236,72,153,.32)!important}

.dark .bg-rose-50{background-color:rgba(244,63,94,.12)!important}
.dark .bg-rose-100{background-color:rgba(244,63,94,.16)!important}
.dark .bg-rose-200{background-color:rgba(244,63,94,.25)!important}
.dark .text-rose-500,.dark .text-rose-600,.dark .text-rose-700,.dark .text-rose-800,.dark .text-rose-900{color:#fda4af!important}
.dark .border-rose-200,.dark .border-rose-300{border-color:rgba(244,63,94,.32)!important}

.dark .bg-red-50{background-color:rgba(239,68,68,.12)!important}
.dark .bg-red-100{background-color:rgba(239,68,68,.16)!important}
.dark .bg-red-200{background-color:rgba(239,68,68,.25)!important}
.dark .text-red-400,.dark .text-red-500,.dark .text-red-600,.dark .text-red-700,.dark .text-red-800,.dark .text-red-900{color:#fca5a5!important}
.dark .border-red-200,.dark .border-red-300{border-color:rgba(239,68,68,.32)!important}

.dark .bg-orange-50{background-color:rgba(249,115,22,.12)!important}
.dark .bg-orange-100{background-color:rgba(249,115,22,.16)!important}
.dark .bg-orange-200{background-color:rgba(249,115,22,.25)!important}
.dark .text-orange-500,.dark .text-orange-600,.dark .text-orange-700,.dark .text-orange-800,.dark .text-orange-900{color:#fdba74!important}
.dark .border-orange-200,.dark .border-orange-300{border-color:rgba(249,115,22,.32)!important}

.dark .bg-amber-50{background-color:rgba(245,158,11,.12)!important}
.dark .bg-amber-100{background-color:rgba(245,158,11,.16)!important}
.dark .bg-amber-200{background-color:rgba(245,158,11,.25)!important}
.dark .text-amber-500,.dark .text-amber-600,.dark .text-amber-700,.dark .text-amber-800,.dark .text-amber-900{color:#fcd34d!important}
.dark .border-amber-200,.dark .border-amber-300{border-color:rgba(245,158,11,.32)!important}

.dark .bg-yellow-50{background-color:rgba(234,179,8,.12)!important}
.dark .bg-yellow-100{background-color:rgba(234,179,8,.16)!important}
.dark .bg-yellow-200{background-color:rgba(234,179,8,.25)!important}
.dark .text-yellow-500,.dark .text-yellow-600,.dark .text-yellow-700,.dark .text-yellow-800,.dark .text-yellow-900{color:#fde047!important}
.dark .border-yellow-200,.dark .border-yellow-300{border-color:rgba(234,179,8,.32)!important}

.dark .bg-lime-50{background-color:rgba(132,204,22,.12)!important}
.dark .bg-lime-100{background-color:rgba(132,204,22,.16)!important}
.dark .bg-lime-200{background-color:rgba(132,204,22,.25)!important}
.dark .text-lime-500,.dark .text-lime-600,.dark .text-lime-700,.dark .text-lime-800,.dark .text-lime-900{color:#bef264!important}
.dark .border-lime-200,.dark .border-lime-300{border-color:rgba(132,204,22,.32)!important}

.dark .bg-green-50{background-color:rgba(34,197,94,.12)!important}
.dark .bg-green-100{background-color:rgba(34,197,94,.16)!important}
.dark .bg-green-200{background-color:rgba(34,197,94,.25)!important}
.dark .text-green-500,.dark .text-green-600,.dark .text-green-700,.dark .text-green-800,.dark .text-green-900{color:#86efac!important}
.dark .border-green-200,.dark .border-green-300{border-color:rgba(34,197,94,.32)!important}

.dark .bg-emerald-50{background-color:rgba(16,185,129,.12)!important}
.dark .bg-emerald-100{background-color:rgba(16,185,129,.16)!important}
.dark .bg-emerald-200{background-color:rgba(16,185,129,.25)!important}
.dark .text-emerald-500,.dark .text-emerald-600,.dark .text-emerald-700,.dark .text-emerald-800,.dark .text-emerald-900{color:#6ee7b7!important}
.dark .border-emerald-200,.dark .border-emerald-300{border-color:rgba(16,185,129,.32)!important}

.dark .bg-teal-50{background-color:rgba(20,184,166,.12)!important}
.dark .bg-teal-100{background-color:rgba(20,184,166,.16)!important}
.dark .bg-teal-200{background-color:rgba(20,184,166,.25)!important}
.dark .text-teal-500,.dark .text-teal-600,.dark .text-teal-700,.dark .text-teal-800,.dark .text-teal-900{color:#5eead4!important}
.dark .border-teal-200,.dark .border-teal-300{border-color:rgba(20,184,166,.32)!important}

.dark .bg-cyan-50{background-color:rgba(6,182,212,.12)!important}
.dark .bg-cyan-100{background-color:rgba(6,182,212,.16)!important}
.dark .bg-cyan-200{background-color:rgba(6,182,212,.25)!important}
.dark .text-cyan-500,.dark .text-cyan-600,.dark .text-cyan-700,.dark .text-cyan-800,.dark .text-cyan-900{color:#67e8f9!important}
.dark .border-cyan-200,.dark .border-cyan-300{border-color:rgba(6,182,212,.32)!important}
```

- [ ] **Step 2: Commit**

```bash
git add fuente-recuperado/src/frontend/src/index.css
git commit -m "style(dark): remaps de fondos/textos/bordes de color y marca para contraste AA"
```

---

## Task 3: Verificación

**Files:** ninguno (verificación)

- [ ] **Step 1: Build + lint**

Run (en `src/frontend`): `npm run build` y `npm run lint`
Expected: ambos sin errores.

- [ ] **Step 2: Revisión visual en tema oscuro**

Levantar la app, activar Ajustes → Tema oscuro, y recorrer: Inicio, Visualización, Editor de
Horario (celdas de materia + modal de detalle), Reportes/Colisiones (resumen + grilla),
Profesores, Materias, Ajustes, Chat. Confirmar: textos legibles sobre su fondo; badges/tarjetas
de color con texto claro; inputs/selects con borde y texto visibles; botones distinguibles.
Verificar que el **modo claro no cambió**.

- [ ] **Step 3: Retoques finos**

Anotar cualquier elemento puntual aún flojo (p.ej. un `focus:ring-black`, una opacidad
`bg-*/NN` específica) y agregar su remap puntual bajo `.dark`.

---

## Notas
- Los fondos sólidos `bg-{c}-600/700/900` (botones/badges fuertes con texto blanco) se dejan: ya contrastan.
- `bg-brand-navy` se aclara a `#13294D` (trade-off CSS-only: no se separan botones de la barra lateral por selector).
