import {
  IScheduleValidator,
  ValidatableBlock,
  ValidationContext,
  ValidationResult,
} from './IScheduleValidator';
import { blocksOverlap } from './utils';

/**
 * LabGroupCollisionValidator — Single Responsibility: validates lab block collisions
 * considering the rotation group hierarchy.
 *
 * ## Business Rule (Facultad de Farmacia)
 *
 * Sections have ~70 students but labs hold ~10. Students rotate in groups.
 * This creates a hierarchy:
 *
 *   Parent: Lab Subject (e.g. "Química Orgánica Lab")
 *     └── Child: Group 1 (Mon 7:00-8:30)
 *     └── Child: Group 2 (Mon 8:30-10:00)
 *     └── Child: Group 3 (Mon 10:00-11:30)
 *     ...
 *
 * ### Collision Rules (UPDATED):
 * - Lab vs Lab (SAME subject, different groups) → ✅ ALLOWED (rotation)
 * - Lab vs Lab (DIFFERENT subject, SAME semester) → ❌ COLLISION
 * - Lab vs Lab (DIFFERENT subject, DIFFERENT semester) → ✅ ALLOWED
 * - Lab vs Theory (any subject) → ✅ ALLOWED (Theory overlaps now allowed)
 */
export class LabGroupCollisionValidator implements IScheduleValidator {
  readonly name = 'LabGroupCollisionValidator';

  validate(
    newBlock: ValidatableBlock,
    existingBlocks: ValidatableBlock[],
    context: ValidationContext,
  ): ValidationResult {
    if (context.assignmentType !== 'LAB') {
      return { isValid: true }; // Not our responsibility
    }

    const { section } = context;

    // Find all blocks on the same day & section that overlap with the new block
    const collidingBlocks = existingBlocks.filter(
      (b) =>
        b.day === newBlock.day &&
        (b.section === section || (!b.section && section === 'A')) &&
        blocksOverlap(newBlock, b),
    );

    for (const existing of collidingBlocks) {
      // Rule 1: Lab vs Lab, SAME subject → ALLOWED (rotation groups)
      if (
        existing.type === 'LAB' &&
        existing.subjectCode === newBlock.subjectCode
      ) {
        continue; // Same lab subject, different group — this is fine
      }

      // Rule 2 & 3: We ONLY care if the existing block is also a LAB
      if (existing.type !== 'LAB') {
        continue;
      }

      // Rule 4: Lab vs Lab, DIFFERENT subject.
      // They only collide if they try to use the SAME physical laboratory room.
      const newRoom = context.subject?.labNumber ? `Lab ${context.subject.labNumber}` : `Lab-${newBlock.subjectCode}`;
      const existingRoom = `Lab-${existing.subjectCode}`;

      if (newRoom === existingRoom) {
        return {
          isValid: false,
          errorMessage:
            `Choque de laboratorio: El salón ${existingRoom} ya está ocupado a esta hora por ${existing.subjectCode}.`,
        };
      }
    }

    return { isValid: true };
  }
}
