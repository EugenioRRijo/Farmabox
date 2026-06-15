/**
 * seedAcademicLoadFromProfessors — auto-completa la carga académica a partir de los
 * profesores (su lista de materias + su tipo), para los que todavía no tienen rol.
 *
 * Causa raíz que resuelve: al IMPORTAR profesores (o con datos viejos) se guardan sus
 * materias (professor.subjects / professor_subjects) pero NO la carga académica
 * (academic_load). Como ahora el rol se deriva de la carga, esos profesores salían
 * "sin rol" en Profesores y sus bloques no se vinculaban en el horario.
 *
 * Aplica reconcileProfessorLoad por cada profesor de forma ADITIVA (prevSubjects=[]):
 * agrega el rol que falta (teoría si da teoría/ambos; lab si da práctica/ambos y la
 * materia tiene laboratorio). Idempotente: si ya está, no duplica; nunca quita nada
 * ni toca a otros profesores. Inmutable.
 */
import { reconcileProfessorLoad } from './reconcileProfessorLoad';
import type { AcademicLoadLike } from './sanitizeProfessorReferences';

interface ProfessorLike {
  id: string;
  type: 'theory' | 'practice' | 'both';
  subjects: string[];
}

export function seedAcademicLoadFromProfessors(
  load: AcademicLoadLike,
  professors: ProfessorLike[],
  labSubjectCodes: Iterable<string>,
): AcademicLoadLike {
  const labSet = labSubjectCodes instanceof Set ? labSubjectCodes : new Set(labSubjectCodes);
  let next = load;
  for (const p of professors) {
    if (!p.subjects || p.subjects.length === 0) continue;
    next = reconcileProfessorLoad(next, p, [], labSet);
  }
  return next;
}
