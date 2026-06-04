import { User } from '../types';
import { LoggerService } from './LoggerService';

/**
 * Professor DTO for creation
 */
export interface CreateProfessorDTO {
  firstName: string;
  lastName: string;
  cedula: string;
  email?: string;
}

/**
 * Professor DTO for updates
 */
export interface UpdateProfessorDTO {
  firstName?: string;
  lastName?: string;
  email?: string;
}

/**
 * Professor Service
 * Handles CRUD operations for professors.
 */
export class ProfessorService {
  private professors: Map<string, User> = new Map();

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `prof_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get all professors
   */
  async getAll(): Promise<User[]> {
    LoggerService.debug('Getting all professors', 'ProfessorService');
    return Array.from(this.professors.values());
  }

  /**
   * Get professor by ID
   */
  async getById(id: string): Promise<User | null> {
    LoggerService.debug(`Getting professor by ID: ${id}`, 'ProfessorService');
    return this.professors.get(id) ?? null;
  }

  /**
   * Get professor by cedula
   */
  async getByCedula(cedula: string): Promise<User | null> {
    LoggerService.debug(`Getting professor by cedula: ${cedula}`, 'ProfessorService');
    for (const prof of this.professors.values()) {
      if (prof.cedula === cedula) {
        return prof;
      }
    }
    return null;
  }

  /**
   * Create a new professor
   */
  async create(data: CreateProfessorDTO): Promise<User> {
    // Check for duplicate cedula
    const existing = await this.getByCedula(data.cedula);
    if (existing) {
      const error = `Professor with cedula ${data.cedula} already exists`;
      LoggerService.error(error, 'ProfessorService');
      throw new Error(error);
    }

    const professor: User = {
      id: this.generateId(),
      type: 'PROFESSOR',
      firstName: data.firstName,
      lastName: data.lastName,
      cedula: data.cedula,
      email: data.email,
    };

    this.professors.set(professor.id, professor);
    LoggerService.info(
      `Created professor: ${professor.firstName} ${professor.lastName}`,
      'ProfessorService',
    );

    return professor;
  }

  /**
   * Update an existing professor
   */
  async update(id: string, data: UpdateProfessorDTO): Promise<User | null> {
    const professor = this.professors.get(id);
    if (!professor) {
      LoggerService.warn(`Professor not found: ${id}`, 'ProfessorService');
      return null;
    }

    const updated: User = {
      ...professor,
      firstName: data.firstName ?? professor.firstName,
      lastName: data.lastName ?? professor.lastName,
      email: data.email ?? professor.email,
    };

    this.professors.set(id, updated);
    LoggerService.info(`Updated professor: ${id}`, 'ProfessorService');

    return updated;
  }

  /**
   * Delete a professor
   */
  async delete(id: string): Promise<boolean> {
    const existed = this.professors.has(id);
    if (existed) {
      this.professors.delete(id);
      LoggerService.info(`Deleted professor: ${id}`, 'ProfessorService');
    } else {
      LoggerService.warn(`Professor not found for deletion: ${id}`, 'ProfessorService');
    }
    return existed;
  }

  /**
   * Search professors by name
   */
  async searchByName(query: string): Promise<User[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.professors.values()).filter(
      (p) =>
        p.firstName.toLowerCase().includes(lowerQuery) ||
        p.lastName.toLowerCase().includes(lowerQuery),
    );
  }
}
