import {
  IScheduleValidator,
  ValidatableBlock,
  ValidationContext,
  ValidationResult,
} from './IScheduleValidator';
import { blocksOverlap } from './utils';

/**
 * TheoryCollisionValidator — Single Responsibility: validates theory block collisions only.
 *
 * Theory blocks cannot overlap with ANY other block in the same section.
 * This validator only fires when the new block is THEORY type.
 */
export class TheoryCollisionValidator implements IScheduleValidator {
  readonly name = 'TheoryCollisionValidator';

  validate(
    newBlock: ValidatableBlock,
    existingBlocks: ValidatableBlock[],
    context: ValidationContext,
  ): ValidationResult {
    if (context.assignmentType !== 'THEORY') {
      return { isValid: true }; // Not our responsibility
    }

    const { section } = context;

    const collision = existingBlocks.find(
      (b) =>
        b.type === 'THEORY' &&
        b.day === newBlock.day &&
        (b.section === section || (!b.section && section === 'A')) &&
        blocksOverlap(newBlock, b),
    );

    if (collision) {
      return {
        isValid: false,
        errorMessage: 'Choque de horario ocupado. No permitido para Teoría.',
      };
    }

    return { isValid: true };
  }
}
