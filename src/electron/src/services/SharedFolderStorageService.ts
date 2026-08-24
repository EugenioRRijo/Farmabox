/**
 * SharedFolderStorageService — Backend de sincronización contra una CARPETA
 * COMPARTIDA de red local (\\PC\Farmabox, unidad Z:\, etc.).
 *
 * Extiende SyncStorageBase (sellado + merge offline-first) y define el transporte:
 * guarda los 5 datasets como JSON sellado dentro de `<carpeta>/farmabox-data/`.
 *
 * Para que dos PCs no se pisen, al subir hace READ-MERGE-WRITE: relee lo que hay
 * en la carpeta, lo fusiona (newest-wins por ítem) con lo local y reescribe. Las
 * escrituras son atómicas (archivo .tmp + rename). No necesita internet, solo que
 * la carpeta compartida esté accesible.
 */
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import { mergeRaw, mergeMaps, stampOf } from '../sync/merge';
import {
  SyncStorageBase,
  type RawDatasets,
  type SProfessor,
  type SBlock,
  type SLog,
  type SLoadVal,
  type SSemester,
} from './SyncStorageBase';
import type { IStorageService } from './IStorageService';

export class SharedFolderStorageService extends SyncStorageBase {
  private readonly dir: string;
  private enabledCache: { val: boolean; at: number } | null = null;

  constructor(local: IStorageService, private readonly sharedRoot: string) {
    super(local);
    this.dir = path.join(sharedRoot, 'farmabox-data');
    log.info('[Shared] Carpeta compartida →', this.dir);
  }

  /**
   * ¿La carpeta está accesible? `fs.existsSync` sobre una ruta de red caída
   * BLOQUEA el hilo principal (timeout SMB) y se llama tras CADA guardado, así
   * que cacheamos el resultado ~15s para no congelar la UI si la red se cae.
   */
  isRemoteEnabled(): boolean {
    const now = Date.now();
    if (this.enabledCache && now - this.enabledCache.at < 15000) return this.enabledCache.val;
    let val = false;
    try {
      val = fs.existsSync(this.sharedRoot);
    } catch {
      val = false;
    }
    this.enabledCache = { val, at: now };
    return val;
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  private readJSON<T>(name: string, fallback: T): T {
    try {
      const p = path.join(this.dir, name);
      if (!fs.existsSync(p)) return fallback;
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
    } catch (e) {
      log.warn(`[Shared] No se pudo leer ${name}:`, e);
      return fallback;
    }
  }

  private writeJSON(name: string, data: unknown): void {
    this.ensureDir();
    const p = path.join(this.dir, name);
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, p); // atómico → evita dejar un JSON a medio escribir
  }

  // ── Bajar: JSON de la carpeta → datasets sellados ────────────────────────
  protected async pullRemote(): Promise<RawDatasets> {
    return {
      professors: this.readJSON<SProfessor[]>('professors.json', []),
      pensum: this.readJSON<SSemester[]>('pensum.json', []),
      scheduleBlocks: this.readJSON<SBlock[]>('schedule-blocks.json', []),
      academicLoad: this.readJSON<Record<string, SLoadVal>>('academic-load.json', {}),
      logs: this.readJSON<SLog[]>('logs.json', []),
    };
  }

  // ── Subir: read-merge-write para no pisar a otra PC ──────────────────────
  protected async pushRemote(raw: RawDatasets): Promise<void> {
    const cur = await this.pullRemote();
    const merged: RawDatasets = {
      professors: mergeRaw(cur.professors, raw.professors, (p) => p.id),
      scheduleBlocks: mergeRaw(cur.scheduleBlocks, raw.scheduleBlocks, (b) => b.id),
      logs: mergeRaw(cur.logs, raw.logs, (l) => l.id),
      // Sello EFECTIVO max(updatedAt, deletedAt) — ver syncNow(): un tombstone
      // con updatedAt viejo no debe perder contra un update intermedio.
      academicLoad: mergeMaps(cur.academicLoad, raw.academicLoad, stampOf),
      pensum: this.mergePensum(cur.pensum, raw.pensum),
    };
    this.writeJSON('professors.json', merged.professors);
    this.writeJSON('pensum.json', merged.pensum);
    this.writeJSON('schedule-blocks.json', merged.scheduleBlocks);
    this.writeJSON('academic-load.json', merged.academicLoad);
    this.writeJSON('logs.json', merged.logs);
  }
}
