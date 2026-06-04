// Barrel export for all services
export { LoggerService, type LogLevel, type LogEntry } from './LoggerService';
export {
  ProfessorService,
  type CreateProfessorDTO,
  type UpdateProfessorDTO,
} from './ProfessorService';
export {
  ClassroomService,
  type CreateClassroomDTO,
  type UpdateClassroomDTO,
} from './ClassroomService';
export { SubjectService, type CreateSubjectDTO, type UpdateSubjectDTO } from './SubjectService';
export {
  ScheduleService,
  type CreateScheduleBlockDTO,
  type UpdateScheduleBlockDTO,
} from './ScheduleService';
