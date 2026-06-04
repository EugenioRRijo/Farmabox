import { ValidatableBlock } from './IScheduleValidator';

/**
 * Utility functions shared across validators.
 * Extracted to avoid duplication (DRY + Single Responsibility).
 */

/**
 * Checks if two blocks on the SAME day overlap in time.
 * Uses the standard overlap formula: (StartA < EndB) AND (StartB < EndA)
 */
export function blocksOverlap(a: ValidatableBlock, b: ValidatableBlock): boolean {
  const aEnd = a.startHour + a.duration;
  const bEnd = b.startHour + b.duration;
  return a.startHour < bEnd && b.startHour < aEnd;
}
