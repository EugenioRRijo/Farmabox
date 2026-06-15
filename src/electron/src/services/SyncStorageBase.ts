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
import log from 'electron-log';
import { mergeRaw, mergeMaps, type Stamped } from '../sync/merge';
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

/** JSON estable (orden de claves) ignorando la metadata de sync. */
export function stableStringify(o: unknown): string {
  if (o === null || typeof o !== 'object') return JSON.stringify(o) ?? 'null';
  if (Array.isArray(o)) return '[' + o.map(stableStringify).join(',') + ']';
  const obj = o as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => k !== 'updatedAt' && k !== 'deletedAt')
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}
export function sameContent(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

export abstract class SyncStorageBase implements IStorageService {
  private autoPushTimer: ReturnType<typeof setTimeout> | null = null;
  /** Notifica al proceso main cuando un pull-merge (antes de subir) trajo cambios,
   *  para que avise al renderer (data-changed) y la UI no quede desactualizada. */
  private onMerged: (() => void) | null = null;

  constructor(protected readonly local: IStorageService) {}

  /** Lo cablea main.ts para reenviar 'data-changed' al renderer. */
  setOnMerged(cb: (() => void) | null): void {
    this.onMerged = cb;
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

  // ── Sellado de ítems ─────────────────────────────────────────────────────
  /** Sella un array con clave: nuevos/cambiados → updatedAt=now; removidos → tombstone. */
  protected stampArray<T extends Stamped>(prev: T[], next: T[], keyOf: (i: T) => string): T[] {
    const ts = this.now();
    const prevByKey = new Map(prev.map((i) => [keyOf(i), i]));
    const out: T[] = [];
    const seen = new Set<string>();
    for (const item of next) {
      const k = keyOf(item);
      seen.add(k);
      const p = prevByKey.get(k);
      if (p && sameContent(p, item)) {
        out.push({ ...item, updatedAt: p.updatedAt ?? ts, deletedAt: undefined });
      } else {
        out.push({ ...item, updatedAt: ts, deletedAt: undefined });
      }
    }
    for (const [k, p] of prevByKey) {
      if (seen.has(k)) continue;
      out.push(p.deletedAt ? p : { ...p, deletedAt: ts });
    }
    return out;
  }

  protected live<T extends Stamped>(arr: T[]): T[] {
    return arr.filter((i) => !i.deletedAt);
  }

  // ── Persistencia (offline-first; agenda guardado al remoto) ──────────────
  loadProfessors(): Professor[] {
    return this.live(this.local.loadProfessors() as SProfessor[]);
  }
  saveProfessors(professors: Professor[]): void {
    const stamped = this.stampArray(
      this.local.loadProfessors() as SProfessor[],
      professors as SProfessor[],
      (p) => p.id,
    );
    this.local.saveProfessors(stamped);
    this.scheduleAutoPush();
  }

  loadScheduleBlocks(): ScheduleBlockData[] {
    return this.live(this.local.loadScheduleBlocks() as SBlock[]);
  }
  saveScheduleBlocks(blocks: ScheduleBlockData[]): void {
    const stamped = this.stampArray(
      this.local.loadScheduleBlocks() as SBlock[],
      blocks as SBlock[],
      (b) => b.id,
    );
    this.local.saveScheduleBlocks(stamped);
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
          ? { ...v, updatedAt: p.updatedAt ?? ts }
          : { ...(v as SLoadVal), updatedAt: ts };
    }
    for (const [k, p] of Object.entries(prev)) {
      if (k in load) continue;
      out[k] = p.deletedAt ? p : { ...p, deletedAt: ts };
    }
    this.local.saveAcademicLoad(out);
    this.scheduleAutoPush();
  }

  loadPensum(): Semester[] {
    return this.stripPensum(this.local.loadPensum() as SSemester[]);
  }
  savePensum(pensum: Semester[]): void {
    const prev = this.local.loadPensum() as SSemester[];
    const prevByCode = new Map<string, SSubject>();
    for (const s of prev) for (const sub of s.subjects) prevByCode.set(sub.code, sub);
    const ts = this.now();
    const seen = new Set<string>();
    const stamped: SSemester[] = pensum.map((s) => ({
      number: s.number,
      subjects: (s.subjects as SSubject[]).map((sub) => {
        seen.add(sub.code);
        const p = prevByCode.get(sub.code);
        if (p && sameContent(p, sub)) return { ...sub, updatedAt: p.updatedAt ?? ts, deletedAt: undefined };
        return { ...sub, updatedAt: ts, deletedAt: undefined };
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
        target.subjects.push(sub.deletedAt ? sub : { ...sub, deletedAt: ts });
      }
    }
    stamped.sort((a, b) => a.number - b.number);
    this.local.savePensum(stamped);
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
      if (sync.changed) this.onMerged?.();
      await this.pushRemote(this.localRaw());
      log.info('[Sync] Guardado al remoto OK.');
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Error al guardar en el remoto';
      log.error('[Sync] Guardado FALLÓ (se mantiene local):', error);
      return { ok: false, error };
    }
  }

  /** Firma de lo que VE la UI (datos vivos), para detectar si un pull cambió algo. */
  private liveSignature(): string {
    return stableStringify({
      p: this.loadProfessors(),
      s: this.loadPensum(),
      b: this.loadScheduleBlocks(),
      l: this.loadAcademicLoad(),
    });
  }

  // ── Recibir (pull + merge por fila, automático al abrir y periódico) ─────
  async syncNow(): Promise<{ ok: boolean; merged: string[]; changed: boolean }> {
    if (!this.isRemoteEnabled()) return { ok: false, merged: [], changed: false };
    const done: string[] = [];
    const before = this.liveSignature();
    try {
      const remote = await this.pullRemote();

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
          (v) => v.updatedAt ?? v.deletedAt ?? '',
        ),
      );
      done.push('academic-load');
      this.local.savePensum(this.mergePensum(this.local.loadPensum() as SSemester[], remote.pensum));
      done.push('pensum');

      const changed = this.liveSignature() !== before;
      log.info('[Sync] syncNow OK:', done.join(', '), changed ? '(cambios)' : '(sin cambios)');
      return { ok: true, merged: done, changed };
    } catch (e) {
      log.error('[Sync] syncNow FALLÓ (se mantiene local):', e);
      return { ok: false, merged: done, changed: false };
    }
  }
}
