/**
 * ipcHandlers — Registro de todos los canales IPC del proceso principal.
 *
 * Mapea 'dominio:operacion' → método del servicio de dominio correspondiente.
 * Cada handler usa ipcMain.handle (respuesta Promise) y devuelve la envoltura
 * { data } | { error }. Llamar una sola vez desde main.ts.
 *
 * NOTA: los canales de sincronización en la nube (supabase:*) se añadirán en la
 * Fase 2 junto con CloudStorageService/SupabaseKeepaliveService.
 */
import { ipcMain, app } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import log from 'electron-log';
import type { Professor } from '@scheduler/shared';
import type { PensumSubject } from '@scheduler/shared';
import type { IStorageService } from '../services/IStorageService';
import type { ProfessorService } from '../services/ProfessorService';
import type { SubjectService } from '../services/SubjectService';
import type { ScheduleService } from '../services/ScheduleService';
import type { LogService } from '../services/LogService';
import type { AcademicLoad, ScheduleBlockData, RestorePayload } from '../types';
import { GeminiService } from '../services/GeminiService';
import type { ChatMessage } from '../services/GeminiService';
import { buildChatContext, localFallback } from '../chat/context';

export interface AppServices {
  storageService: IStorageService;
  professorService: ProfessorService;
  subjectService: SubjectService;
  scheduleService: ScheduleService;
  logService: LogService;
}

type SubjectCreateInput = Partial<PensumSubject> & {
  code: string;
  name: string;
  semester: number | string;
};

export function registerIpcHandlers(services: AppServices): void {
  const { professorService, subjectService, scheduleService, logService, storageService } = services;
  const gemini = new GeminiService();

  // ── App ────────────────────────────────────────────────────────────────
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getDataPath', () => storageService.getDataDir());

  // ── Professors ─────────────────────────────────────────────────────────
  ipcMain.handle('professors:getAll', () => {
    try {
      return { data: professorService.getAll() };
    } catch (err) {
      log.error('[IPC professors:getAll]', err);
      return { error: 'Error loading professors' };
    }
  });
  ipcMain.handle('professors:create', (_e: IpcMainInvokeEvent, data: Partial<Professor>) => {
    try {
      return { data: professorService.create(data) };
    } catch (err) {
      log.error('[IPC professors:create]', err);
      return { error: 'Error creating professor' };
    }
  });
  ipcMain.handle('professors:update', (_e: IpcMainInvokeEvent, id: string, data: Partial<Professor>) => {
    try {
      const result = professorService.update(id, data);
      if (!result) return { error: 'Professor not found' };
      return { data: result };
    } catch (err) {
      log.error('[IPC professors:update]', err);
      return { error: 'Error updating professor' };
    }
  });
  ipcMain.handle('professors:delete', (_e: IpcMainInvokeEvent, id: string) => {
    try {
      const ok = professorService.delete(id);
      if (!ok) return { error: 'Professor not found' };
      return { data: { success: true } };
    } catch (err) {
      log.error('[IPC professors:delete]', err);
      return { error: 'Error deleting professor' };
    }
  });
  ipcMain.handle('professors:reset', () => {
    try {
      return { data: professorService.reset() };
    } catch (err) {
      log.error('[IPC professors:reset]', err);
      return { error: 'Error resetting professors' };
    }
  });

  // ── Subjects ───────────────────────────────────────────────────────────
  ipcMain.handle('subjects:getAll', () => {
    try {
      return { data: subjectService.getAll() };
    } catch (err) {
      log.error('[IPC subjects:getAll]', err);
      return { error: 'Error loading subjects' };
    }
  });
  ipcMain.handle('subjects:create', (_e: IpcMainInvokeEvent, data: SubjectCreateInput) => {
    try {
      const result = subjectService.create(data);
      if ('error' in result) return result;
      return { data: result };
    } catch (err) {
      log.error('[IPC subjects:create]', err);
      return { error: 'Error adding subject' };
    }
  });
  ipcMain.handle('subjects:update', (_e: IpcMainInvokeEvent, code: string, data: Partial<PensumSubject>) => {
    try {
      const result = subjectService.update(code, data);
      if (!result) return { error: 'Subject not found' };
      return { data: result };
    } catch (err) {
      log.error('[IPC subjects:update]', err);
      return { error: 'Error updating subject' };
    }
  });
  ipcMain.handle('subjects:delete', (_e: IpcMainInvokeEvent, code: string) => {
    try {
      const ok = subjectService.delete(code);
      if (!ok) return { error: 'Subject not found' };
      return { data: { success: true } };
    } catch (err) {
      log.error('[IPC subjects:delete]', err);
      return { error: 'Error deleting subject' };
    }
  });
  ipcMain.handle(
    'subjects:updateProfessors',
    (_e: IpcMainInvokeEvent, subjectCode: string, professorIds: string[]) => {
      try {
        subjectService.updateProfessors(subjectCode, professorIds);
        return { data: { success: true } };
      } catch (err) {
        log.error('[IPC subjects:updateProfessors]', err);
        return { error: 'Error updating subject professors' };
      }
    },
  );
  ipcMain.handle('subjects:resetPensum', () => {
    try {
      return { data: subjectService.resetPensum() };
    } catch (err) {
      log.error('[IPC subjects:resetPensum]', err);
      return { error: 'Error resetting pensum' };
    }
  });

  // ── Schedule Blocks ────────────────────────────────────────────────────
  ipcMain.handle('schedule:getBlocks', () => {
    try {
      return { data: scheduleService.getBlocks() };
    } catch (err) {
      log.error('[IPC schedule:getBlocks]', err);
      return { error: 'Error loading schedule blocks' };
    }
  });
  ipcMain.handle('schedule:saveBlocks', (_e: IpcMainInvokeEvent, blocks: ScheduleBlockData[]) => {
    try {
      scheduleService.saveBlocks(blocks);
      return { data: { success: true } };
    } catch (err) {
      log.error('[IPC schedule:saveBlocks]', err);
      return { error: 'Error saving schedule blocks' };
    }
  });

  // ── Academic Load ──────────────────────────────────────────────────────
  ipcMain.handle('schedule:getLoad', () => {
    try {
      return { data: scheduleService.getAcademicLoad() };
    } catch (err) {
      log.error('[IPC schedule:getLoad]', err);
      return { error: 'Error loading academic load' };
    }
  });
  ipcMain.handle('schedule:saveLoad', (_e: IpcMainInvokeEvent, load: AcademicLoad) => {
    try {
      scheduleService.saveAcademicLoad(load);
      return { data: { success: true } };
    } catch (err) {
      log.error('[IPC schedule:saveLoad]', err);
      return { error: 'Error saving academic load' };
    }
  });

  // ── Logs ───────────────────────────────────────────────────────────────
  ipcMain.handle('logs:getAll', () => {
    try {
      return { data: logService.getAll() };
    } catch (err) {
      log.error('[IPC logs:getAll]', err);
      return { error: 'Error loading logs' };
    }
  });
  ipcMain.handle('logs:create', (_e: IpcMainInvokeEvent, action: string, details: string) => {
    try {
      return { data: logService.create(action, details) };
    } catch (err) {
      log.error('[IPC logs:create]', err);
      return { error: 'Error creating log' };
    }
  });

  // ── System / Restore ───────────────────────────────────────────────────
  ipcMain.handle('system:restore', (_e: IpcMainInvokeEvent, payload: RestorePayload) => {
    try {
      if (payload.professors) storageService.saveProfessors(payload.professors);
      if (payload.pensum) storageService.savePensum(payload.pensum);
      if (payload.academicLoad) storageService.saveAcademicLoad(payload.academicLoad);
      if (payload.scheduleBlocks) storageService.saveScheduleBlocks(payload.scheduleBlocks);
      logService.create(
        'Restauración de Sistema',
        'Se ha restaurado una copia de seguridad completa del sistema.',
      );
      return { data: { success: true, message: 'System restored successfully' } };
    } catch (err) {
      log.error('[IPC system:restore]', err);
      return { error: 'Error restoring system data' };
    }
  });

  // ── Chat / Asistente IA (Gemini con fallback offline) ────────────────────
  ipcMain.handle('chat:send', async (_e: IpcMainInvokeEvent, messages: ChatMessage[]) => {
    const safeMessages = Array.isArray(messages) ? messages : [];
    try {
      const context = buildChatContext(storageService);
      const reply = await gemini.chat(safeMessages, context);
      return { data: { reply, offline: false } };
    } catch (err) {
      log.warn('[IPC chat:send] Gemini no disponible, usando fallback local:', err);
      const reply = localFallback(safeMessages, storageService);
      return { data: { reply, offline: true } };
    }
  });

  log.info('[ipcHandlers] All IPC channels registered successfully.');
}
