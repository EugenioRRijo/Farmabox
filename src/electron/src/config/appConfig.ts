/**
 * appConfig — Configuración de la app persistida en userData/config.json.
 *
 * Por ahora guarda la carpeta compartida (red local) que elige el usuario en
 * Configuración. Si `sharedDir` está seteada, la app usa el backend de carpeta
 * compartida; si no, usa Supabase (o solo local si no hay credenciales).
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

export interface AppConfig {
  sharedDir?: string | null;
}

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

export function loadConfig(): AppConfig {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf-8')) as AppConfig;
  } catch {
    return {};
  }
}

export function saveConfig(cfg: AppConfig): void {
  try {
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    log.error('[Config] No se pudo guardar config.json:', e);
  }
}

/** Devuelve la carpeta compartida configurada y normalizada, o null. */
export function getSharedDir(): string | null {
  const d = loadConfig().sharedDir;
  return d && d.trim() ? d.trim() : null;
}

/** Persiste la carpeta compartida (null/'' la borra → vuelve a Supabase). */
export function setSharedDir(dir: string | null): void {
  const cfg = loadConfig();
  cfg.sharedDir = dir && dir.trim() ? dir.trim() : null;
  saveConfig(cfg);
}
