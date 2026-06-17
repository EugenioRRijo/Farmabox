/**
 * seedAcademicLoadFromProfessors — auto-completa la carga académica a partir de los
 * profesores (su lista de materias + su tipo), para los que todavía no tienen rol.
 *
 * Causa raíz que resuelve: al IMPORTAR profesores (o con datos viejos) se guardan sus
 * materias (professor.subjects / professor_subjects) pero NO la carga académica
 * (academic_load). Como ahora el rol se deriva de la carga, esos profesores salían
 * "sin rol" en Profesores y sus bloques no se vinculaban en el horario.
 *
 * Aplica reconcileProfessorLoad SOLO a los profesores que todavía no aparecen en la
 * carga (en ningún rol, en ninguna materia): les agrega el rol por defecto según su
 * tipo (teoría si da teoría/ambos; lab si da práctica/ambos y la materia tiene lab).
 *
 * Por qué "solo si no aparece": una vez que un profesor tiene rol en la carga, esa es
 * una decisión explícita (incluidos los toggles teoría/lab de la tarjeta del profesor).
 * Si re-sembráramos por tipo en cada recarga, des-haríamos un toggle que el usuario
 * quitó (p.ej. "ambos" al que le quitaron teoría en una materia). El seed es solo una
 * red de seguridad para profesores importados/viejos que aún no tienen ningún rol.
 *
 * Idempotente, no quita nada ni toca a otros profesores. Inmutable.
 */
import { reconcileProfessorLoad } from './reconcileProfessorLoad';
import type { AcademicLoadLike } from './sanitizeProfessorReferences';

interface ProfessorLike {
  id: string;
  type: 'theory' | 'practice' | 'both' | 'unassigned';
  subjects: string[];
}

export function seedAcademicLoadFromProfessors(
  load: AcademicLoadLike,
  professors: ProfessorLike[],
  labSubjectCodes: Iterable<string>,
): AcademicLoadLike {
  const labSet = labSubjectCodes instanceof Set ? labSubjectCodes : new Set(labSubjectCodes);

  // Ids con rol explícito en la carga (cualquier materia, teoría o lab). A esos NO se
  // les vuelve a sembrar: respeta los toggles del usuario y asignaciones previas.
  const alreadyAssigned = new Set<string>();
  for (const code of Object.keys(load)) {
    const entry = load[code];
    for (const id of entry?.theory ?? []) alreadyAssigned.add(id);
    for (const id of entry?.lab ?? []) alreadyAssigned.add(id);
  }

  let next = load;
  for (const p of professors) {
    if (!p.subjects || p.subjects.length === 0) continue;
    if (alreadyAssigned.has(p.id)) continue; // ya tiene rol explícito → no re-sembrar
    next = reconcileProfessorLoad(next, p, [], labSet);
  }
  return next;
}
