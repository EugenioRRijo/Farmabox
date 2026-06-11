/**
 * sanitizeProfessorReferences — elimina referencias a profesores "fantasma"
 * (ids que ya no corresponden a un profesor vivo, p.ej. tras borrar un profesor).
 *
 * Causa raíz que resuelve: al borrar un profesor, sus bloques de horario y su
 * carga académica quedaban apuntando al id viejo. El validador global de colisión
 * de profesor tropezaba con esos bloques huérfanos y reportaba un falso choque
 * ("el profesor ya tiene una clase asignada en este mismo horario").
 *
 * Comportamiento: "liberar las clases" → el bloque se conserva pero se le quita el
 * profesor; la carga académica deja de listar el id inexistente.
 */
export type ProfessorAssignment = { theory?: string[]; lab?: string[] };
export type AcademicLoadLike = Record<string, ProfessorAssignment>;

export function sanitizeProfessorReferences<B extends { professorId?: string }>(
  liveProfessorIds: Iterable<string>,
  academicLoad: AcademicLoadLike,
  blocks: B[],
): { academicLoad: AcademicLoadLike; blocks: B[] } {
  const live = liveProfessorIds instanceof Set ? liveProfessorIds : new Set(liveProfessorIds);

  const cleanedBlocks = blocks.map((b) =>
    b.professorId !== undefined && !live.has(b.professorId)
      ? { ...b, professorId: undefined }
      : b,
  );

  const cleanedLoad: AcademicLoadLike = {};
  for (const [code, val] of Object.entries(academicLoad)) {
    cleanedLoad[code] = {
      theory: (val.theory ?? []).filter((id) => live.has(id)),
      lab: (val.lab ?? []).filter((id) => live.has(id)),
    };
  }

  return { academicLoad: cleanedLoad, blocks: cleanedBlocks };
}
