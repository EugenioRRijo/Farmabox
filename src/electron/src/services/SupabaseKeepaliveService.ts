/**
 * SupabaseKeepaliveService — Mantiene el proyecto Supabase activo (SRP).
 *
 * El free tier de Supabase pausa proyectos tras 7 días de inactividad. Este
 * servicio hace un ping (HEAD a /rest/v1/) cada 5 días para prevenir la pausa
 * — causa típica de "la sincronización dejó de funcionar sola".
 *
 * Las credenciales se toman de `ENV` (config/env.ts), la misma fuente que usa
 * CloudStorageService. NO se piden por UI ni se vuelven a escribir en claro a
 * disco: solo se persisten contadores de estado en userData/data/supabase-status.json.
 * Si no hay credenciales (app 100% offline), el servicio queda inactivo.
 */
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';
import { ENV } from '../config/env';

const PING_INTERVAL_MS = 5 * 24 * 60 * 60 * 1000; // 5 días
const STALE_THRESHOLD_MS = 4 * 24 * 60 * 60 * 1000; // 4 días
const STATUS_FILE = 'supabase-status.json';

export interface PingResult {
  success: boolean;
  timestamp: string;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
}

/** Estado serializable (sin la anon key) — apto para devolver por IPC. */
export interface KeepaliveStatus {
  configured: boolean;
  lastPing?: PingResult;
  nextPingAt?: string;
  pingCount: number;
  autoKeepAlive: boolean;
}

interface PersistedStatus {
  lastPing?: PingResult;
  nextPingAt?: string;
  pingCount: number;
  autoKeepAlive: boolean;
}

export class SupabaseKeepaliveService {
  private readonly dataDir: string;
  private readonly projectUrl: string;
  private readonly anonKey: string;
  private status: PersistedStatus;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'data');
    this.projectUrl = ENV.SUPABASE_URL;
    this.anonKey = ENV.SUPABASE_ANON_KEY;
    this.status = this.loadStatus();

    if (this.isConfigured) {
      log.info('[SupabaseKeepalive] Configurado desde ENV (secrets).');
    } else {
      log.info('[SupabaseKeepalive] Sin credenciales → inactivo (la app corre 100% local).');
    }
  }

  get isConfigured(): boolean {
    return !!this.projectUrl && !!this.anonKey;
  }

  // ─── Estado ────────────────────────────────────────────────────────────────
  getStatus(): KeepaliveStatus {
    return {
      configured: this.isConfigured,
      lastPing: this.status.lastPing,
      nextPingAt: this.status.nextPingAt,
      pingCount: this.status.pingCount,
      autoKeepAlive: this.status.autoKeepAlive,
    };
  }

  // ─── Ping ──────────────────────────────────────────────────────────────────
  async ping(): Promise<PingResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: 'Supabase no configurado (sin credenciales en ENV).',
      };
    }
    const start = Date.now();
    const result = await this.doHttpPing();
    result.latencyMs = Date.now() - start;

    this.status.lastPing = result;
    this.status.pingCount += 1;
    this.status.nextPingAt = new Date(Date.now() + PING_INTERVAL_MS).toISOString();
    this.saveStatus();

    if (result.success) {
      log.info(`[SupabaseKeepalive] Ping OK ✅ (${result.latencyMs}ms, HTTP ${result.statusCode})`);
    } else {
      log.warn(`[SupabaseKeepalive] Ping FAILED ❌: ${result.error}`);
    }
    return result;
  }

  // ─── Auto keepalive ─────────────────────────────────────────────────────────
  startAutoKeepAlive(): void {
    if (!this.isConfigured || this.intervalHandle) return;
    this.status.autoKeepAlive = true;
    this.saveStatus();

    // Ping inmediato si pasó el umbral desde el último.
    this.pingIfStale();

    this.intervalHandle = setInterval(() => {
      this.ping().catch((e) => log.error('[SupabaseKeepalive] Auto-ping error:', e));
    }, PING_INTERVAL_MS);
    log.info('[SupabaseKeepalive] Auto keepalive iniciado (cada 5 días).');
  }

  stopAutoKeepAlive(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.status.autoKeepAlive = false;
    this.saveStatus();
    log.info('[SupabaseKeepalive] Auto keepalive detenido.');
  }

  // ─── Interno ────────────────────────────────────────────────────────────────
  private pingIfStale(): void {
    const lastPingTime = this.status.lastPing
      ? new Date(this.status.lastPing.timestamp).getTime()
      : 0;
    if (Date.now() - lastPingTime > STALE_THRESHOLD_MS) {
      log.info('[SupabaseKeepalive] Estado obsoleto — ping al iniciar...');
      this.ping().catch((e) => log.error('[SupabaseKeepalive] Startup ping error:', e));
    }
  }

  private doHttpPing(): Promise<PingResult> {
    return new Promise((resolve) => {
      try {
        const url = new URL('/rest/v1/', this.projectUrl);
        const req = https.request(
          {
            hostname: url.hostname,
            path: url.pathname,
            method: 'HEAD', // HEAD: no descarga body
            headers: { apikey: this.anonKey, Authorization: `Bearer ${this.anonKey}` },
            timeout: 10000,
          },
          (res) => {
            res.resume(); // liberar el socket
            resolve({
              success: (res.statusCode ?? 0) < 500,
              timestamp: new Date().toISOString(),
              statusCode: res.statusCode,
            });
          },
        );
        req.on('timeout', () => {
          req.destroy();
          resolve({
            success: false,
            timestamp: new Date().toISOString(),
            error: 'Timeout (10s) — verifica la URL del proyecto',
          });
        });
        req.on('error', (err) => {
          resolve({ success: false, timestamp: new Date().toISOString(), error: err.message });
        });
        req.end();
      } catch (err) {
        resolve({
          success: false,
          timestamp: new Date().toISOString(),
          error: err instanceof Error ? err.message : 'Error desconocido',
        });
      }
    });
  }

  private get statusPath(): string {
    return path.join(this.dataDir, STATUS_FILE);
  }

  private loadStatus(): PersistedStatus {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    let saved: Partial<PersistedStatus> = {};
    if (fs.existsSync(this.statusPath)) {
      try {
        saved = JSON.parse(fs.readFileSync(this.statusPath, 'utf-8')) as Partial<PersistedStatus>;
      } catch {
        saved = {};
      }
    }
    return {
      lastPing: saved.lastPing,
      nextPingAt: saved.nextPingAt,
      pingCount: saved.pingCount ?? 0,
      autoKeepAlive: saved.autoKeepAlive ?? false,
    };
  }

  private saveStatus(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    fs.writeFileSync(this.statusPath, JSON.stringify(this.status, null, 2), 'utf-8');
  }
}
