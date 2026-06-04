/**
 * Pensum Data for Facultad de Farmacia USM
 *
 * El pensum arranca VACÍO: las materias las carga el usuario desde la app
 * (sección Materias) y se guardan/sincronizan en Supabase.
 */

export interface PensumSubject {
  code: string;
  name: string;
  credits: number;
  hasLab: boolean;
  hoursTheory: number;
  hoursLab: number;
  prerequisites: string[];
  professors?: string[];
  labNumber?: string; // Número de laboratorio (ej: "104", "300")
}

export interface Semester {
  number: number;
  subjects: PensumSubject[];
}

/** Pensum semilla — vacío a propósito. El usuario carga sus materias. */
export const PENSUM_DATA: Semester[] = [];

/**
 * Helper function to get subjects by semester
 */
export function getSubjectsBySemester(semester: number): PensumSubject[] {
  const found = PENSUM_DATA.find((s) => s.number === semester);
  return found ? found.subjects : [];
}

/**
 * Helper function to get subject by code
 */
export function getSubjectByCode(code: string): PensumSubject | undefined {
  for (const semester of PENSUM_DATA) {
    const subject = semester.subjects.find((s) => s.code === code);
    if (subject) return subject;
  }
  return undefined;
}

/**
 * Helper function to get all subjects
 */
export function getAllSubjects(): PensumSubject[] {
  return PENSUM_DATA.flatMap((s) => s.subjects);
}
