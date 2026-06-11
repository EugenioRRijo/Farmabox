import { useCallback } from 'react';
import {
  HourLimitValidator,
  LabGroupCollisionValidator,
  ProfessorCollisionValidator,
  TheoryCollisionValidator,
  ValidationContext,
  ValidationResult,
  ValidatableBlock,
} from '../../../shared/src/logic/validators';
import { ScheduleBlock } from '@/types/schedule';
import { PensumSubject } from '../../../shared/src/index';

/**
 * useScheduleValidation — Dependency Inversion hook.
 *
 * ScheduleBuilder depends on this abstraction (hook return type) rather
 * than concrete validator classes. The hook assembles and configures
 * the validator chain internally.
 */
export function useScheduleValidation() {

  /**
   * Validate a proposed new block against all rules.
   *
   * @param newBlock - Proposed block to add
   * @param currentSemesterBlocks - Blocks in the current semester/section (for hour limits & section collisions)
   * @param allBlocks - All blocks globally (for professor collision check)
   * @param subject - The subject being scheduled
   * @param assignmentType - THEORY or LAB
   * @param section - Current section letter
   * @param professorId - Optional professor ID
   */
  const validateBlock = useCallback(
    (params: {
      newBlock: Omit<ScheduleBlock, 'id' | 'color'> & { id?: string };
      currentSemesterBlocks: ScheduleBlock[];
      allBlocks: ScheduleBlock[];
      subject: PensumSubject;
      assignmentType: 'THEORY' | 'LAB';
      section: string;
      professorId?: string;
      labGroupId?: string;
      subjectRooms?: Record<string, string>;
    }): ValidationResult => {
      const {
        newBlock,
        currentSemesterBlocks,
        allBlocks,
        subject,
        assignmentType,
        section,
        professorId,
        labGroupId,
        subjectRooms,
      } = params;

      const validatableBlock: ValidatableBlock = {
        id: newBlock.id || '',
        subjectCode: newBlock.subjectCode,
        day: newBlock.day,
        startHour: newBlock.startHour,
        duration: newBlock.duration,
        type: assignmentType,
        professorId: professorId,
        section: section,
        labGroupId: labGroupId,
      };

      const context: ValidationContext = {
        subject: {
          code: subject.code,
          name: subject.name,
          hoursTheory: subject.hoursTheory,
          hoursLab: subject.hoursLab,
          labNumber: subject.labNumber,
        },
        assignmentType,
        section,
        labGroupId,
        subjectRooms,
      };

      // Hour limit + section collision checks use semester blocks
      const sectionBlocks: ValidatableBlock[] = currentSemesterBlocks.map(
        (b) => ({
          id: b.id,
          subjectCode: b.subjectCode,
          day: b.day,
          startHour: b.startHour,
          duration: b.duration,
          type: b.type,
          professorId: b.professorId,
          section: b.section,
          labGroupId: b.labGroupId,
        }),
      );

      // First run hour limit + collision validators against semester blocks
      const hourLimitResult = new HourLimitValidator().validate(
        validatableBlock,
        sectionBlocks,
        context,
      );
      if (!hourLimitResult.isValid) return hourLimitResult;

      // Run theory collision validator against semester blocks
      const theoryResult = new TheoryCollisionValidator().validate(
        validatableBlock,
        sectionBlocks,
        context,
      );
      if (!theoryResult.isValid) return theoryResult;

      // Run lab collision validator against semester blocks
      const labResult = new LabGroupCollisionValidator().validate(
        validatableBlock,
        sectionBlocks,
        context,
      );
      if (!labResult.isValid) return labResult;

      // Professor collision check uses ALL blocks globally
      const allValidatableBlocks: ValidatableBlock[] = allBlocks.map((b) => ({
        id: b.id,
        subjectCode: b.subjectCode,
        day: b.day,
        startHour: b.startHour,
        duration: b.duration,
        type: b.type,
        professorId: b.professorId,
        section: b.section,
        labGroupId: b.labGroupId,
      }));

      const profResult = new ProfessorCollisionValidator().validate(
        validatableBlock,
        allValidatableBlocks,
        context,
      );
      if (!profResult.isValid) return profResult;

      return { isValid: true };
    },
    [],
  );

  return { validateBlock };
}
