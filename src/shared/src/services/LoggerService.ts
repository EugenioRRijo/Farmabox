/**
 * Logger Service
 * Centralized logging system for the application.
 *
 * Levels: DEBUG, INFO, WARN, ERROR
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
}

class LoggerServiceClass {
  private logs: LogEntry[] = [];

  private minLevel: LogLevel = 'INFO';

  private readonly levelPriority: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  };

  /**
   * Set minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: string, data?: unknown): void {
    this.log('DEBUG', message, context, data);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: string, data?: unknown): void {
    this.log('INFO', message, context, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: string, data?: unknown): void {
    this.log('WARN', message, context, data);
  }

  /**
   * Log an error message
   */
  error(message: string, context?: string, data?: unknown): void {
    this.log('ERROR', message, context, data);
  }

  /**
   * Get all logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter((log) => log.level === level);
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, context?: string, data?: unknown): void {
    if (this.levelPriority[level] < this.levelPriority[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      data,
    };

    this.logs.push(entry);

    // Console output with formatting
    const prefix = `[${entry.timestamp}] [${level}]${context ? ` [${context}]` : ''}`;

    switch (level) {
      case 'DEBUG':
        console.debug(prefix, message, data ?? '');
        break;
      case 'INFO':
        console.info(prefix, message, data ?? '');
        break;
      case 'WARN':
        console.warn(prefix, message, data ?? '');
        break;
      case 'ERROR':
        console.error(prefix, message, data ?? '');
        break;
    }
  }
}

// Singleton export
export const LoggerService = new LoggerServiceClass();
