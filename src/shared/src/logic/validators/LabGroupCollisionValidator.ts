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
 * ### Collision Rules (room-based):
 * A laboratory is a single physical room (`labNumber` / "salón"). Two labs may run at
 * the same time as long as they use DIFFERENT rooms.
 * - Lab vs Lab (SAME subject, different groups) → ✅ ALLOWED (rotation, same room)
 * - Lab vs Lab (DIFFERENT subject, DIFFERENT room) → ✅ ALLOWED (distinct rooms)
 * - Lab vs Lab (DIFFERENT subject, SAME room) → ❌ COLLISION (room double-booked)
 * - Lab vs Lab (DIFFERENT subject, room unknown on either side) → ✅ ALLOWED (can't prove a clash)
 * - Lab vs Theory (any subject) → ✅ ALLOWED
 *
 * Scope: this add-time check looks at the CURRENT section only. Cross-section /
 * cross-semester room clashes surface in the Collisions report.
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

    const { section, subjectRooms = {} } = context;
    const norm = (room?: string) => (room ?? '').trim().toLowerCase();

    // Room of the new block: prefer the subject in context, fall back to the rooms map.
    const rawNewRoom = context.subject?.labNumber ?? subjectRooms[newBlock.subjectCode];
    const newRoom = norm(rawNewRoom);

    // Find all blocks on the same day & section that overlap with the new block
    const collidingBlocks = existingBlocks.filter(
      (b) =>
        b.day === newBlock.day &&
        (b.section === section || (!b.section && section === 'A')) &&
        blocksOverlap(newBlock, b),
    );

    for (const existing of collidingBlocks) {
      // SAME lab subject (rotation groups, same room) → ALLOWED
      if (existing.type === 'LAB' && existing.subjectCode === newBlock.subjectCode) {
        continue;
      }

      // We ONLY care about other LAB blocks
      if (existing.type !== 'LAB') {
        continue;
      }

      // DIFFERENT lab subjects collide ONLY if they share the SAME physical room.
      // If either room is unknown (empty), we can't prove a clash → allow.
      const existingRoom = norm(subjectRooms[existing.subjectCode]);
      if (newRoom && existingRoom && newRoom === existingRoom) {
        return {
          isValid: false,
          errorMessage:
            `Choque de laboratorio: el salón "${(rawNewRoom ?? '').trim()}" ya está ocupado a esta hora por otra materia.`,
        };
      }
    }

    return { isValid: true };
  }
}
