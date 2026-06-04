import { Classroom } from '../types';
import { LoggerService } from './LoggerService';

/**
 * Classroom DTO for creation
 */
export interface CreateClassroomDTO {
  building: string;
  number: string;
  capacity?: number;
}

/**
 * Classroom DTO for updates
 */
export interface UpdateClassroomDTO {
  building?: string;
  number?: string;
  capacity?: number;
}

/**
 * Classroom Service
 * Handles CRUD operations for classrooms.
 */
export class ClassroomService {
  private classrooms: Map<string, Classroom> = new Map();

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `room_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }



  /**
   * Get all classrooms
   */
  async getAll(): Promise<Classroom[]> {
    LoggerService.debug('Getting all classrooms', 'ClassroomService');
    return Array.from(this.classrooms.values());
  }

  /**
   * Get classroom by ID
   */
  async getById(id: string): Promise<Classroom | null> {
    LoggerService.debug(`Getting classroom by ID: ${id}`, 'ClassroomService');
    return this.classrooms.get(id) ?? null;
  }

  /**
   * Get classroom by building and number
   */
  async getByLocation(building: string, number: string): Promise<Classroom | null> {
    for (const room of this.classrooms.values()) {
      if (room.building === building && room.number === number) {
        return room;
      }
    }
    return null;
  }

  /**
   * Get classrooms by building
   */
  async getByBuilding(building: string): Promise<Classroom[]> {
    return Array.from(this.classrooms.values()).filter((r) => r.building === building);
  }

  /**
   * Create a new classroom
   */
  async create(data: CreateClassroomDTO): Promise<Classroom> {
    // Check for duplicate location
    const existing = await this.getByLocation(data.building, data.number);
    if (existing) {
      const error = `Classroom ${data.building}-${data.number} already exists`;
      LoggerService.error(error, 'ClassroomService');
      throw new Error(error);
    }

    const classroom: Classroom = {
      id: this.generateId(),
      building: data.building,
      number: data.number,
      capacity: data.capacity ?? 30,
    };

    this.classrooms.set(classroom.id, classroom);
    LoggerService.info(
      `Created classroom: ${classroom.building}-${classroom.number}`,
      'ClassroomService',
    );

    return classroom;
  }

  /**
   * Update an existing classroom
   */
  async update(id: string, data: UpdateClassroomDTO): Promise<Classroom | null> {
    const classroom = this.classrooms.get(id);
    if (!classroom) {
      LoggerService.warn(`Classroom not found: ${id}`, 'ClassroomService');
      return null;
    }

    // Check for duplicate location if changing building/number
    if (data.building || data.number) {
      const newBuilding = data.building ?? classroom.building;
      const newNumber = data.number ?? classroom.number;
      const existing = await this.getByLocation(newBuilding, newNumber);
      if (existing && existing.id !== id) {
        const error = `Classroom ${newBuilding}-${newNumber} already exists`;
        LoggerService.error(error, 'ClassroomService');
        throw new Error(error);
      }
    }

    const updated: Classroom = {
      ...classroom,
      building: data.building ?? classroom.building,
      number: data.number ?? classroom.number,
      capacity: data.capacity ?? classroom.capacity,
    };

    this.classrooms.set(id, updated);
    LoggerService.info(`Updated classroom: ${id}`, 'ClassroomService');

    return updated;
  }

  /**
   * Delete a classroom
   */
  async delete(id: string): Promise<boolean> {
    const existed = this.classrooms.has(id);
    if (existed) {
      this.classrooms.delete(id);
      LoggerService.info(`Deleted classroom: ${id}`, 'ClassroomService');
    } else {
      LoggerService.warn(`Classroom not found for deletion: ${id}`, 'ClassroomService');
    }
    return existed;
  }
}
