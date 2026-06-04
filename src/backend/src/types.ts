/**
 * Shared types for the backend API
 */

export interface AcademicLoad {
  [subjectCode: string]: {
    theory?: string[]; // professorId for theory
    lab?: string[];    // professorId for lab
  };
}

export interface ScheduleBlockData {
  id: string;
  subjectCode: string;
  day: number; // 0=Mon, 1=Tue...
  startHour: number;
  duration: number;
  color: string;
  type?: 'THEORY' | 'LAB';
  professorId?: string;
  section?: string;
  labGroupId?: string;
}

export interface SectionCourseInfo {
  theoryProfessor: string;
  practiceProfessor: string;
  laboratoryNumber: string;
  classroom?: string;
}

export interface CourseInfoData {
  [section: string]: {
    [subjectCode: string]: SectionCourseInfo;
  };
}
