/**
 * ProfessorService — Lógica de dominio para profesores (CRUD).
 * Recibe IStorageService inyectado (Dependency Inversion).
 */
import { PROFESSORS_DATA } from '@scheduler/shared';
import type { Professor } from '@scheduler/shared';
import type { IStorageService } from './IStorageService';

export class ProfessorService {
  constructor(private readonly storage: IStorageService) {}

  getAll(): Professor[] {
    return this.storage.loadProfessors();
  }

  create(data: Partial<Professor>): Professor {
    const professors = this.storage.loadProfessors();
    const newProf: Professor = {
      id: `prof-${Date.now()}`,
      fullName: data.fullName ?? 'Nuevo Profesor',
      title: data.title ?? 'Prof.',
      email: data.email,
      cedula: data.cedula,
      profession: data.profession,
      subjects: data.subjects ?? [],
      type: data.type ?? 'both',
    };
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

  reset(): Professor[] {
    this.storage.saveProfessors(PROFESSORS_DATA);
    return PROFESSORS_DATA;
  }

  /** Importación en lote: crea/actualiza profesores (upsert por id; genera id si falta). */
  bulkUpsert(incoming: Partial<Professor>[]): Professor[] {
    const existing = this.storage.loadProfessors();
    const byId = new Map(existing.map((p) => [p.id, p]));
    let i = 0;
    for (const raw of incoming) {
      const id = raw.id && String(raw.id).trim() ? String(raw.id).trim() : `prof-${Date.now()}-${i++}`;
      byId.set(id, {
        id,
        fullName: raw.fullName ?? 'Sin nombre',
        title: raw.title ?? 'Prof.',
        email: raw.email,
        cedula: raw.cedula,
        profession: raw.profession,
        subjects: raw.subjects ?? [],
        type: raw.type ?? 'both',
      });
    }
    const merged = [...byId.values()];
    this.storage.saveProfessors(merged);
    return merged;
  }
}
