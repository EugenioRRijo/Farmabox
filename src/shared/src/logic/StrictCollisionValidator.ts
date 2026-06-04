import { ScheduleBlock, CollisionResult } from '../types';

/**
 * Strict Collision Validator
 * Implements ZERO-TOLERANCE policy for schedule overlaps.
 *
 * Business Rule:
 * NO SE PERMITEN SOLAPAMIENTOS NI SIQUIERA DE 1 MINUTO.
 * Si una clase termina a las 10:00, la siguiente NO puede empezar antes de las 10:00.
 */
export class StrictCollisionValidator {
  /**
   * Validates if a new schedule block collides with existing blocks.
   *
   * @param newBlock - The block to validate
   * @param existingBlocks - All existing schedule blocks
   * @returns CollisionResult indicating if there's a collision
   */
  static validate(newBlock: ScheduleBlock, existingBlocks: ScheduleBlock[]): CollisionResult {
    const conflicts: ScheduleBlock[] = [];

    for (const block of existingBlocks) {
      // Skip if it's the same block (for updates)
      if (block.id === newBlock.id) continue;

      // Check 1: Must be same day
      if (block.day !== newBlock.day) continue;

      // Check 2: Collision by ROOM
      const roomCollision = this.checkResourceCollision(newBlock, block, 'classroomId');

      // Check 3: Collision by PROFESSOR
      const profCollision = this.checkResourceCollision(newBlock, block, 'professorId');

      if (roomCollision || profCollision) {
        conflicts.push(block);
      }
    }

    if (conflicts.length > 0) {
      return {
        hasCollision: true,
        conflictingBlocks: conflicts,
        reason: `Política de Tolerancia Cero violada: ${conflicts.length} colisión(es) detectada(s)`,
      };
    }

    return {
      hasCollision: false,
      conflictingBlocks: [],
    };
  }

  /**
   * Check if two blocks collide on a specific resource (room or professor)
   */
  private static checkResourceCollision(
    blockA: ScheduleBlock,
    blockB: ScheduleBlock,
    resource: 'classroomId' | 'professorId',
  ): boolean {
    // Different resources = no collision
    if (blockA[resource] !== blockB[resource]) return false;

    // Same resource, check time overlap
    // Overlap formula: (StartA < EndB) AND (EndA > StartB)
    return blockA.startTime < blockB.endTime && blockA.endTime > blockB.startTime;
  }

  /**
   * Validates a time format (HH:mm)
   */
  static isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return timeRegex.test(time);
  }

  /**
   * Validates that endTime > startTime
   */
  static isValidTimeRange(startTime: string, endTime: string): boolean {
    return startTime < endTime;
  }
}
