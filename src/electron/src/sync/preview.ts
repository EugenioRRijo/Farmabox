/**
 * preview.ts — Vista previa de sincronización ("qué entra, qué se reemplaza, qué subes").
 *
 * Lógica PURA (sin IO): compara el estado local contra el remoto SIN modificar
 * ninguno de los dos (dry-run) y produce un DTO serializable (SyncPreview) que
 * el renderer solo pinta. El clasificador es un espejo EXACTO de mergeRaw
 * (sync/merge.ts): newest-wins por sello (`stampOf`), empate → gana local, y los
 * tombstones (`deletedAt`) propagan borrados. Ítems sin cambio visible NO
 * generan item. Los logs NO participan del preview (ruido sin valor de lectura).
 *
 * Los labels legibles se construyen ACÁ (el main tiene todos los datasets para
 * resolver códigos → nombres); el renderer solo los muestra.
 */
import type { Stamped } from './merge';
import {
  sameContent,
  type RawDatasets,
  type SProfessor,
  type SSubject,
  type SBlock,
  type SLoadVal,
  type SSemester,
} from '../services/SyncStorageBase';

// ── DTO (contrato IPC, serializable) ─────────────────────────────────────────

export type SyncPreviewKind = 'nuevo' | 'actualizado' | 'eliminado' | 'subes';

export interface SyncPreviewItem {
  kind: SyncPreviewKind;
  label: string;
  detail?: string;
}

export interface SyncPreviewSection {
  dataset: 'professors' | 'subjects' | 'academicLoad' | 'scheduleBlocks';
  title: string; // "Profesores" | "Materias" | "Carga académica" | "Bloques de horario"
  items: SyncPreviewItem[]; // solo secciones con items van en el payload
}

export interface SyncPreview {
  ok: boolean;
  online: boolean;
  at: string; // ISO
  sections: SyncPreviewSection[];
  totals: { nuevos: number; actualizados: number; eliminados: number; subes: number };
}

// ── Clasificador (espejo de mergeRaw) ────────────────────────────────────────

/** Timestamp efectivo de un ítem (copiado de merge.ts, que lo mantiene privado). */
function stampOf(it: Stamped): string {
  const u = it.updatedAt ?? '';
  const d = it.deletedAt ?? '';
  return u > d ? u : d;
}

/** Par local/remoto de un mismo ítem (misma clave). Cualquiera puede faltar. */
interface Par<T> {
  local?: T;
  remote?: T;
}

/**
 * Clasifica un par local/remoto según la tabla del diseño. Devuelve `null`
 * cuando el merge no produce ningún cambio visible para el usuario.
 * La "diferencia de vida" (vivo vs tombstone) cuenta como diferencia aunque
 * `sameContent` ignore los sellos: borrar/resucitar SÍ es un cambio visible.
 */
function clasificarPar<T extends Stamped>(local?: T, remote?: T): SyncPreviewKind | null {
  if (!local && !remote) return null;
  if (!local) return remote!.deletedAt ? null : 'nuevo'; // solo remoto (tombstone → nada)
  if (!remote) return local.deletedAt ? null : 'subes'; // solo local (tombstone → nada)

  const localVivo = !local.deletedAt;
  const remotoVivo = !remote.deletedAt;
  // Empate → gana local (mismo criterio que mergeRaw: `>=` conserva lo local).
  const remotoMasNuevo = stampOf(remote) > stampOf(local);

  if (remotoMasNuevo) {
    if (!remotoVivo && localVivo) return 'eliminado'; // otra PC lo borró
    if (remotoVivo && !localVivo) return 'nuevo'; // reaparece (edición gana al borrado)
    if (remotoVivo && localVivo) return sameContent(local, remote) ? null : 'actualizado';
    return null; // ambos tombstone: nada visible
  }
  // Local más nuevo o empate → tu versión gana y se sube al remoto.
  if (!localVivo) return remotoVivo ? 'subes' : null; // subes un borrado
  if (!remotoVivo) return 'subes'; // resucitás el ítem en el remoto
  return sameContent(local, remote) ? null : 'subes';
}

/** Versión que se usa para el label: la remota si entra, la local si sube/se va. */
function versionVisible<T>(kind: SyncPreviewKind, par: Par<T>): T {
  if (kind === 'nuevo' || kind === 'actualizado') return (par.remote ?? par.local) as T;
  return (par.local ?? par.remote) as T;
}

/** Une dos colecciones por clave en pares { local, remote } (orden: remoto, luego solo-local). */
function paresPorClave<T>(local: T[], remote: T[], keyOf: (t: T) => string): Par<T>[] {
  const map = new Map<string, Par<T>>();
  const de = (k: string): Par<T> => {
    let p = map.get(k);
    if (!p) {
      p = {};
      map.set(k, p);
    }
    return p;
  };
  for (const it of remote) de(keyOf(it)).remote = it;
  for (const it of local) de(keyOf(it)).local = it;
  return [...map.values()];
}

// ── Labels legibles ──────────────────────────────────────────────────────────

const DETALLE_REEMPLAZO = 'tu versión se reemplaza por una más reciente de otra PC';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

function diaNombre(day: number): string {
  return DIAS[day] ?? `Día ${day}`;
}

// Misma fórmula que frontend/lib/timeSlots.ts: bloque i = 7:00 AM + 45·i min.
const INICIO_DIA_MIN = 7 * 60;
const SLOT_MIN = 45;

/** Minutos del día → "h:mm" en 12h sin AM/PM (h12 = ((h24+11)%12)+1). */
function fmtHora(totalMin: number): string {
  const h24 = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, '0')}`;
}

/** Rango "inicio-fin" de un bloque: slot 2 dur 1 → "8:30-9:15". */
function horaDeBloque(startSlot: number, durationSlots: number): string {
  const ini = INICIO_DIA_MIN + startSlot * SLOT_MIN;
  const fin = ini + Math.max(1, durationSlots || 1) * SLOT_MIN;
  return `${fmtHora(ini)}-${fmtHora(fin)}`;
}

interface MateriaIdx {
  name: string;
  sem: number;
}

/** Índice code → { name, sem }. Prioridad al pensum remoto (pisa al local). */
function indexarMaterias(remoto: SSemester[], local: SSemester[]): Map<string, MateriaIdx> {
  const map = new Map<string, MateriaIdx>();
  for (const sems of [local, remoto]) {
    for (const s of sems) {
      for (const sub of s.subjects) map.set(sub.code, { name: sub.name, sem: s.number });
    }
  }
  return map;
}

/** Índice id → "{title} {fullName}" buscando en professors remoto ∪ local. */
function indexarProfesores(remoto: SProfessor[], local: SProfessor[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const lista of [local, remoto]) {
    for (const p of lista) map.set(p.id, `${p.title} ${p.fullName}`);
  }
  return map;
}

/** Pensum (semestres) aplanado a materias con su número de semestre (`_sem`). */
function aplanarPensum(pensum: SSemester[]): SSubject[] {
  const out: SSubject[] = [];
  for (const s of pensum) for (const sub of s.subjects) out.push({ ...sub, _sem: s.number });
  return out;
}

function labelProfesor(p: SProfessor): string {
  return `${p.title} ${p.fullName}`;
}

function labelMateria(s: SSubject): string {
  return s._sem != null ? `${s.name} (Sem ${s._sem})` : s.name;
}

function labelBloque(b: SBlock, materias: Map<string, MateriaIdx>): string {
  const nombre = materias.get(b.subjectCode)?.name ?? b.subjectCode;
  const cuando = `${diaNombre(b.day)} ${horaDeBloque(b.startHour, b.duration)}`;
  const paren = [b.semester != null ? `Sem ${b.semester}` : null, b.section ?? null]
    .filter(Boolean)
    .join(' ');
  const lab = b.type === 'LAB' ? ' · Lab' : '';
  return `${nombre} — ${cuando}${paren ? ` (${paren})` : ''}${lab}`;
}

/** Valor de carga académica con su clave (subjectCode) para clasificar como array. */
type SLoadItem = SLoadVal & { code: string };

/**
 * Describe los cambios de profesores entre dos valores de carga: quién entra y
 * quién sale de teoría/lab, con nombres legibles si se pueden resolver los ids.
 */
function detalleCarga(
  antes: SLoadItem | undefined,
  despues: SLoadItem | undefined,
  profes: Map<string, string>,
): string | undefined {
  const cambios: string[] = [];
  for (const rol of ['theory', 'lab'] as const) {
    const etiqueta = rol === 'theory' ? 'teoría' : 'lab';
    const setAntes = new Set(antes?.[rol] ?? []);
    const setDespues = new Set(despues?.[rol] ?? []);
    for (const id of setDespues) {
      if (!setAntes.has(id)) cambios.push(`entra ${profes.get(id) ?? id} (${etiqueta})`);
    }
    for (const id of setAntes) {
      if (!setDespues.has(id)) cambios.push(`sale ${profes.get(id) ?? id} (${etiqueta})`);
    }
  }
  return cambios.length ? cambios.join(', ') : undefined;
}

// ── Armado del preview ───────────────────────────────────────────────────────

/** Clasifica todos los pares de un dataset y arma su sección (puede quedar vacía). */
function armarSeccion<T extends Stamped>(
  dataset: SyncPreviewSection['dataset'],
  title: string,
  pares: Par<T>[],
  labelOf: (t: T) => string,
  detailOf: (kind: SyncPreviewKind, par: Par<T>) => string | undefined,
): SyncPreviewSection {
  const items: SyncPreviewItem[] = [];
  for (const par of pares) {
    const kind = clasificarPar(par.local, par.remote);
    if (!kind) continue;
    const label = labelOf(versionVisible(kind, par));
    const detail = detailOf(kind, par);
    items.push(detail ? { kind, label, detail } : { kind, label });
  }
  return { dataset, title, items };
}

/** Detail por defecto: solo 'actualizado' lleva la explicación del reemplazo. */
function detalleGenerico(kind: SyncPreviewKind): string | undefined {
  return kind === 'actualizado' ? DETALLE_REEMPLAZO : undefined;
}

/**
 * Compara local vs remoto (SIN tocar ninguno) y arma el DTO de la vista previa.
 * `nowIso` es el instante del cálculo (va en `at`, la ventana lo muestra).
 */
export function buildSyncPreview(
  local: RawDatasets,
  remote: RawDatasets,
  nowIso: string,
): SyncPreview {
  const materias = indexarMaterias(remote.pensum, local.pensum);
  const profes = indexarProfesores(remote.professors, local.professors);

  // Profesores: "{title} {fullName}".
  const profesores = armarSeccion(
    'professors',
    'Profesores',
    paresPorClave(local.professors, remote.professors, (p) => p.id),
    labelProfesor,
    (kind) => detalleGenerico(kind),
  );

  // Materias: pensum aplanado por code, "{name} (Sem {n})".
  const materiasSec = armarSeccion(
    'subjects',
    'Materias',
    paresPorClave(aplanarPensum(local.pensum), aplanarPensum(remote.pensum), (s) => s.code),
    labelMateria,
    (kind) => detalleGenerico(kind),
  );

  // Carga académica: por subjectCode, con detail de quién entra/sale.
  const cargaLocal: SLoadItem[] = Object.entries(local.academicLoad).map(([code, v]) => ({
    ...v,
    code,
  }));
  const cargaRemota: SLoadItem[] = Object.entries(remote.academicLoad).map(([code, v]) => ({
    ...v,
    code,
  }));
  const carga = armarSeccion(
    'academicLoad',
    'Carga académica',
    paresPorClave(cargaLocal, cargaRemota, (c) => c.code),
    (c) => `Carga de ${materias.get(c.code)?.name ?? c.code}`,
    (kind, par) => {
      if (kind === 'eliminado') return undefined;
      // 'subes' describe lo que TU versión le cambia al remoto; el resto, lo que entra.
      const detalle =
        kind === 'subes'
          ? detalleCarga(par.remote, par.local, profes)
          : detalleCarga(par.local, par.remote, profes);
      return detalle ?? detalleGenerico(kind);
    },
  );

  // Bloques de horario: "{materia} — {Día} {hora} (Sem {n} {sección})".
  const bloques = armarSeccion(
    'scheduleBlocks',
    'Bloques de horario',
    paresPorClave(local.scheduleBlocks, remote.scheduleBlocks, (b) => b.id),
    (b) => labelBloque(b, materias),
    (kind, par) => {
      if (kind !== 'actualizado' || !par.local || !par.remote) return detalleGenerico(kind);
      const l = par.local;
      const r = par.remote;
      // Si el bloque se movió de día/hora, mostrar el traslado es más útil.
      if (l.day !== r.day || l.startHour !== r.startHour || l.duration !== r.duration) {
        const antes = `${diaNombre(l.day)} ${horaDeBloque(l.startHour, l.duration)}`;
        const ahora = `${diaNombre(r.day)} ${horaDeBloque(r.startHour, r.duration)}`;
        return `antes: ${antes} → ahora: ${ahora}`;
      }
      return DETALLE_REEMPLAZO;
    },
  );

  // Orden fijo de secciones; solo van las que tienen items.
  const sections = [profesores, materiasSec, carga, bloques].filter((s) => s.items.length > 0);

  const totals = { nuevos: 0, actualizados: 0, eliminados: 0, subes: 0 };
  for (const sec of sections) {
    for (const it of sec.items) {
      if (it.kind === 'nuevo') totals.nuevos++;
      else if (it.kind === 'actualizado') totals.actualizados++;
      else if (it.kind === 'eliminado') totals.eliminados++;
      else totals.subes++;
    }
  }

  return { ok: true, online: true, at: nowIso, sections, totals };
}
