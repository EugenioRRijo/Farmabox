import {
  IScheduleValidator,
  ValidatableBlock,
  ValidationContext,
  ValidationResult,
} from './IScheduleValidator';

/**
 * CompositeScheduleValidator — Open/Closed Principle orchestrator.
 *
 * Holds a list of IScheduleValidator implementations and executes them
 * in sequence. Returns on the first failure. New rules can be added by
 * pushing a new validator — no existing code needs modification.
 *
 * This is a variant of the Chain of Responsibility pattern.
 */
export class CompositeScheduleValidator implements IScheduleValidator {
  readonly name = 'CompositeScheduleValidator';

  private readonly validators: IScheduleValidator[];

  constructor(validators: IScheduleValidator[]) {
    this.validators = validators;
  }

  validate(
    newBlock: ValidatableBlock,
    existingBlocks: ValidatableBlock[],
    context: ValidationContext,
  ): ValidationResult {
    for (const validator of this.validators) {
      const result = validator.validate(newBlock, existingBlocks, context);
      if (!result.isValid) {
        return result;
      }
    }

    return { isValid: true };
  }

  /** Add a validator at runtime (Open/Closed) */
  addValidator(validator: IScheduleValidator): void {
    this.validators.push(validator);
  }
}
