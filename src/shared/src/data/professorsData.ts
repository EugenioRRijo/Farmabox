/**
 * Lista de Profesores de la Facultad de Farmacia USM
 *
 * Arranca VACÍA: los profesores (con sus horas/materias correctas) los carga
 * el usuario desde la app (sección Profesores) y se guardan/sincronizan en Supabase.
 */

export interface Professor {
  id: string;
  fullName: string;
  title: 'Prof.' | 'Dr.' | 'Dra.' | 'MSc.' | 'Lic.';
  email?: string;
  cedula?: string;
  subjects: string[];
  type: 'theory' | 'practice' | 'both';
}

/** Profesores semilla — vacío a propósito. El usuario carga los suyos. */
export const PROFESSORS_DATA: Professor[] = [];

export function getProfessorsBySubject(
  subjectCode: string,
  professors: Professor[] = PROFESSORS_DATA,
): Professor[] {
  return professors.filter((p) => p.subjects.includes(subjectCode));
}

export function getSubjectsByProfessor(
  professorId: string,
  professors: Professor[] = PROFESSORS_DATA,
): string[] {
  const prof = professors.find((p) => p.id === professorId);
  return prof ? prof.subjects : [];
}
