/**
 * ProfessorService — Lógica de dominio para profesores (CRUD).
 * Recibe IStorageService inyectado (Dependency Inversion).
 */
import type { Professor } from '@scheduler/shared';
import { findProfessorIdByIdentity } from '@scheduler/shared';
import type { IStorageService } from './IStorageService';

/** Fusiona un registro entrante sobre el previo (si existe), reusando el id.
 *  Prefiere los valores entrantes pero NO borra cédula/email/profesión ya guardados. */
function mergeProfessor(id: string, prev: Professor | undefined, raw: Partial<Professor>): Professor {
  return {
    id,
    fullName: raw.fullName ?? prev?.fullName ?? 'Sin nombre',
    title: raw.title ?? prev?.title ?? 'Prof.',
    email: raw.email ?? prev?.email,
    cedula: raw.cedula ?? prev?.cedula,
    profession: raw.profession ?? prev?.profession,
    subjects: raw.subjects ?? prev?.subjects ?? [],
    type: raw.type ?? prev?.type ?? 'both',
  };
}

export class ProfessorService {
  constructor(private readonly storage: IStorageService) {}

  getAll(): Professor[] {
    return this.storage.loadProfessors();
  }

  create(data: Partial<Professor>): Professor {
    const professors = this.storage.loadProfessors();
    // Fusionar por identidad (cédula → nombre): si ya existe, actualiza ese registro
    // en vez de crear un duplicado.
    const matchId = findProfessorIdByIdentity(professors, data);
    if (matchId) {
      const idx = professors.findIndex((p) => p.id === matchId);
      professors[idx] = mergeProfessor(matchId, professors[idx], data);
      this.storage.saveProfessors(professors);
      return professors[idx];
    }
    const newProf = mergeProfessor(`prof-${Date.now()}`, undefined, data);
    professors.push(newProf);
    this.storage.saveProfessors(professors);
    return newProf;
  }

  update(id: string, data: Partial<Professor>): Professor | null {
    const professors = this.storage.loadProfessors();
    const index = professors.findIndex((p) => p.id === id);
    if (index === -1) return null;
    professors[index] = { ...professors[index], ...data, id };
    this.storage.saveProfessors(professors);
    return professors[index];
  }

  delete(id: string): boolean {
    let professors = this.storage.loadProfessors();
    const existed = professors.some((p) => p.id === id);
    if (!existed) return false;
    professors = professors.filter((p) => p.id !== id);
    this.storage.saveProfessors(professors);
    return true;
  }

  /** Vacía la lista de profesores (tombstones → se sincronizan a la nube).
   *  Antes restauraba 45 profesores hardcodeados; ya no se siembra nada. */
  reset(): Professor[] {
    this.storage.saveProfessors([]);
    return [];
  }

  /**
   * Importación en lote: FUSIONA por identidad (cédula → nombre) contra la lista que
   * va creciendo, así re-importar la misma lista NO duplica (bug histórico de los
   * `prof-<timestamp>`). Solo crea un id nuevo cuando el profesor es genuinamente nuevo.
   */
  bulkUpsert(incoming: Partial<Professor>[]): Professor[] {
    const professors = this.storage.loadProfessors();
    let seq = 0;
    for (const raw of incoming) {
      const matchId = findProfessorIdByIdentity(professors, raw);
      if (matchId) {
        const idx = professors.findIndex((p) => p.id === matchId);
        professors[idx] = mergeProfessor(matchId, professors[idx], raw);
      } else {
        const id = raw.id && String(raw.id).trim() ? String(raw.id).trim() : `prof-${Date.now()}-${seq++}`;
        professors.push(mergeProfessor(id, undefined, raw));
      }
    }
    this.storage.saveProfessors(professors);
    return professors;
  }
}
