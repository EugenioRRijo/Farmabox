/**
 * Tipos de dominio de profesores. SIN datos hardcodeados: la única fuente de la
 * verdad es la base de datos (Supabase). Antes este archivo traía 45 profesores
 * de ejemplo que terminaban sembrándose en la DB.
 */

export interface Professor {
  id: string;
  fullName: string;
  title: 'Prof.' | 'Dr.' | 'Dra.' | 'MSc.' | 'Lic.';
  email?: string;
  cedula?: string;
  profession?: string; // profesión (texto libre, ej. "Farmacéutico")
  subjects: string[];
  /** Rol del profesor. 'unassigned' = importado sin tipo: no da teoría ni lab hasta
   *  que se le asigne con los toggles de la tarjeta. reconcile/seed lo tratan como
   *  "sin rol" (no le siembran nada). */
  type: 'theory' | 'practice' | 'both' | 'unassigned';
}

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
