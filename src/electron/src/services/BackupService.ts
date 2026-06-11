/**
 * BackupService — Respaldos automáticos locales de la base de datos JSON.
 *
 * Copia los .json de userData/data/ a Documentos/USM Horarios/Backups/ en
 * carpetas con timestamp, conservando solo los N más recientes. Independiente
 * del transporte de sync (es una red de seguridad puramente local).
 */
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';
import type { IStorageService } from './IStorageService';

const MAX_BACKUPS = 5;

export class BackupService {
  private readonly sourceDir: string;
  private readonly backupDir: string;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(storageService: Pick<IStorageService, 'getDataDir'>) {
    this.sourceDir = storageService.getDataDir();
    this.backupDir = path.join(app.getPath('documents'), 'USM Horarios', 'Backups');
    this.ensureBackupDir();
  }

  private ensureBackupDir(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /** Crea un backup inmediatamente. Devuelve true si copió algo. */
  async createBackup(): Promise<boolean> {
    try {
      this.ensureBackupDir();
      if (!fs.existsSync(this.sourceDir)) {
        log.warn('[BackupService] El directorio de datos no existe, nada que respaldar.');
        return false;
      }
      const jsonFiles = fs.readdirSync(this.sourceDir).filter((f) => f.endsWith('.json'));
      if (jsonFiles.length === 0) {
        log.info('[BackupService] No hay archivos JSON para respaldar.');
        return false;
      }
      // Timestamp seguro para nombres de carpeta: YYYY-MM-DDTHH-mm-ss-SSSZ
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const currentBackupFolder = path.join(this.backupDir, `backup_${timestamp}`);
      fs.mkdirSync(currentBackupFolder, { recursive: true });
      for (const file of jsonFiles) {
        fs.copyFileSync(path.join(this.sourceDir, file), path.join(currentBackupFolder, file));
      }
      log.info(`[BackupService] Backup creado en: ${currentBackupFolder}`);
      this.cleanupOldBackups(MAX_BACKUPS);
      return true;
    } catch (error) {
      log.error('[BackupService] Error creando backup:', error);
      return false;
    }
  }

  /** Inicia el ciclo de backups automáticos (por defecto cada 2 horas). */
  startAutoBackup(intervalHours = 2): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(
      () => {
        this.createBackup().catch((e) => log.error('[BackupService] Auto-backup error:', e));
      },
      intervalHours * 60 * 60 * 1000,
    );
    log.info(`[BackupService] Auto-backup programado cada ${intervalHours} horas.`);
  }

  stopAutoBackup(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Conserva únicamente los backups más recientes. */
  private cleanupOldBackups(maxBackups: number): void {
    try {
      const folders = fs
        .readdirSync(this.backupDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith('backup_'))
        .map((d) => {
          const folderPath = path.join(this.backupDir, d.name);
          return { name: d.name, path: folderPath, time: fs.statSync(folderPath).mtimeMs };
        })
        .sort((a, b) => b.time - a.time); // más recientes primero

      for (const folder of folders.slice(maxBackups)) {
        fs.rmSync(folder.path, { recursive: true, force: true });
        log.info(`[BackupService] Backup antiguo eliminado: ${folder.name}`);
      }
    } catch (error) {
      log.error('[BackupService] Error limpiando backups antiguos:', error);
    }
  }
}
