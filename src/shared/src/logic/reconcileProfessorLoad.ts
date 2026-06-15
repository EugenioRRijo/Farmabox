/**
 * reconcileProfessorLoad — sincroniza la asignación de materias de UN profesor
 * (la lista `professor.subjects`, tabla professor_subjects) hacia la carga
 * académica (tabla academic_load, con rol teoría/práctica).
 *
 * Causa raíz que resuelve: asignar una materia a un profesor y configurar su
 * carga (teoría/lab) eran dos pasos separados, en sitios distintos, que se
 * desincronizaban. Ahora asignar la materia ya define la carga por defecto según
 * el tipo del profesor y si la materia tiene laboratorio.
 *
 * Solo toca el id de ESTE profesor:
 *  - Materia añadida (en `subjects`, no en `prevSubjects`) → lo agrega a `theory`
 *    (si da teoría) y a `lab` (si da práctica y la materia tiene lab).
 *  - Materia quitada (en `prevSubjects`, no en `subjects`) → lo saca de ambos roles.
 *  - Materia sin cambios → intacta (respeta toggles manuales y a otros profesores).
 *
 * Inmutable: no muta la carga de entrada.
 */
import type { AcademicLoadLike, ProfessorAssignment } from './sanitizeProfessorReferences';

interface ProfessorLike {
  id: string;
  type: 'theory' | 'practice' | 'both';
  subjects: string[];
}

export function reconcileProfessorLoad(
  load: AcademicLoadLike,
  professor: ProfessorLike,
  prevSubjects: string[],
  labSubjectCodes: Iterable<string>,
): AcademicLoadLike {
  const labSet = labSubjectCodes instanceof Set ? labSubjectCodes : new Set(labSubjectCodes);
  const before = new Set(prevSubjects);
  const after = new Set(professor.subjects);

  const givesTheory = professor.type === 'theory' || professor.type === 'both';
  const givesLab = professor.type === 'practice' || professor.type === 'both';

  // Copia superficial; solo se reemplazan las entradas que se tocan.
  const next: AcademicLoadLike = { ...load };

  const entryOf = (code: string): ProfessorAssignment => {
    const cur = next[code] ?? {};
    return { theory: [...(cur.theory ?? [])], lab: [...(cur.lab ?? [])] };
  };

  // Materias añadidas → asignar al profesor según su tipo.
  for (const code of after) {
    if (before.has(code)) continue; // sin cambios → no tocar
    const entry = entryOf(code);
    if (givesTheory && !entry.theory!.includes(professor.id)) {
      entry.theory!.push(professor.id);
    }
    if (givesLab && labSet.has(code) && !entry.lab!.includes(professor.id)) {
      entry.lab!.push(professor.id);
    }
    next[code] = entry;
  }

  // Materias quitadas → desasignar al profesor de ambos roles.
  for (const code of before) {
    if (after.has(code)) continue; // sin cambios → no tocar
    if (!next[code]) continue;
    const entry = entryOf(code);
    entry.theory = entry.theory!.filter((id) => id !== professor.id);
    entry.lab = entry.lab!.filter((id) => id !== professor.id);
    next[code] = entry;
  }

  return next;
}
