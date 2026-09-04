/**
 * CloudStorageService — Backend de sincronización contra Supabase.
 *
 * Extiende SyncStorageBase (sellado + merge offline-first) y solo define el
 * transporte: lee/escribe las tablas relacionales normalizadas
 * (ver docs/supabase-schema.sql): professors, subjects, professor_subjects (M:N),
 * academic_load, schedule_blocks, logs. Cada tabla con updated_at / deleted_at.
 */
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import log from 'electron-log';
import { ENV } from '../config/env';
import {
  SyncStorageBase,
  type RawDatasets,
  type SProfessor,
  type SBlock,
  type SLog,
  type SSubject,
  type SLoadVal,
  type SSemester,
} from './SyncStorageBase';
import { nextLogCursor } from '../sync/logCursor';
import type { IStorageService } from './IStorageService';
import type { Professor } from '@scheduler/shared';

// ── Filas tal como vienen/van a Postgres ───────────────────────────────────
interface ProfRow {
  id: string;
  full_name: string;
  title: string;
  email: string | null;
  cedula: string | null;
  profession: string | null;
  type: string;
  updated_at: string | null;
  deleted_at: string | null;
  updated_by: string | null;
}
interface SubjRow {
  code: string;
  name: string;
  credits: number;
  has_lab: boolean;
  hours_theory: number;
  hours_lab: number;
  semester: number;
  lab_number: string | null;
  aula: string | null;
  prerequisites: string[] | null;
  updated_at: string | null;
  deleted_at: string | null;
  updated_by: string | null;
}
interface LinkRow {
  professor_id: string;
  subject_code: string;
}
interface LoadRow {
  subject_code: string;
  professor_id: string;
  role: string;
  updated_at: string | null;
  updated_by: string | null;
}
interface BlockRow {
  id: string;
  subject_code: string | null;
  semester: number | null;
  day: number;
  start_hour: number;
  duration: number;
  color: string | null;
  type: string | null;
  professor_id: string | null;
  section: string | null;
  lab_group_id: string | null;
  aula: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  updated_by: string | null;
}
interface LogRow {
  id: string;
  action: string;
  details: string | null;
  timestamp: string | null;
  updated_at: string | null;
  deleted_at: string | null;
}

/**
 * Normaliza un sello leído de la nube al formato local (`Z`).
 * PostgREST devuelve offsets `+00:00` mientras lo local sella con
 * `new Date().toISOString()` (sufijo `Z`); la comparación newest-wins es
 * LEXICOGRÁFICA y entre formatos distintos el mismo instante parece "más
 * nuevo" de un lado (incidente: ítems idénticos caían como "local más nuevo"
 * → "subes" fantasma). null/undefined → undefined; un valor no parseable se
 * devuelve tal cual (mejor comparar algo que romper el pull).
 */
export function normalizarSello(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? s : new Date(ms).toISOString();
}

/**
 * Electron empaqueta Node 18 (sin WebSocket nativo). supabase-js inicializa su
 * cliente realtime —que exige WebSocket— aunque aquí solo usemos la API REST.
 * Proveemos un polyfill con el paquete 'ws'. (No usamos realtime.)
 */
function ensureWebSocket(): void {
  const g = globalThis as unknown as { WebSocket?: unknown };
  if (typeof g.WebSocket === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ws = require('ws');
    g.WebSocket = ws.WebSocket ?? ws;
  }
}

export class CloudStorageService extends SyncStorageBase {
  private client: SupabaseClient | null = null;
  private colSupported: Record<string, boolean> = {}; // columnas nuevas: omitir si la base aún no las tiene

  /** Claves de links y de carga VISTAS en el último pullRemote (el del mismo
   *  ciclo: pushDataOnly hace syncNow → pullRemote ANTES de pushRemote).
   *  Mitiga la carrera del delete-loop: entre ese pull y el delete, otra PC
   *  (o la web) puede INSERTAR una fila que esta copia jamás vio; como estas
   *  tablas no tienen tombstone, hard-borrarla sería pérdida permanente. El
   *  delete-loop solo borra claves que EXISTÍAN en el pull previo; lo no
   *  visto se deja quieto y el próximo pull lo baja y lo fusiona.
   *  `null` = nunca hubo pull en esta sesión → no se borra nada. */
  private vistoEnPull: { links: Set<string>; carga: Set<string> } | null = null;

  /** Quita una columna de las filas si todavía no existe en la tabla (para no romper el upsert). */
  private async stripCol(
    table: string,
    col: string,
    rows: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const key = `${table}.${col}`;
    if (this.colSupported[key] === undefined && this.client) {
      const { error } = await this.client.from(table).select(col).limit(1);
      this.colSupported[key] = !error;
    }
    if (this.colSupported[key]) return rows;
    return rows.map((r) => {
      const { [col]: _omit, ...rest } = r;
      return rest;
    });
  }

  constructor(local: IStorageService) {
    super(local);
    if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
      log.warn('[Cloud] Sin credenciales — modo offline (solo local).');
      return;
    }
    try {
      ensureWebSocket();
      this.client = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });
      log.info('[Cloud] Modo nube activo →', ENV.SUPABASE_URL);
    } catch (e) {
      log.error('[Cloud] No se pudo inicializar el cliente; se opera offline:', e);
      this.client = null;
    }
  }

  isRemoteEnabled(): boolean {
    return !!this.client;
  }

  // ── Realtime (#7): avisos casi instantáneos de cambios de otras PCs ───────
  private realtimeChannel: RealtimeChannel | null = null;

  /** Suscribe a cambios en las tablas sincronizadas. Llama `onChange` (que el caller
   *  coalesce) cuando otra PC modifica datos, para bajar+fusionar enseguida en vez de
   *  esperar el pull periódico de 60 s. Degradación: si el realtime no conecta (red /
   *  cuota / publicación no habilitada en Supabase), el pull periódico sigue como red
   *  de seguridad y no se rompe nada. */
  startRealtime(onChange: () => void): void {
    if (!this.client || this.realtimeChannel) return;
    const tables = ['professors', 'subjects', 'professor_subjects', 'academic_load', 'schedule_blocks', 'logs'];
    const ch = this.client.channel('farmabox-sync');
    for (const table of tables) {
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => onChange(),
      );
    }
    ch.subscribe((status) => log.info('[Realtime] Estado de la suscripción:', status));
    this.realtimeChannel = ch;
    log.info('[Realtime] Suscripción iniciada a', tables.length, 'tablas.');
  }

  stopRealtime(): void {
    if (this.realtimeChannel && this.client) {
      void this.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  // ── Subir: estado local → tablas relacionales ────────────────────────────
  protected async pushRemote(raw: RawDatasets): Promise<void> {
    if (!this.client) throw new Error('Nube no configurada');
    const profs = raw.professors;
    const subsFlat: SSubject[] = raw.pensum.flatMap((s) =>
      s.subjects.map((sub) => ({ ...sub, _sem: s.number })),
    );
    // Solo lo VIVO crea filas de vínculo/carga: un profesor o materia
    // tombstoneada no debe sostener links en la nube (con el set completo, los
    // links hacia borrados se re-creaban en cada push y quedaban zombis
    // eternos). Al no recrearse, el delete-loop de abajo los limpia en el
    // próximo push; la lógica del keep-set no cambia.
    const liveProfIds = new Set(this.live(profs).map((p) => p.id));
    const liveSubjCodes = new Set(subsFlat.filter((s) => !s.deletedAt).map((s) => s.code));

    // 1. Profesores (incluye tombstoned, con deleted_at).
    const profRows: ProfRow[] = profs.map((p) => ({
      id: p.id,
      full_name: p.fullName,
      title: p.title,
      email: p.email ?? null,
      cedula: p.cedula ?? null,
      profession: p.profession ?? null,
      type: p.type,
      updated_at: p.updatedAt ?? this.now(),
      deleted_at: p.deletedAt ?? null,
      updated_by: p.updatedBy ?? null,
    }));
    if (profRows.length) {
      let rows = await this.stripCol(
        'professors',
        'profession',
        profRows as unknown as Record<string, unknown>[],
      );
      // Atribución por equipo: se omite si falta la columna (migración 2.8).
      rows = await this.stripCol('professors', 'updated_by', rows);
      const { error } = await this.client.from('professors').upsert(rows);
      if (error) throw error;
    }

    // 2. Materias (incluye tombstoned).
    const subjRows: SubjRow[] = subsFlat.map((s) => ({
      code: s.code,
      name: s.name,
      credits: s.credits ?? 0,
      has_lab: !!s.hasLab,
      hours_theory: s.hoursTheory ?? 0,
      hours_lab: s.hoursLab ?? 0,
      semester: s._sem ?? 1,
      lab_number: s.labNumber ?? null,
      aula: s.aula ?? null,
      prerequisites: s.prerequisites ?? [],
      updated_at: s.updatedAt ?? this.now(),
      deleted_at: s.deletedAt ?? null,
      updated_by: s.updatedBy ?? null,
    }));
    if (subjRows.length) {
      let rows = await this.stripCol(
        'subjects',
        'aula',
        subjRows as unknown as Record<string, unknown>[],
      );
      // Atribución por equipo: se omite si falta la columna (migración 2.8).
      rows = await this.stripCol('subjects', 'updated_by', rows);
      const { error } = await this.client.from('subjects').upsert(rows);
      if (error) throw error;
    }

    // 3. professor_subjects: reconstruir desde la unión de ambos lados (solo vivos).
    const linkSet = new Set<string>();
    const links: LinkRow[] = [];
    const addLink = (pid: string, code: string): void => {
      if (!liveProfIds.has(pid) || !liveSubjCodes.has(code)) return; // respeta FKs y no revive links de tombstoneados
      const key = `${pid} ${code}`;
      if (linkSet.has(key)) return;
      linkSet.add(key);
      links.push({ professor_id: pid, subject_code: code });
    };
    for (const p of this.live(profs)) for (const code of p.subjects ?? []) addLink(p.id, code);
    for (const s of subsFlat) {
      if (s.deletedAt) continue;
      for (const pid of s.professors ?? []) addLink(pid, s.code);
    }
    // Upsert lo nuevo (la tabla NUNCA queda vacía) y borrar solo lo que sobra.
    if (links.length) {
      const { error } = await this.client.from('professor_subjects').upsert(links);
      if (error) throw error;
    }
    {
      const keep = new Set(links.map((l) => `${l.professor_id} ${l.subject_code}`));
      // pullAll: la lectura completa también pagina (mismo cap de 1000 de PostgREST).
      const existing = await this.pullAll('professor_subjects');
      for (const r of existing as unknown as LinkRow[]) {
        const key = `${r.professor_id} ${r.subject_code}`;
        if (keep.has(key)) continue;
        // Carrera del delete-loop: si la fila NO estaba en el pull previo de
        // este mismo ciclo, la acaba de crear otra PC (o la web) y esta copia
        // jamás la vio; hard-borrarla sería pérdida permanente (la tabla no
        // tiene tombstone). Se deja quieta: el próximo pull la baja y la
        // fusiona (ver vistoEnPull).
        if (!this.vistoEnPull?.links.has(key)) continue;
        const del = await this.client
          .from('professor_subjects')
          .delete()
          .eq('professor_id', r.professor_id)
          .eq('subject_code', r.subject_code);
        if (del.error) throw del.error;
      }
    }

    // 4. academic_load: reemplazar por las asignaciones vivas.
    const loadInsert: LoadRow[] = [];
    for (const [code, v] of Object.entries(raw.academicLoad)) {
      // Solo materias/profesores VIVOS crean filas (ver liveProfIds arriba).
      if (v.deletedAt || !liveSubjCodes.has(code)) continue;
      // El sellado de academic_load es por subjectCode: cada fila hereda el
      // sello y la atribución del contenedor (SLoadVal) de su materia.
      const ts = v.updatedAt ?? this.now();
      const by = v.updatedBy ?? null;
      for (const pid of v.theory ?? [])
        if (liveProfIds.has(pid))
          loadInsert.push({ subject_code: code, professor_id: pid, role: 'theory', updated_at: ts, updated_by: by });
      for (const pid of v.lab ?? [])
        if (liveProfIds.has(pid))
          loadInsert.push({ subject_code: code, professor_id: pid, role: 'lab', updated_at: ts, updated_by: by });
    }
    // Upsert lo nuevo y borrar solo lo que sobra (nunca queda vacía a medio camino).
    if (loadInsert.length) {
      // Atribución por equipo: se omite si falta la columna (migración 2.8).
      const rows = await this.stripCol(
        'academic_load',
        'updated_by',
        loadInsert as unknown as Record<string, unknown>[],
      );
      const { error } = await this.client.from('academic_load').upsert(rows);
      if (error) throw error;
    }
    {
      const keep = new Set(loadInsert.map((l) => `${l.subject_code} ${l.professor_id} ${l.role}`));
      // pullAll: la lectura completa también pagina (mismo cap de 1000 de PostgREST).
      const existing = await this.pullAll('academic_load');
      for (const r of existing as unknown as LoadRow[]) {
        const key = `${r.subject_code} ${r.professor_id} ${r.role}`;
        if (keep.has(key)) continue;
        // Misma mitigación de carrera que en professor_subjects: solo se
        // borra lo que EXISTÍA en el pull previo de este ciclo (vistoEnPull);
        // una fila recién creada por otra PC se conserva.
        if (!this.vistoEnPull?.carga.has(key)) continue;
        const del = await this.client
          .from('academic_load')
          .delete()
          .eq('subject_code', r.subject_code)
          .eq('professor_id', r.professor_id)
          .eq('role', r.role);
        if (del.error) throw del.error;
      }
    }

    // 5. Bloques de horario (incluye tombstoned).
    const blockRows: BlockRow[] = raw.scheduleBlocks.map((b) => ({
      id: b.id,
      subject_code: b.subjectCode ?? null,
      semester: b.semester ?? null,
      day: b.day,
      start_hour: b.startHour,
      duration: b.duration,
      color: b.color ?? null,
      type: b.type ?? null,
      professor_id: b.professorId ?? null,
      section: b.section ?? null,
      lab_group_id: b.labGroupId ?? null,
      aula: b.aula ?? null,
      updated_at: b.updatedAt ?? this.now(),
      deleted_at: b.deletedAt ?? null,
      updated_by: b.updatedBy ?? null,
    }));
    if (blockRows.length) {
      let rows = await this.stripCol(
        'schedule_blocks',
        'semester',
        blockRows as unknown as Record<string, unknown>[],
      );
      // Columna `aula` por bloque: se omite si la base aún no la tiene (degradación).
      rows = await this.stripCol('schedule_blocks', 'aula', rows);
      // Atribución por equipo: se omite si falta la columna (migración 2.8).
      rows = await this.stripCol('schedule_blocks', 'updated_by', rows);
      const { error } = await this.client.from('schedule_blocks').upsert(rows);
      if (error) throw error;
    }

    // 6. Logs (incluye tombstoned).
    const logRows: LogRow[] = raw.logs.map((l) => ({
      id: l.id,
      action: l.action,
      details: l.details ?? null,
      timestamp: l.timestamp ?? this.now(),
      updated_at: l.updatedAt ?? this.now(),
      deleted_at: l.deletedAt ?? null,
    }));
    if (logRows.length) {
      const { error } = await this.client.from('logs').upsert(logRows);
      if (error) throw error;
    }
  }

  // ── Bajar: tablas relacionales → datasets sellados ───────────────────────

  /** Columnas de orden por tabla: `.range()` necesita un orden determinista
   *  (idealmente único) para que la paginación no repita ni salte filas. */
  private static readonly PULL_ORDER: Record<string, string[]> = {
    professors: ['id'],
    subjects: ['code'],
    professor_subjects: ['subject_code', 'professor_id'],
    academic_load: ['subject_code', 'professor_id', 'role'],
    schedule_blocks: ['id'],
    logs: ['id'],
  };

  /**
   * Baja TODAS las filas de una tabla paginando con `.range()`.
   * PostgREST corta cada respuesta en 1000 filas: un `select('*')` a secas
   * devolvía una nube truncada (incidente: schedule_blocks con ~1800 filas y
   * logs con ~5000 llegaban en 1000 justas), y el merge/preview marcaba como
   * "subes" fantasma ítems locales que SÍ existían en la nube.
   */
  private async pullAll(
    table: string,
    desde?: { columna: string; sello: string },
  ): Promise<Record<string, unknown>[]> {
    if (!this.client) throw new Error('Nube no configurada');
    const PAGE = 1000;
    const orderCols = CloudStorageService.PULL_ORDER[table] ?? ['id'];
    const todas: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = this.client.from(table).select('*');
      if (desde) query = query.gt(desde.columna, desde.sello);
      for (const col of orderCols) query = query.order(col, { ascending: true });
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) throw error;
      const pagina = (data ?? []) as Record<string, unknown>[];
      todas.push(...pagina);
      if (pagina.length < PAGE) break; // página corta ⇒ era la última
    }
    return todas;
  }

  /**
   * Cursor del pull incremental de LOGS (en memoria, por sesión: el primer pull
   * tras abrir la app siempre es completo). Ver sync/logCursor.ts para el porqué.
   */
  private logsCursor: string | null = null;

  protected async pullRemote(): Promise<RawDatasets> {
    if (!this.client) throw new Error('Nube no configurada');
    // Paginado vía pullAll (no select('*') directo): ver comentario del helper.
    // `logs` es la única tabla que se baja INCREMENTALMENTE: es un registro de
    // auditoría (solo se agrega, nunca se edita ni se borra) y pesaba el 63% del
    // pull. Las demás siguen completas a propósito: professor_subjects y
    // academic_load alimentan el delete-loop de pushRemote (`vistoEnPull`), que
    // borra por AUSENCIA y necesita el set entero; professors, subjects y
    // schedule_blocks alimentan el preview de sincronización, que marcaría todo
    // lo local como "subes" si el remoto llegara parcial.
    const [profRows, subjRows, linkRows, loadRows, blockRows, logRows] = await Promise.all([
      this.pullAll('professors'),
      this.pullAll('subjects'),
      this.pullAll('professor_subjects'),
      this.pullAll('academic_load'),
      this.pullAll('schedule_blocks'),
      this.pullAll(
        'logs',
        this.logsCursor ? { columna: 'timestamp', sello: this.logsCursor } : undefined,
      ),
    ]);
    this.logsCursor = nextLogCursor(logRows as unknown as { timestamp?: string }[], this.logsCursor);
    const links = linkRows as unknown as LinkRow[];
    const subjectsByProf = new Map<string, string[]>();
    const profsBySubject = new Map<string, string[]>();
    for (const l of links) {
      if (!subjectsByProf.has(l.professor_id)) subjectsByProf.set(l.professor_id, []);
      subjectsByProf.get(l.professor_id)!.push(l.subject_code);
      if (!profsBySubject.has(l.subject_code)) profsBySubject.set(l.subject_code, []);
      profsBySubject.get(l.subject_code)!.push(l.professor_id);
    }
    // Vínculos M:N sin orden semántico: se ordenan para que comparen igual que
    // lo local (SyncStorageBase también los ordena al sellar; ver normProfessor).
    // Sin esto, el orden de tabla vs. el de inserción local daba contenido
    // "distinto" eterno en empate de sello ("subes" fantasma).
    for (const arr of subjectsByProf.values()) arr.sort();
    for (const arr of profsBySubject.values()) arr.sort();

    // Claves vistas en ESTE pull: el delete-loop de pushRemote solo puede
    // borrar filas que existían aquí (mitigación de la carrera; ver vistoEnPull).
    this.vistoEnPull = {
      links: new Set(links.map((l) => `${l.professor_id} ${l.subject_code}`)),
      carga: new Set(
        (loadRows as unknown as LoadRow[]).map(
          (r) => `${r.subject_code} ${r.professor_id} ${r.role}`,
        ),
      ),
    };

    const professors: SProfessor[] = (profRows as unknown as ProfRow[]).map((r) => ({
      id: r.id,
      fullName: r.full_name,
      title: r.title as Professor['title'],
      email: r.email ?? undefined,
      cedula: r.cedula ?? undefined,
      profession: r.profession ?? undefined,
      type: r.type as Professor['type'],
      subjects: subjectsByProf.get(r.id) ?? [],
      // normalizarSello: PostgREST devuelve '+00:00' y lo local sella con 'Z';
      // sin normalizar, la comparación lexicográfica ve "distinto" el mismo instante.
      updatedAt: normalizarSello(r.updated_at),
      deletedAt: normalizarSello(r.deleted_at),
      updatedBy: r.updated_by ?? undefined,
    }));

    const bySem = new Map<number, SSubject[]>();
    for (const r of subjRows as unknown as SubjRow[]) {
      const sub: SSubject = {
        code: r.code,
        name: r.name,
        credits: r.credits ?? 0,
        hasLab: !!r.has_lab,
        hoursTheory: r.hours_theory ?? 0,
        hoursLab: r.hours_lab ?? 0,
        prerequisites: r.prerequisites ?? [],
        professors: profsBySubject.get(r.code) ?? [],
        labNumber: r.lab_number ?? undefined,
        aula: r.aula ?? undefined,
        updatedAt: normalizarSello(r.updated_at),
        deletedAt: normalizarSello(r.deleted_at),
        updatedBy: r.updated_by ?? undefined,
      };
      const n = r.semester ?? 1;
      if (!bySem.has(n)) bySem.set(n, []);
      bySem.get(n)!.push(sub);
    }
    const pensum: SSemester[] = [...bySem.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([number, subjects]) => ({ number, subjects }));

    const academicLoad: Record<string, SLoadVal> = {};
    for (const r of loadRows as unknown as LoadRow[]) {
      if (!academicLoad[r.subject_code]) academicLoad[r.subject_code] = { theory: [], lab: [] };
      const entry = academicLoad[r.subject_code];
      if (r.role === 'lab') entry.lab!.push(r.professor_id);
      else entry.theory!.push(r.professor_id);
      // El contenedor hereda el sello (y su atribución) de la fila más
      // reciente (normalizado a 'Z' para comparar formatos iguales).
      const ts = normalizarSello(r.updated_at);
      if (ts && (!entry.updatedAt || ts > entry.updatedAt)) {
        entry.updatedAt = ts;
        entry.updatedBy = r.updated_by ?? undefined;
      }
    }

    const scheduleBlocks: SBlock[] = (blockRows as unknown as BlockRow[]).map((r) => ({
      id: r.id,
      subjectCode: r.subject_code ?? '',
      semester: r.semester ?? undefined,
      day: r.day,
      startHour: r.start_hour,
      duration: r.duration,
      color: r.color ?? '',
      type: (r.type as SBlock['type']) ?? undefined,
      professorId: r.professor_id ?? undefined,
      section: r.section ?? undefined,
      labGroupId: r.lab_group_id ?? undefined,
      aula: r.aula ?? undefined,
      updatedAt: normalizarSello(r.updated_at),
      deletedAt: normalizarSello(r.deleted_at),
      updatedBy: r.updated_by ?? undefined,
    }));

    const logs: SLog[] = (logRows as unknown as LogRow[]).map((r) => ({
      id: r.id,
      action: r.action,
      details: r.details ?? '',
      timestamp: r.timestamp ?? this.now(),
      updatedAt: normalizarSello(r.updated_at),
      deletedAt: normalizarSello(r.deleted_at),
    }));

    return { professors, pensum, scheduleBlocks, academicLoad, logs };
  }
}
