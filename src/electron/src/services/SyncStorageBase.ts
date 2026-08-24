/**
 * SyncStorageBase — Almacenamiento offline-first con sincronización a un "remoto".
 *
 * Concentra TODO lo común a los backends sincronizados:
 *   - Lecturas/escrituras inmediatas a local (cero latencia, funciona sin red).
 *   - Cada save SELLA los ítems (updatedAt / deletedAt), guarda local y AGENDA un
 *     guardado al remoto (debounced). Ver pushDataOnly()/flush().
 *   - RECIBIR (pull + merge por fila, newest-wins) es automático al abrir: syncNow().
 *
 * El "remoto" es abstracto: una subclase define cómo leer/escribir (pullRemote /
 * pushRemote). Hoy hay dos: Supabase (CloudStorageService) y una carpeta compartida
 * de red local (SharedFolderStorageService). El merge por ítem (sync/merge.ts, con
 * tests) evita perder datos al combinar lo de varias PCs.
 */
import os from 'os';
import log from 'electron-log';
import { mergeRaw, mergeMaps, stampOf, type Stamped } from '../sync/merge';
import {
  buildSyncPreview,
  summarizeIncoming,
  type SyncPreview,
  type RemoteChangeSummary,
} from '../sync/preview';
import type { IStorageService } from './IStorageService';
import type { Professor, Semester, PensumSubject } from '@scheduler/shared';
import type { AcademicLoad, ScheduleBlockData, LogEntry } from '../types';

export type SProfessor = Professor & Stamped;
export type SBlock = ScheduleBlockData & Stamped;
export type SLog = LogEntry & Stamped;
export type SSubject = PensumSubject & Stamped & { _sem?: number };
export type SLoadVal = AcademicLoad[string] & Stamped;
export type SSemester = { number: number; subjects: SSubject[] };

export interface RawDatasets {
  professors: SProfessor[];
  pensum: SSemester[];
  scheduleBlocks: SBlock[];
  academicLoad: Record<string, SLoadVal>;
  logs: SLog[];
}

/** JSON estable (orden de claves) ignorando la metadata de sync.
 *  Las claves con valor `undefined` se omiten (igual que JSON.stringify): el
 *  estado local viene de JSON en disco (sin esas claves) y el mapeo del pull
 *  las materializa como `undefined` explícito (`aula ?? undefined`, etc.);
 *  si contaran como `null`, sameContent daría falso para contenido idéntico
 *  (incidente: "subes" fantasma en el preview con sellos empatados).
 *  `updatedBy` también es metadata de sync: si contara como contenido, una base
 *  sin la columna updated_by (migración 2.8 pendiente) haría que TODO pareciera
 *  distinto tras cada pull (mismo incidente de "subes" fantasma). */
export function stableStringify(o: unknown): string {
  if (o === null || typeof o !== 'object') return JSON.stringify(o) ?? 'null';
  if (Array.isArray(o)) return '[' + o.map(stableStringify).join(',') + ']';
  const obj = o as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter(
      (k) => k !== 'updatedAt' && k !== 'deletedAt' && k !== 'updatedBy' && obj[k] !== undefined,
    )
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}
export function sameContent(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

export abstract class SyncStorageBase implements IStorageService {
  private autoPushTimer: ReturnType<typeof setTimeout> | null = null;
  /** Notifica al proceso main cuando un pull-merge (antes de subir) trajo cambios,
   *  para que avise al renderer (data-changed) y la UI no quede desactualizada.
   *  Recibe el resumen de lo entrante (si se pudo calcular) para el aviso en vivo. */
  private onMerged: ((summary?: RemoteChangeSummary) => void) | null = null;
  /** Nombre amigable con el que esta PC firma sus escrituras (`updatedBy`).
   *  main.ts lo cablea con el nombre configurado; fallback: hostname. */
  private deviceName: string = os.hostname();

  /** Claves VISTAS por la UI, por dataset: las que devolvió el último loadX()
   *  (o el estado que dejó el último save). Los saves del .exe son full-set
   *  (el renderer manda TODO su snapshot) y tombstonean lo que falte; pero si
   *  un ítem llegó por merge en segundo plano (realtime) y la UI aún no
   *  recargó (reload pospuesto por typing/edición), su ausencia del snapshot
   *  NO es un borrado del usuario: tombstonearlo con sello fresco lo borraría
   *  en toda la flota. Patrón "solo tombstonea lo visto" (como el camino web):
   *  solo se tombstonea lo que la UI realmente vio. `null` = aún sin
   *  información (comportamiento clásico: todo se considera visto). */
  private vistos: {
    professors: Set<string> | null;
    blocks: Set<string> | null;
    load: Set<string> | null;
    pensum: Set<string> | null;
  } = { professors: null, blocks: null, load: null, pensum: null };

  constructor(protected readonly local: IStorageService) {}

  /** Lo cablea main.ts para reenviar 'data-changed' al renderer. */
  setOnMerged(cb: ((summary?: RemoteChangeSummary) => void) | null): void {
    this.onMerged = cb;
  }

  /** Cambia el nombre con el que se firman las escrituras FUTURAS (no re-firma
   *  nada retroactivamente). Vacío → vuelve al hostname. */
  setDeviceName(name: string): void {
    this.deviceName = name.trim() || os.hostname();
  }

  // ── Realtime (#7): suscripción a cambios remotos casi instantánea ─────────
  /** Suscribe a cambios remotos en tiempo real. Por defecto no-op; los backends que
   *  lo soporten (nube) lo sobreescriben. `onChange` se llama cuando otra PC modifica
   *  datos. */
  startRealtime(onChange: () => void): void {
    void onChange; // no-op en backends sin realtime (p. ej. carpeta compartida)
  }
  /** Cancela la suscripción realtime (si la hay). */
  stopRealtime(): void {
    /* no-op por defecto */
  }

  // ── Contrato del transporte (lo define cada backend) ─────────────────────
  /** ¿El remoto está disponible/configurado ahora? */
  abstract isRemoteEnabled(): boolean;
  /** Lee TODO el estado del remoto (sellado). Lanza si falla. */
  protected abstract pullRemote(): Promise<RawDatasets>;
  /** Escribe el estado local (sellado, con tombstones) al remoto. Lanza si falla. */
  protected abstract pushRemote(raw: RawDatasets): Promise<void>;

  getDataDir(): string {
    return this.local.getDataDir();
  }
  protected now(): string {
    return new Date().toISOString();
  }

  // ── Normalización de arrays de vínculo (orden sin semántica) ─────────────
  /** `professor.subjects` y `subject.professors` son SETS de vínculo: el orden
   *  no significa nada, pero `stableStringify` NO ordena arrays y el pull los
   *  reconstruye en orden de tabla mientras lo local conserva el orden de
   *  inserción → `sameContent` daba falso para el mismo set y en empate de
   *  sello el preview marcaba "subes" fantasma eternos. Se ordenan en los
   *  puntos de persistencia (aquí) y de pull (cada backend), así local y
   *  remoto comparan igual. Si el campo falta se deja tal cual (materializar
   *  `[]` también cambiaría el contenido). */
  protected normProfessor(p: SProfessor): SProfessor {
    return p.subjects ? { ...p, subjects: [...p.subjects].sort() } : p;
  }
  protected normSubject(s: SSubject): SSubject {
    return s.professors ? { ...s, professors: [...s.professors].sort() } : s;
  }

  // ── Sellado de ítems ─────────────────────────────────────────────────────
  /** Sella un array con clave: nuevos/cambiados → updatedAt=now; removidos → tombstone.
   *  `updatedBy` viaja CON el sello: se firma solo donde se re-sella (cambio o
   *  tombstone); los ítems sin cambio conservan su atribución anterior.
   *  `vistos` (opcional): claves que la UI realmente vio (ver `this.vistos`);
   *  un ítem ausente del snapshot que NO esté ahí llegó por merge en segundo
   *  plano y SE CONSERVA VIVO en vez de tombstonearse. */
  protected stampArray<T extends Stamped>(
    prev: T[],
    next: T[],
    keyOf: (i: T) => string,
    vistos?: Set<string> | null,
  ): T[] {
    const ts = this.now();
    const prevByKey = new Map(prev.map((i) => [keyOf(i), i]));
    const out: T[] = [];
    const seen = new Set<string>();
    for (const item of next) {
      const k = keyOf(item);
      seen.add(k);
      const p = prevByKey.get(k);
      if (p && sameContent(p, item)) {
        // Sin cambio: conserva sello y autor previos (no re-firmar lo ajeno).
        out.push({ ...item, updatedAt: p.updatedAt ?? ts, updatedBy: p.updatedBy, deletedAt: undefined });
      } else {
        out.push({ ...item, updatedAt: ts, updatedBy: this.deviceName, deletedAt: undefined });
      }
    }
    for (const [k, p] of prevByKey) {
      if (seen.has(k)) continue;
      if (p.deletedAt) {
        out.push(p);
        continue;
      }
      // Solo tombstonea lo VISTO: si la UI nunca vio este ítem (llegó por
      // merge en segundo plano), su ausencia del snapshot no es un borrado.
      if (vistos && !vistos.has(k)) {
        out.push(p);
        continue;
      }
      out.push({ ...p, deletedAt: ts, updatedBy: this.deviceName });
    }
    return out;
  }

  protected live<T extends Stamped>(arr: T[]): T[] {
    return arr.filter((i) => !i.deletedAt);
  }

  // ── Persistencia (offline-first; agenda guardado al remoto) ──────────────
  loadProfessors(): Professor[] {
    const vivos = this.live(this.local.loadProfessors() as SProfessor[]);
    this.vistos.professors = new Set(vivos.map((p) => p.id));
    return vivos;
  }
  saveProfessors(professors: Professor[]): void {
    const stamped = this.stampArray(
      (this.local.loadProfessors() as SProfessor[]).map((p) => this.normProfessor(p)),
      (professors as SProfessor[]).map((p) => this.normProfessor(p)),
      (p) => p.id,
      this.vistos.professors,
    );
    this.local.saveProfessors(stamped);
    this.vistos.professors = new Set(this.live(stamped).map((p) => p.id));
    this.scheduleAutoPush();
  }

  loadScheduleBlocks(): ScheduleBlockData[] {
    const vivos = this.live(this.local.loadScheduleBlocks() as SBlock[]);
    this.vistos.blocks = new Set(vivos.map((b) => b.id));
    return vivos;
  }
  saveScheduleBlocks(blocks: ScheduleBlockData[]): void {
    const stamped = this.stampArray(
      this.local.loadScheduleBlocks() as SBlock[],
      blocks as SBlock[],
      (b) => b.id,
      this.vistos.blocks,
    );
    this.local.saveScheduleBlocks(stamped);
    this.vistos.blocks = new Set(this.live(stamped).map((b) => b.id));
    this.scheduleAutoPush();
  }

  loadLogs(): LogEntry[] {
    return this.live(this.local.loadLogs() as SLog[]);
  }
  saveLogs(logs: LogEntry[]): void {
    const stamped = this.stampArray(
      this.local.loadLogs() as SLog[],
      logs as SLog[],
      (l) => l.id,
    );
    this.local.saveLogs(stamped);
    this.scheduleAutoPush();
  }

  loadAcademicLoad(): AcademicLoad {
    const raw = this.local.loadAcademicLoad() as Record<string, SLoadVal>;
    const out: AcademicLoad = {};
    for (const [k, v] of Object.entries(raw)) if (!v.deletedAt) out[k] = v;
    this.vistos.load = new Set(Object.keys(out));
    return out;
  }
  saveAcademicLoad(load: AcademicLoad): void {
    const prev = this.local.loadAcademicLoad() as Record<string, SLoadVal>;
    const ts = this.now();
    const out: Record<string, SLoadVal> = {};
    for (const [k, v] of Object.entries(load)) {
      const p = prev[k];
      out[k] =
        p && sameContent(p, v)
          ? { ...v, updatedAt: p.updatedAt ?? ts, updatedBy: p.updatedBy }
          : { ...(v as SLoadVal), updatedAt: ts, updatedBy: this.deviceName };
    }
    for (const [k, p] of Object.entries(prev)) {
      if (k in load) continue;
      if (p.deletedAt) {
        out[k] = p;
        continue;
      }
      // Solo tombstonea lo VISTO (ver stampArray/this.vistos): lo que llegó
      // por merge en segundo plano y la UI aún no recargó se conserva vivo.
      if (this.vistos.load && !this.vistos.load.has(k)) {
        out[k] = p;
        continue;
      }
      out[k] = { ...p, deletedAt: ts, updatedBy: this.deviceName };
    }
    this.local.saveAcademicLoad(out);
    this.vistos.load = new Set(Object.entries(out).filter(([, v]) => !v.deletedAt).map(([k]) => k));
    this.scheduleAutoPush();
  }

  loadPensum(): Semester[] {
    const vivos = this.stripPensum(this.local.loadPensum() as SSemester[]);
    this.vistos.pensum = new Set(vivos.flatMap((s) => s.subjects.map((x) => x.code)));
    return vivos;
  }
  savePensum(pensum: Semester[]): void {
    const prev = this.local.loadPensum() as SSemester[];
    const prevByCode = new Map<string, SSubject>();
    for (const s of prev) for (const sub of s.subjects) prevByCode.set(sub.code, this.normSubject(sub));
    const ts = this.now();
    const seen = new Set<string>();
    const stamped: SSemester[] = pensum.map((s) => ({
      number: s.number,
      subjects: (s.subjects as SSubject[]).map((sub0) => {
        const sub = this.normSubject(sub0);
        seen.add(sub.code);
        const p = prevByCode.get(sub.code);
        if (p && sameContent(p, sub))
          return { ...sub, updatedAt: p.updatedAt ?? ts, updatedBy: p.updatedBy, deletedAt: undefined };
        return { ...sub, updatedAt: ts, updatedBy: this.deviceName, deletedAt: undefined };
      }),
    }));
    for (const s of prev) {
      for (const sub of s.subjects) {
        if (seen.has(sub.code)) continue;
        let target = stamped.find((x) => x.number === s.number);
        if (!target) {
          target = { number: s.number, subjects: [] };
          stamped.push(target);
        }
        if (sub.deletedAt) {
          target.subjects.push(sub);
          continue;
        }
        // Solo tombstonea lo VISTO (ver stampArray/this.vistos): lo mergeado
        // en segundo plano que la UI aún no recargó se conserva vivo.
        if (this.vistos.pensum && !this.vistos.pensum.has(sub.code)) {
          target.subjects.push(sub);
          continue;
        }
        target.subjects.push({ ...sub, deletedAt: ts, updatedBy: this.deviceName });
      }
    }
    stamped.sort((a, b) => a.number - b.number);
    this.local.savePensum(stamped);
    this.vistos.pensum = new Set(
      stamped.flatMap((s) => s.subjects.filter((x) => !x.deletedAt).map((x) => x.code)),
    );
    this.scheduleAutoPush();
  }
  protected stripPensum(sems: SSemester[]): Semester[] {
    return sems
      .map((s) => ({ number: s.number, subjects: s.subjects.filter((x) => !x.deletedAt) }))
      .filter((s) => s.subjects.length > 0);
  }
  protected mergePensum(local: SSemester[], remote: SSemester[]): SSemester[] {
    const localFlat: SSubject[] = [];
    const remoteFlat: SSubject[] = [];
    for (const s of local) for (const sub of s.subjects) localFlat.push({ ...sub, _sem: s.number });
    for (const s of remote) for (const sub of s.subjects) remoteFlat.push({ ...sub, _sem: s.number });
    const merged = mergeRaw(localFlat, remoteFlat, (x) => x.code);
    const bySem = new Map<number, SSubject[]>();
    for (const sub of merged) {
      const n = sub._sem ?? 0;
      const { _sem, ...clean } = sub;
      void _sem;
      if (!bySem.has(n)) bySem.set(n, []);
      bySem.get(n)!.push(clean as SSubject);
    }
    return [...bySem.entries()].sort((a, b) => a[0] - b[0]).map(([number, subjects]) => ({ number, subjects }));
  }

  protected localRaw(): RawDatasets {
    return {
      professors: this.local.loadProfessors() as SProfessor[],
      pensum: this.local.loadPensum() as SSemester[],
      scheduleBlocks: this.local.loadScheduleBlocks() as SBlock[],
      academicLoad: this.local.loadAcademicLoad() as Record<string, SLoadVal>,
      logs: this.local.loadLogs() as SLog[],
    };
  }

  // ── Guardado automático al remoto ────────────────────────────────────────
  /** Programa un guardado tras un pequeño debounce (coalesce de ráfagas). */
  protected scheduleAutoPush(): void {
    if (!this.isRemoteEnabled()) return;
    if (this.autoPushTimer) clearTimeout(this.autoPushTimer);
    this.autoPushTimer = setTimeout(() => {
      this.autoPushTimer = null;
      void this.pushDataOnly();
    }, 2000);
  }

  /** Fuerza un guardado pendiente inmediato (p. ej. al cerrar la app). */
  async flush(): Promise<void> {
    if (this.autoPushTimer) {
      clearTimeout(this.autoPushTimer);
      this.autoPushTimer = null;
    }
    if (this.isRemoteEnabled()) await this.pushDataOnly();
  }

  /** Escribe el estado local completo (incluidos tombstones) al remoto. */
  async pushDataOnly(): Promise<{ ok: boolean; error?: string }> {
    if (!this.isRemoteEnabled()) return { ok: false, error: 'Remoto no disponible' };
    try {
      // FUSIONAR ANTES DE SUBIR (anti-pisado): el push reconstruye academic_load y
      // professor_subjects borrando de la tabla lo que no esté en esta copia local.
      // Si otra PC agregó filas que esta todavía no bajó, sin este merge previo las
      // borraríamos. Bajamos+fusionamos primero para que el push respete lo ajeno.
      const sync = await this.syncNow();
      if (!sync.ok) {
        // No se pudo bajar (transitorio): NO subimos para no pisar; se reintenta luego.
        log.warn('[Sync] Pull previo al guardado falló; se pospone la subida (se mantiene local).');
        return { ok: false, error: 'No se pudo sincronizar antes de guardar' };
      }
      if (sync.changed) this.onMerged?.(sync.summary);
      await this.pushRemote(this.localRaw());
      log.info('[Sync] Guardado al remoto OK.');
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Error al guardar en el remoto';
      log.error('[Sync] Guardado FALLÓ (se mantiene local):', error);
      return { ok: false, error };
    }
  }

  /** Firma de lo que VE la UI (datos vivos), para detectar si un pull cambió algo.
   *  Lee DIRECTO del local sin pasar por los loadX() públicos: esta firma es
   *  interna (no una lectura del renderer) y no debe marcar nada como "visto"
   *  (this.vistos), o el merge en segundo plano quedaría tombstoneable. */
  private liveSignature(): string {
    const raw = this.localRaw();
    const loadVivo: AcademicLoad = {};
    for (const [k, v] of Object.entries(raw.academicLoad)) if (!v.deletedAt) loadVivo[k] = v;
    return stableStringify({
      p: this.live(raw.professors),
      s: this.stripPensum(raw.pensum),
      b: this.live(raw.scheduleBlocks),
      l: loadVivo,
    });
  }

  // ── Vista previa de sincronización (dry-run: NO guarda nada) ─────────────
  /**
   * Calcula "qué entra, qué se reemplaza y qué subes" comparando local vs
   * remoto SIN modificar ninguno de los dos. La ventana del botón "Sincronizar"
   * lo muestra antes de confirmar; si falla, devuelve `ok:false` y la UI cae
   * al texto genérico (nunca bloquea el botón).
   */
  async previewSync(): Promise<SyncPreview> {
    const sinTotales = { nuevos: 0, actualizados: 0, eliminados: 0, subes: 0 };
    if (!this.isRemoteEnabled()) {
      return { ok: false, online: false, at: this.now(), sections: [], totals: sinTotales };
    }
    try {
      const remote = await this.pullRemote();
      return buildSyncPreview(this.localRaw(), remote, this.now());
    } catch (e) {
      // Error transitorio (red intermitente): hay remoto configurado pero no se
      // pudo leer ahora; el sync real reintentará por su cuenta.
      log.warn('[Sync] previewSync FALLÓ (transitorio, no bloquea):', e);
      return { ok: false, online: true, at: this.now(), sections: [], totals: sinTotales };
    }
  }

  // ── Recibir (pull + merge por fila, automático al abrir y periódico) ─────
  async syncNow(): Promise<{
    ok: boolean;
    merged: string[];
    changed: boolean;
    summary?: RemoteChangeSummary;
  }> {
    if (!this.isRemoteEnabled()) return { ok: false, merged: [], changed: false };
    const done: string[] = [];
    const before = this.liveSignature();
    try {
      const remote = await this.pullRemote();

      // Resumen de lo ENTRANTE (aviso en vivo): se calcula ANTES de fusionar
      // (después del merge local y remoto ya son iguales y no habría nada que
      // contar). Si el preview fallara, el sync sigue normal sin resumen: un
      // aviso jamás debe romper la sincronización.
      let summary: RemoteChangeSummary | undefined;
      try {
        summary = summarizeIncoming(buildSyncPreview(this.localRaw(), remote, this.now()));
      } catch (e) {
        log.warn('[Sync] No se pudo calcular el resumen de cambios entrantes:', e);
      }

      this.local.saveProfessors(
        mergeRaw(this.local.loadProfessors() as SProfessor[], remote.professors, (p) => p.id),
      );
      done.push('professors');
      this.local.saveScheduleBlocks(
        mergeRaw(this.local.loadScheduleBlocks() as SBlock[], remote.scheduleBlocks, (b) => b.id),
      );
      done.push('schedule-blocks');
      this.local.saveLogs(mergeRaw(this.local.loadLogs() as SLog[], remote.logs, (l) => l.id));
      done.push('logs');
      this.local.saveAcademicLoad(
        mergeMaps(
          this.local.loadAcademicLoad() as Record<string, SLoadVal>,
          remote.academicLoad,
          // Sello EFECTIVO max(updatedAt, deletedAt) — no `updatedAt ?? deletedAt`:
          // un tombstone local conserva su updatedAt viejo, y con la fórmula
          // vieja perdía contra un remoto re-sellado intermedio (el borrado más
          // nuevo se revertía, contradiciendo al preview, que ya usa el max).
          stampOf,
        ),
      );
      done.push('academic-load');
      // `subject.professors` es CACHÉ DERIVADA de la tabla de links
      // (professor_subjects): la tabla es la verdad y pullRemote la reconstruye
      // ya ordenada. El .exe NO mantiene esta caché al editar (los vínculos se
      // editan en professor.subjects, que sube con su propio sello), así que en
      // empate de sello el merge conservaría un fósil local para siempre
      // ("subes" fantasma). Tras fusionar, se sobreescribe la caché con la
      // vista remota SIN re-sellar (no es una edición del usuario): las
      // ediciones offline pendientes viven en professor.subjects y regeneran
      // los links al subir.
      const cacheRemota = new Map<string, string[]>();
      for (const s of remote.pensum)
        for (const sub of s.subjects) if (sub.professors) cacheRemota.set(sub.code, sub.professors);
      const pensumFusionado = this.mergePensum(
        this.local.loadPensum() as SSemester[],
        remote.pensum,
      );
      for (const s of pensumFusionado) {
        for (const sub of s.subjects) {
          const cache = cacheRemota.get(sub.code);
          if (cache) sub.professors = [...cache].sort();
        }
      }
      this.local.savePensum(pensumFusionado);
      done.push('pensum');

      const changed = this.liveSignature() !== before;
      log.info('[Sync] syncNow OK:', done.join(', '), changed ? '(cambios)' : '(sin cambios)');
      return { ok: true, merged: done, changed, summary };
    } catch (e) {
      log.error('[Sync] syncNow FALLÓ (se mantiene local):', e);
      return { ok: false, merged: done, changed: false };
    }
  }
}
