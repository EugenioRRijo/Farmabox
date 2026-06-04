/**
 * IScheduleValidator — Interface for schedule validation rules (SOLID: Interface Segregation)
 *
 * Each validator implements a single validation concern (Single Responsibility).
 * New validation rules can be added by creating new implementations (Open/Closed).
 * All validators are interchangeable through this interface (Liskov Substitution).
 */

export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Context object passed to validators with all the information they might need.
 * This avoids validators needing to know about the entire application state.
 */
export interface ValidationContext {
  /** The subject being scheduled */
  subject?: {
    code: string;
    name: string;
    hoursTheory: number;
    hoursLab: number;
    labNumber?: string;
  };
  /** Type of assignment: THEORY or LAB */
  assignmentType: 'THEORY' | 'LAB';
  /** Currently selected section */
  section: string;
  /** Optional lab group id for rotation tracking */
  labGroupId?: string;
}

/**
 * A schedule block as used by validators.
 * Minimal shape to avoid coupling to specific frontend/backend types.
 */
export interface ValidatableBlock {
  id: string;
  subjectCode: string;
  day: number;
  startHour: number;
  duration: number;
  type?: 'THEORY' | 'LAB';
  professorId?: string;
  section?: string;
  labGroupId?: string;
}

/**
 * Single Responsibility: Each validator checks exactly ONE rule.
 * Open/Closed: Add new validators without modifying existing ones.
 * Liskov Substitution: Any IScheduleValidator can replace another.
 */
export interface IScheduleValidator {
  /** Human-readable name for debug/logging */
  readonly name: string;

  /**
   * Validate whether a proposed new block is allowed given existing blocks.
   *
   * @param newBlock - The block being proposed
   * @param existingBlocks - All currently placed blocks (may include blocks from other semesters/sections)
   * @param context - Additional context for the validation
   * @returns ValidationResult indicating pass/fail with optional error message
   */
  validate(
    newBlock: ValidatableBlock,
    existingBlocks: ValidatableBlock[],
    context: ValidationContext,
  ): ValidationResult;
}
