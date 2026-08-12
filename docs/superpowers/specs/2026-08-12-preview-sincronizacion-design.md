# Vista previa de sincronización ("qué entra, qué se reemplaza") — Diseño

**Fecha:** 2026-08-12 · **Estado:** aprobado (enfoque A) · **Alcance:** solo .exe (Electron)

## Problema

Al darle "Sincronizar" el usuario no sabe qué va a pasar: qué cambios de otras PCs van a
entrar, cuáles de sus versiones se reemplazan y qué va a subir él. El diálogo actual de
confirmación es genérico (texto fijo).

## Decisiones tomadas (con el usuario)

1. **Preview en el botón + la sync automática sigue igual** (realtime + poll + push
   debounced). La ventana es transparencia, no una barrera: si se cancela, esos cambios
   igual entrarán solos más tarde por la sync automática.
2. **Resumen por categoría + detalle expandible** ítem por ítem con nombres legibles.
3. **Solo .exe.** En web el botón queda como hoy. (Las horas administrativas quedan fuera
   del preview: van por su propio canal instantáneo.)

## Arquitectura (enfoque A: dry-run en el motor)

```
SyncButton (click) ──IPC sync:preview──▶ SyncStorageBase.previewSync()
                                            │ pullRemote()   (NO guarda nada)
                                            │ buildSyncPreview(localRaw, remote, now)  ← puro, con tests
                                            ▼
   ventana: resumen + secciones ◀── SyncPreview (DTO serializable)
   [Aceptar] ──IPC sync:now (ya existe: flush + syncNow + data-changed)
   [Cancelar] → no toca nada
```

### DTO (contrato IPC, camelCase serializable)

```ts
type SyncPreviewKind = 'nuevo' | 'actualizado' | 'eliminado' | 'subes';
interface SyncPreviewItem { kind: SyncPreviewKind; label: string; detail?: string }
interface SyncPreviewSection {
  dataset: 'professors' | 'subjects' | 'academicLoad' | 'scheduleBlocks';
  title: string;               // "Profesores" | "Materias" | "Carga académica" | "Bloques de horario"
  items: SyncPreviewItem[];    // solo secciones con items van en el payload
}
interface SyncPreview {
  ok: boolean; online: boolean; at: string; // ISO
  sections: SyncPreviewSection[];
  totals: { nuevos: number; actualizados: number; eliminados: number; subes: number };
}
```

### Clasificador (espejo EXACTO de mergeRaw, en `electron/src/sync/preview.ts`)

Por clave (id / code / subjectCode), con `stampOf = max(updatedAt, deletedAt)` y
`sameContent` (stableStringify ignora sellos), replicando el empate de `mergeRaw`
(empate → gana local):

| Caso | Resultado |
|---|---|
| Solo remoto, vivo | `nuevo` |
| Solo remoto, tombstone | (nada) |
| Solo local, vivo | `subes` |
| Ambos, remoto más nuevo, remoto tombstone, local vivo | `eliminado` |
| Ambos, remoto más nuevo, ambos vivos, contenido difiere | `actualizado` (detail: "tu versión se reemplaza") |
| Ambos, remoto más nuevo, local tombstone, remoto vivo | `nuevo` (reaparece) |
| Ambos, contenido igual | (nada) |
| Ambos, local más nuevo o empate, contenido difiere | `subes` |

Labels legibles construidos en el main (que tiene todos los datasets):
- Bloques: `"{materia} — {Día} {hora} (Sem {n} {sección})"`, hora = fórmula 7:00 + 45·slot
  (misma de `frontend/lib/timeSlots.ts`). Materia por `subjectCode` buscando en el pensum
  fusionado (remoto ∪ local); si no está, se muestra el código.
- Profesores: `"{title} {fullName}"`.
- Materias: `"{name} (Sem {n})"`.
- Carga académica: `"Carga de {materia}"` con detail del cambio (profes que entran/salen).

### Cambios por archivo

| Archivo | Cambio |
|---|---|
| `electron/src/sync/preview.ts` (nuevo) | `buildSyncPreview()` puro + tipos DTO + tests en `preview.test.ts` |
| `electron/src/services/SyncStorageBase.ts` | `previewSync(): Promise<SyncPreview>` = pullRemote + buildSyncPreview; errores → `{ok:false}` |
| `electron/src/main.ts` | IPC `sync:preview` en `registerSyncIpc()` |
| `electron/src/preload.ts` | `sync.preview()` |
| `frontend/src/types/electron.d.ts` | tipar `sync.preview` |
| `frontend/src/services/BackendService.ts` | `previewSync(): Promise<SyncPreview \| null>` (web → null) + tipos espejo |
| `frontend/src/components/layout/SyncButton.tsx` | la ventana: loading → resumen (chips con totales) + secciones expandibles (`<details>`); "todo al día" si totales 0; fallback al texto genérico actual si preview null/`ok:false`. Aceptar = `runSync()` existente; Cancelar cierra. |

### Errores y bordes

- Sin red / remoto deshabilitado → preview `{ok:false, online:false}` → la ventana muestra
  el contenido genérico actual (y el sync:now ya maneja offline con su toast).
- Preview lanza (red intermitente) → igual que arriba; nunca bloquea el botón.
- Carrera preview→aceptar: aceptable por diseño (el sync real re-baja todo; la ventana es
  informativa del momento `at`).
- Datasets grandes: secciones colapsadas por defecto con conteo en el título.

### Testing

- `preview.test.ts` (vitest): los 8 casos del clasificador + labels de bloque (día/hora) +
  totals + "sin cambios" → sections vacías.
- Verificación runtime: app real levantada (dos estados: con cambios remotos simulados y
  sin cambios), ventana renderiza y Aceptar aplica.
