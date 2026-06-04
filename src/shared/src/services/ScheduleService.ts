import { ScheduleBlock, CollisionResult, DayOfWeek } from '../types';
import { StrictCollisionValidator } from '../logic/StrictCollisionValidator';
import { LoggerService } from './LoggerService';

/**
 * Schedule Block DTO for creation
 */
export interface CreateScheduleBlockDTO {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  subjectId: string;
  subjectName: string;
  classroomId: string;
  classroomName: string;
  professorId: string;
  professorName: string;
}

/**
 * Schedule Block DTO for updates
 */
export interface UpdateScheduleBlockDTO {
  day?: DayOfWeek;
  startTime?: string;
  endTime?: string;
  subjectId?: string;
  subjectName?: string;
  classroomId?: string;
  classroomName?: string;
  professorId?: string;
  professorName?: string;
}

/**
 * Schedule Service
 * Handles schedule block operations with STRICT collision validation.
 *
 * POLÍTICA DE TOLERANCIA CERO:
 * No se permiten solapamientos de ningún tipo.
 */
export class ScheduleService {
  private scheduleBlocks: Map<string, ScheduleBlock> = new Map();

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `block_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get all schedule blocks
   */
  async getAll(): Promise<ScheduleBlock[]> {
    LoggerService.debug('Getting all schedule blocks', 'ScheduleService');
    return Array.from(this.scheduleBlocks.values());
  }

  /**
   * Get schedule block by ID
   */
  async getById(id: string): Promise<ScheduleBlock | null> {
    LoggerService.debug(`Getting schedule block by ID: ${id}`, 'ScheduleService');
    return this.scheduleBlocks.get(id) ?? null;
  }

  /**
   * Get schedule blocks by day
   */
  async getByDay(day: DayOfWeek): Promise<ScheduleBlock[]> {
    return Array.from(this.scheduleBlocks.values()).filter((b) => b.day === day);
  }

  /**
   * Get schedule blocks by professor
   */
  async getByProfessor(professorId: string): Promise<ScheduleBlock[]> {
    return Array.from(this.scheduleBlocks.values()).filter((b) => b.professorId === professorId);
  }

  /**
   * Get schedule blocks by classroom
   */
  async getByClassroom(classroomId: string): Promise<ScheduleBlock[]> {
    return Array.from(this.scheduleBlocks.values()).filter((b) => b.classroomId === classroomId);
  }

  /**
   * Create a new schedule block with collision validation
   *
   * @throws Error if collision is detected (TOLERANCIA CERO)
   */
  async create(data: CreateScheduleBlockDTO): Promise<ScheduleBlock> {
    // Validate time format
    if (!StrictCollisionValidator.isValidTimeFormat(data.startTime)) {
      throw new Error(`Invalid start time format: ${data.startTime}. Expected HH:mm`);
    }
    if (!StrictCollisionValidator.isValidTimeFormat(data.endTime)) {
      throw new Error(`Invalid end time format: ${data.endTime}. Expected HH:mm`);
    }

    // Validate time range
    if (!StrictCollisionValidator.isValidTimeRange(data.startTime, data.endTime)) {
      throw new Error(`Invalid time range: ${data.startTime} must be before ${data.endTime}`);
    }

    const newBlock: ScheduleBlock = {
      id: this.generateId(),
      ...data,
    };

    // TOLERANCIA CERO: Validate collisions
    const existingBlocks = await this.getAll();
    const validationResult = StrictCollisionValidator.validate(newBlock, existingBlocks);

    if (validationResult.hasCollision) {
      const error = `COLISIÓN DETECTADA (Tolerancia Cero): ${validationResult.reason}`;
      LoggerService.error(error, 'ScheduleService', {
        newBlock,
        conflicts: validationResult.conflictingBlocks,
      });
      throw new Error(error);
    }

    this.scheduleBlocks.set(newBlock.id, newBlock);
    LoggerService.info(
      `Created schedule block: ${newBlock.subjectName} (${newBlock.day} ${newBlock.startTime}-${newBlock.endTime})`,
      'ScheduleService',
    );

    return newBlock;
  }

  /**
   * Update an existing schedule block with collision validation
   *
   * @throws Error if collision is detected (TOLERANCIA CERO)
   */
  async update(id: string, data: UpdateScheduleBlockDTO): Promise<ScheduleBlock | null> {
    const block = this.scheduleBlocks.get(id);
    if (!block) {
      LoggerService.warn(`Schedule block not found: ${id}`, 'ScheduleService');
      return null;
    }

    const updatedBlock: ScheduleBlock = {
      ...block,
      ...data,
    };

    // Validate times if they changed
    if (data.startTime && !StrictCollisionValidator.isValidTimeFormat(data.startTime)) {
      throw new Error(`Invalid start time format: ${data.startTime}. Expected HH:mm`);
    }
    if (data.endTime && !StrictCollisionValidator.isValidTimeFormat(data.endTime)) {
      throw new Error(`Invalid end time format: ${data.endTime}. Expected HH:mm`);
    }
    if (!StrictCollisionValidator.isValidTimeRange(updatedBlock.startTime, updatedBlock.endTime)) {
      throw new Error(
        `Invalid time range: ${updatedBlock.startTime} must be before ${updatedBlock.endTime}`,
      );
    }

    // TOLERANCIA CERO: Validate collisions
    const existingBlocks = await this.getAll();
    const validationResult = StrictCollisionValidator.validate(updatedBlock, existingBlocks);

    if (validationResult.hasCollision) {
      const error = `COLISIÓN DETECTADA (Tolerancia Cero): ${validationResult.reason}`;
      LoggerService.error(error, 'ScheduleService', {
        updatedBlock,
        conflicts: validationResult.conflictingBlocks,
      });
      throw new Error(error);
    }

    this.scheduleBlocks.set(id, updatedBlock);
    LoggerService.info(`Updated schedule block: ${id}`, 'ScheduleService');

    return updatedBlock;
  }

  /**
   * Delete a schedule block
   */
  async delete(id: string): Promise<boolean> {
    const existed = this.scheduleBlocks.has(id);
    if (existed) {
      this.scheduleBlocks.delete(id);
      LoggerService.info(`Deleted schedule block: ${id}`, 'ScheduleService');
    } else {
      LoggerService.warn(`Schedule block not found for deletion: ${id}`, 'ScheduleService');
    }
    return existed;
  }

  /**
   * Validate a block without saving (for preview)
   */
  async validateBlock(block: CreateScheduleBlockDTO): Promise<CollisionResult> {
    const tempBlock: ScheduleBlock = {
      id: 'temp_validation',
      ...block,
    };

    const existingBlocks = await this.getAll();
    return StrictCollisionValidator.validate(tempBlock, existingBlocks);
  }

  /**
   * Get weekly schedule organized by day
   */
  async getWeeklySchedule(): Promise<Record<DayOfWeek, ScheduleBlock[]>> {
    const blocks = await this.getAll();
    const weekly: Record<DayOfWeek, ScheduleBlock[]> = {
      MON: [],
      TUE: [],
      WED: [],
      THU: [],
      FRI: [],
      SAT: [],
      SUN: [],
    };

    for (const block of blocks) {
      weekly[block.day].push(block);
    }

    // Sort each day by start time
    for (const day of Object.keys(weekly) as DayOfWeek[]) {
      weekly[day].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    return weekly;
  }
}
