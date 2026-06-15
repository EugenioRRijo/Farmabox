/**
 * restampBlocksFromLoad — mantiene el invariante "el profesor de un bloque sale
 * SIEMPRE de la carga académica".
 *
 * Causa raíz que resuelve: `ScheduleBlock.professorId` se fijaba como una "foto"
 * al dibujar el bloque (`academicLoad[code][rol][0]`) y nunca se volvía a
 * sincronizar. Si luego cambiaba la carga (asignar/quitar un profesor a la
 * materia), los bloques conservaban el profesor viejo → el filtro de
 * visualización, los PDF por profesor y los reportes de choque mostraban datos
 * obsoletos.
 *
 * Re-estampa cada bloque tomando el primer profesor del rol que corresponde
 * (LAB → `lab`, cualquier otro → `theory`), o `undefined` si ese rol no tiene a
 * nadie. Inmutable e idempotente: los bloques que ya están correctos se
 * devuelven por la misma referencia (no disparan re-render ni guardado).
 */
import type { AcademicLoadLike } from './sanitizeProfessorReferences';

type RestampableBlock = {
  subjectCode: string;
  type?: 'THEORY' | 'LAB';
  professorId?: string;
};

export function restampBlocksFromLoad<B extends RestampableBlock>(
  blocks: B[],
  academicLoad: AcademicLoadLike,
): B[] {
  return blocks.map((b) => {
    const role: 'theory' | 'lab' = b.type === 'LAB' ? 'lab' : 'theory';
    const next = academicLoad[b.subjectCode]?.[role]?.[0];
    if (b.professorId === next) return b;
    return { ...b, professorId: next };
  });
}
