/**
 * Base Repository Interface
 * Defines common CRUD operations for all entities.
 */

export interface BaseRepository<T, CreateDTO, UpdateDTO> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  create(data: CreateDTO): Promise<T>;
  update(id: string, data: UpdateDTO): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

/**
 * Database Adapter Interface
 * Abstraction for database operations (SQLite, IndexedDB, etc.)
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number }>;
  get<T>(sql: string, params?: unknown[]): Promise<T | null>;
  exec(sql: string): Promise<void>;
}

/**
 * In-Memory Database Adapter
 * Used for frontend/testing when real SQLite is not available
 */
export class InMemoryDatabaseAdapter implements DatabaseAdapter {
  private tables: Map<string, Map<string, unknown>> = new Map();

  async query<T>(_sql: string, _params?: unknown[]): Promise<T[]> {
    // This is a simplified mock - in real implementation would parse SQL
    return [];
  }

  async run(
    _sql: string,
    _params?: unknown[],
  ): Promise<{ changes: number; lastInsertRowid: number }> {
    return { changes: 1, lastInsertRowid: 1 };
  }

  async get<T>(_sql: string, _params?: unknown[]): Promise<T | null> {
    return null;
  }

  async exec(_sql: string): Promise<void> {
    // Execute SQL (for schema creation)
  }

  // Helper methods for in-memory storage
  setTable<T>(name: string, data: Map<string, T>): void {
    this.tables.set(name, data as Map<string, unknown>);
  }

  getTable<T>(name: string): Map<string, T> | undefined {
    return this.tables.get(name) as Map<string, T> | undefined;
  }
}
