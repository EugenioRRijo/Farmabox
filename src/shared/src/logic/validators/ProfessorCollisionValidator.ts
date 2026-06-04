import {
  IScheduleValidator,
  ValidatableBlock,
  ValidationContext,
  ValidationResult,
} from './IScheduleValidator';
import { blocksOverlap } from './utils';

/**
 * ProfessorCollisionValidator — Single Responsibility: validates professor availability.
 *
 * A professor cannot be assigned to two blocks at the same time,
 * regardless of section or semester. This is a GLOBAL check across
 * ALL schedule blocks (not just the current semester's filtered blocks).
 */
export class ProfessorCollisionValidator implements IScheduleValidator {
  readonly name = 'ProfessorCollisionValidator';

  validate(
    newBlock: ValidatableBlock,
    existingBlocks: ValidatableBlock[],
    _context: ValidationContext,
  ): ValidationResult {
    if (!newBlock.professorId) {
      return { isValid: true }; // No professor assigned, nothing to check
    }

    const collision = existingBlocks.find(
      (b) =>
        b.id !== newBlock.id &&
        b.professorId === newBlock.professorId &&
        b.day === newBlock.day &&
        blocksOverlap(newBlock, b),
    );

    if (collision) {
      return {
        isValid: false,
        errorMessage:
          'El profesor ya tiene una clase asignada en este mismo horario (choque de horario para el profesor).',
      };
    }

    return { isValid: true };
  }
}
