/**
 * Tipos de dominio del pensum. SIN datos hardcodeados: la única fuente de la
 * verdad es la base de datos (Supabase). Antes este archivo traía el PENSUM
 * 2023-01 completo (84 materias) que terminaba sembrándose en la DB.
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
  labNumber?: string;
  /** Aula de teoría (ej. "209"). Sale en el PDF como "Aula 209". */
  aula?: string;
}

export interface Semester {
  number: number;
  subjects: PensumSubject[];
}

export const PENSUM_DATA: Semester[] = [];

export function getSubjectsBySemester(semester: number): PensumSubject[] {
  const found = PENSUM_DATA.find((s) => s.number === semester);
  return found ? found.subjects : [];
}

export function getSubjectByCode(code: string): PensumSubject | undefined {
  for (const semester of PENSUM_DATA) {
    const subject = semester.subjects.find((s) => s.code === code);
    if (subject) return subject;
  }
  return undefined;
}

export function getAllSubjects(): PensumSubject[] {
  return PENSUM_DATA.flatMap((s) => s.subjects);
}
