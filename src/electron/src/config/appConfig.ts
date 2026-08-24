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
  /** Nombre amigable del equipo (atribución multi-PC); null/ausente → os.hostname(). */
  deviceName?: string | null;
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

/** Devuelve el nombre de equipo configurado (trim), o null si no hay. */
export function getDeviceName(): string | null {
  const n = loadConfig().deviceName;
  return n && n.trim() ? n.trim() : null;
}

/** Persiste el nombre de equipo (null/'' lo borra → vuelve a os.hostname()). */
export function setDeviceName(name: string | null): void {
  const cfg = loadConfig();
  cfg.deviceName = name && name.trim() ? name.trim() : null;
  saveConfig(cfg);
}
