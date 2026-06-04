
export interface AcademicLoad {
    [subjectCode: string]: {
        theory?: string[]; // array of professorIds
        lab?: string[];    // array of professorIds
    };
}

export interface ScheduleBlock {
  id: string;
  subjectCode: string;
  day: number; // 0=Mon, 1=Tue...
  startHour: number; // 7, 8...
  duration: number; // in hours
  color: string;
  type?: 'THEORY' | 'LAB';
  professorId?: string;
  section?: string;
  labGroupId?: string;
}
