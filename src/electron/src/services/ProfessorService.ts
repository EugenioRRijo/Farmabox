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
}
