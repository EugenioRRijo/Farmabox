// Barrel export for all types
export * from './types';

// Barrel export for all services
export * from './services';

// Barrel export for logic
export { StrictCollisionValidator } from './logic/StrictCollisionValidator';
export * from './adapters/interfaces';

// Data exports
export { PENSUM_DATA } from './data/pensumData';
export type { PensumSubject, Semester } from './data/pensumData';
export { PROFESSORS_DATA, getProfessorsBySubject, getSubjectsByProfessor } from './data/professorsData';
export type { Professor } from './data/professorsData';
