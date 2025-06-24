/**
 * Centralized logging utility for all services
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  data?: any;
  error?: Error;
  requestId?: string;
  jobId?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  service: string;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  enableStructured: boolean;
}

export class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      service: 'unknown',
      enableConsole: true,
      enableFile: false,
      enableStructured: true,
      ...config,
    };
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    data?: any,
    error?: Error,
    requestId?: string,
    jobId?: string
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      service: this.config.service,
      message,
      data,
      error,
      requestId,
      jobId,
    };
  }

  private formatLogEntry(entry: LogEntry): string {
    if (this.config.enableStructured) {
      return JSON.stringify({
        ...entry,
        error: entry.error ? {
          name: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack,
        } : undefined,
      });
    }

    const levelName = LogLevel[entry.level];
    const prefix = `[${entry.timestamp}] [${levelName}] [${entry.service}]`;
    const suffix = entry.requestId ? ` (req: ${entry.requestId})` : '';
    const jobSuffix = entry.jobId ? ` (job: ${entry.jobId})` : '';
    
    let message = `${prefix} ${entry.message}${suffix}${jobSuffix}`;
    
    if (entry.data) {
      message += `\nData: ${JSON.stringify(entry.data, null, 2)}`;
    }
    
    if (entry.error) {
      message += `\nError: ${entry.error.message}`;
      if (entry.error.stack) {
        message += `\nStack: ${entry.error.stack}`;
      }
    }
    
    return message;
  }

  private writeLog(entry: LogEntry): void {
    const formattedMessage = this.formatLogEntry(entry);

    if (this.config.enableConsole) {
      switch (entry.level) {
        case LogLevel.DEBUG:
          console.debug(formattedMessage);
          break;
        case LogLevel.INFO:
          console.info(formattedMessage);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage);
          break;
        case LogLevel.ERROR:
          console.error(formattedMessage);
          break;
      }
    }

    // File logging would be implemented here if needed
    // For now, we'll rely on Docker/container logging
  }

  debug(message: string, data?: any, requestId?: string, jobId?: string): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    const entry = this.createLogEntry(LogLevel.DEBUG, message, data, undefined, requestId, jobId);
    this.writeLog(entry);
  }

  info(message: string, data?: any, requestId?: string, jobId?: string): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    const entry = this.createLogEntry(LogLevel.INFO, message, data, undefined, requestId, jobId);
    this.writeLog(entry);
  }

  warn(message: string, data?: any, requestId?: string, jobId?: string): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    const entry = this.createLogEntry(LogLevel.WARN, message, data, undefined, requestId, jobId);
    this.writeLog(entry);
  }

  error(message: string, error?: Error, data?: any, requestId?: string, jobId?: string): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    const entry = this.createLogEntry(LogLevel.ERROR, message, data, error, requestId, jobId);
    this.writeLog(entry);
  }

  // Convenience methods for common logging scenarios
  logRequest(method: string, path: string, requestId: string, data?: any): void {
    this.info(`${method} ${path}`, data, requestId);
  }

  logResponse(method: string, path: string, statusCode: number, requestId: string, duration?: number): void {
    this.info(`${method} ${path} - ${statusCode}`, { duration }, requestId);
  }

  logJobStart(jobId: string, youtubeUrl: string, requestId?: string): void {
    this.info('Job started', { youtubeUrl }, requestId, jobId);
  }

  logJobProgress(jobId: string, step: string, progress: number, requestId?: string): void {
    this.info(`Job progress: ${step}`, { progress }, requestId, jobId);
  }

  logJobComplete(jobId: string, duration: number, requestId?: string): void {
    this.info('Job completed', { duration }, requestId, jobId);
  }

  logJobError(jobId: string, error: Error, step?: string, requestId?: string): void {
    this.error(`Job failed${step ? ` at ${step}` : ''}`, error, undefined, requestId, jobId);
  }

  logServiceHealth(serviceName: string, status: string, metrics?: any): void {
    this.info(`Service health check: ${status}`, { serviceName, metrics });
  }

  logDependencyError(dependencyName: string, error: Error, requestId?: string): void {
    this.error(`Dependency error: ${dependencyName}`, error, undefined, requestId);
  }

  // Create child logger with additional context
  child(context: { requestId?: string; jobId?: string; service?: string }): Logger {
    const childLogger = new Logger(this.config);
    
    // Override logging methods to include context
    const originalMethods = {
      debug: childLogger.debug.bind(childLogger),
      info: childLogger.info.bind(childLogger),
      warn: childLogger.warn.bind(childLogger),
      error: childLogger.error.bind(childLogger),
    };

    childLogger.debug = (message: string, data?: any, requestId?: string, jobId?: string) => {
      originalMethods.debug(
        message, 
        data, 
        requestId || context.requestId, 
        jobId || context.jobId
      );
    };

    childLogger.info = (message: string, data?: any, requestId?: string, jobId?: string) => {
      originalMethods.info(
        message, 
        data, 
        requestId || context.requestId, 
        jobId || context.jobId
      );
    };

    childLogger.warn = (message: string, data?: any, requestId?: string, jobId?: string) => {
      originalMethods.warn(
        message, 
        data, 
        requestId || context.requestId, 
        jobId || context.jobId
      );
    };

    childLogger.error = (message: string, error?: Error, data?: any, requestId?: string, jobId?: string) => {
      originalMethods.error(
        message, 
        error, 
        data, 
        requestId || context.requestId, 
        jobId || context.jobId
      );
    };

    return childLogger;
  }
}

// Create default logger instance
export const createLogger = (service: string, level: LogLevel = LogLevel.INFO): Logger => {
  return new Logger({
    service,
    level,
    enableConsole: true,
    enableStructured: process.env.NODE_ENV === 'production',
  });
};

// Export singleton for shared usage
export const defaultLogger = createLogger('shared');
