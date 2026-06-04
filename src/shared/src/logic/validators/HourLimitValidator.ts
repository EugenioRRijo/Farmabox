import {
  IScheduleValidator,
  ValidatableBlock,
  ValidationContext,
  ValidationResult,
} from './IScheduleValidator';

/**
 * HourLimitValidator — Single Responsibility: validates hour limits only.
 *
 * Ensures the total scheduled hours for a subject+type don't exceed the
 * allowed limit defined in the pensum (hoursTheory / hoursLab).
 */
export class HourLimitValidator implements IScheduleValidator {
  readonly name = 'HourLimitValidator';

  validate(
    newBlock: ValidatableBlock,
    existingBlocks: ValidatableBlock[],
    context: ValidationContext,
  ): ValidationResult {
    if (!context.subject) {
      return { isValid: true }; // Can't validate without subject info
    }

    const { assignmentType, subject, section } = context;
    const limit = assignmentType === 'THEORY' ? subject.hoursTheory : subject.hoursLab;

    // Sum existing hours for this subject + type + section
    const currentHours = existingBlocks
      .filter(
        (b) =>
          b.subjectCode === newBlock.subjectCode &&
          (b.section === section || (!b.section && section === 'A')) &&
          (assignmentType === 'THEORY'
            ? b.type === 'THEORY' || !b.type
            : b.type === 'LAB'),
      )
      .reduce((acc, b) => acc + b.duration, 0);

    if (currentHours + newBlock.duration > limit) {
      const typeName = assignmentType === 'THEORY' ? 'Teoría' : 'Laboratorio';
      return {
        isValid: false,
        errorMessage:
          `Límite de horas excedido. ${subject.name} tiene ${limit} horas de ${typeName}. ` +
          `Llevas ${currentHours} + ${newBlock.duration} nuevas.`,
      };
    }

    return { isValid: true };
  }
}
