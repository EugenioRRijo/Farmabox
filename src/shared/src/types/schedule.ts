import { DayOfWeek } from './common';

/**
 * Schedule-related types
 */

export interface ScheduleBlock {
  id: string;
  day: DayOfWeek;
  startTime: string; // Format: "HH:mm" (24h)
  endTime: string; // Format: "HH:mm" (24h)
  subjectId: string;
  subjectName: string;
  classroomId: string;
  classroomName: string;
  professorId: string;
  professorName: string;
}

export interface CollisionResult {
  hasCollision: boolean;
  conflictingBlocks: ScheduleBlock[];
  reason?: string;
}
