import { Subject } from '../types';
import { LoggerService } from './LoggerService';

/**
 * Subject DTO for creation
 */
export interface CreateSubjectDTO {
  code: string;
  name: string;
  credits?: number;
  semester?: number;
}

/**
 * Subject DTO for updates
 */
export interface UpdateSubjectDTO {
  name?: string;
  credits?: number;
  semester?: number;
}

/**
 * Subject Service
 * Handles CRUD operations for academic subjects.
 */
export class SubjectService {
  private subjects: Map<string, Subject> = new Map();

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `subj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get all subjects
   */
  async getAll(): Promise<Subject[]> {
    LoggerService.debug('Getting all subjects', 'SubjectService');
    return Array.from(this.subjects.values());
  }

  /**
   * Get subject by ID
   */
  async getById(id: string): Promise<Subject | null> {
    LoggerService.debug(`Getting subject by ID: ${id}`, 'SubjectService');
    return this.subjects.get(id) ?? null;
  }

  /**
   * Get subject by code
   */
  async getByCode(code: string): Promise<Subject | null> {
    for (const subject of this.subjects.values()) {
      if (subject.code === code) {
        return subject;
      }
    }
    return null;
  }

  /**
   * Create a new subject
   */
  async create(data: CreateSubjectDTO): Promise<Subject> {
    // Check for duplicate code
    const existing = await this.getByCode(data.code);
    if (existing) {
      const error = `Subject with code ${data.code} already exists`;
      LoggerService.error(error, 'SubjectService');
      throw new Error(error);
    }

    const subject: Subject = {
      id: this.generateId(),
      code: data.code,
      name: data.name,
      credits: data.credits ?? 3,
    };

    this.subjects.set(subject.id, subject);
    LoggerService.info(`Created subject: ${subject.code} - ${subject.name}`, 'SubjectService');

    return subject;
  }

  /**
   * Update an existing subject
   */
  async update(id: string, data: UpdateSubjectDTO): Promise<Subject | null> {
    const subject = this.subjects.get(id);
    if (!subject) {
      LoggerService.warn(`Subject not found: ${id}`, 'SubjectService');
      return null;
    }

    const updated: Subject = {
      ...subject,
      name: data.name ?? subject.name,
      credits: data.credits ?? subject.credits,
    };

    this.subjects.set(id, updated);
    LoggerService.info(`Updated subject: ${id}`, 'SubjectService');

    return updated;
  }

  /**
   * Delete a subject
   */
  async delete(id: string): Promise<boolean> {
    const existed = this.subjects.has(id);
    if (existed) {
      this.subjects.delete(id);
      LoggerService.info(`Deleted subject: ${id}`, 'SubjectService');
    } else {
      LoggerService.warn(`Subject not found for deletion: ${id}`, 'SubjectService');
    }
    return existed;
  }

  /**
   * Search subjects by name
   */
  async searchByName(query: string): Promise<Subject[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.subjects.values()).filter(
      (s) => s.name.toLowerCase().includes(lowerQuery) || s.code.toLowerCase().includes(lowerQuery),
    );
  }
}
