import { describe, it, expect } from 'vitest';
import { StrictCollisionValidator } from './StrictCollisionValidator';
import { ScheduleBlock } from '../types';

describe('StrictCollisionValidator', () => {
  const createBlock = (overrides: Partial<ScheduleBlock>): ScheduleBlock => ({
    id: 'block-1',
    day: 'MON',
    startTime: '08:00',
    endTime: '10:00',
    subjectId: 'subj-1',
    subjectName: 'Matemáticas',
    classroomId: 'room-101',
    classroomName: 'Aula 101',
    professorId: 'prof-1',
    professorName: 'Dr. Pérez',
    ...overrides,
  });

  describe('Zero Tolerance Policy', () => {
    it('should BLOCK if classes overlap by even 1 minute (same room)', () => {
      const existing = createBlock({ startTime: '08:00', endTime: '10:00' });
      const newBlock = createBlock({
        id: 'block-2',
        startTime: '09:59', // Overlaps by 1 minute!
        endTime: '11:00',
      });

      const result = StrictCollisionValidator.validate(newBlock, [existing]);

      expect(result.hasCollision).toBe(true);
      expect(result.conflictingBlocks).toHaveLength(1);
    });

    it('should ALLOW if end time equals start time (exact boundary)', () => {
      const existing = createBlock({ startTime: '08:00', endTime: '10:00' });
      const newBlock = createBlock({
        id: 'block-2',
        startTime: '10:00', // Exactly at boundary
        endTime: '12:00',
      });

      const result = StrictCollisionValidator.validate(newBlock, [existing]);

      expect(result.hasCollision).toBe(false);
    });

    it('should detect collision by PROFESSOR (different rooms)', () => {
      const existing = createBlock({
        classroomId: 'room-101',
        professorId: 'prof-1',
      });
      const newBlock = createBlock({
        id: 'block-2',
        classroomId: 'room-102', // Different room
        professorId: 'prof-1', // Same professor!
        startTime: '08:30',
        endTime: '09:30',
      });

      const result = StrictCollisionValidator.validate(newBlock, [existing]);

      expect(result.hasCollision).toBe(true);
      expect(result.reason).toContain('Tolerancia Cero');
    });

    it('should NOT collide if different day', () => {
      const existing = createBlock({ day: 'MON' });
      const newBlock = createBlock({
        id: 'block-2',
        day: 'TUE', // Different day
      });

      const result = StrictCollisionValidator.validate(newBlock, [existing]);

      expect(result.hasCollision).toBe(false);
    });

    it('should allow updating the same block', () => {
      const existing = createBlock({ id: 'block-1' });
      const updated = createBlock({ id: 'block-1', endTime: '11:00' }); // Same ID

      const result = StrictCollisionValidator.validate(updated, [existing]);

      expect(result.hasCollision).toBe(false);
    });
  });

  describe('Time Validation', () => {
    it('should validate correct time format', () => {
      expect(StrictCollisionValidator.isValidTimeFormat('08:00')).toBe(true);
      expect(StrictCollisionValidator.isValidTimeFormat('23:59')).toBe(true);
    });

    it('should reject invalid time format', () => {
      expect(StrictCollisionValidator.isValidTimeFormat('25:00')).toBe(false);
      expect(StrictCollisionValidator.isValidTimeFormat('8:00')).toBe(false);
      expect(StrictCollisionValidator.isValidTimeFormat('08:60')).toBe(false);
    });

    it('should validate time range', () => {
      expect(StrictCollisionValidator.isValidTimeRange('08:00', '10:00')).toBe(true);
      expect(StrictCollisionValidator.isValidTimeRange('10:00', '08:00')).toBe(false);
    });
  });
});
