/**
 * Simple logging utility for API Gateway
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private service: string;
  private level: LogLevel;

  constructor(service: string, level: LogLevel = LogLevel.INFO) {
    this.service = service;
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: LogLevel, message: string, data?: any, requestId?: string): string {
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const prefix = `[${timestamp}] [${levelName}] [${this.service}]`;
    const suffix = requestId ? ` (req: ${requestId})` : '';
    
    let logMessage = `${prefix} ${message}${suffix}`;
    
    if (data) {
      logMessage += `\nData: ${JSON.stringify(data, null, 2)}`;
    }
    
    return logMessage;
  }

  debug(message: string, data?: any, requestId?: string): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    console.debug(this.formatMessage(LogLevel.DEBUG, message, data, requestId));
  }

  info(message: string, data?: any, requestId?: string): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    console.info(this.formatMessage(LogLevel.INFO, message, data, requestId));
  }

  warn(message: string, data?: any, requestId?: string): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    console.warn(this.formatMessage(LogLevel.WARN, message, data, requestId));
  }

  error(message: string, error?: Error, data?: any, requestId?: string): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    let logMessage = this.formatMessage(LogLevel.ERROR, message, data, requestId);
    
    if (error) {
      logMessage += `\nError: ${error.message}`;
      if (error.stack) {
        logMessage += `\nStack: ${error.stack}`;
      }
    }
    
    console.error(logMessage);
  }

  // Convenience methods
  logRequest(method: string, path: string, requestId: string, data?: any): void {
    this.info(`${method} ${path}`, data, requestId);
  }

  logResponse(method: string, path: string, statusCode: number, requestId: string, duration?: number): void {
    this.info(`${method} ${path} - ${statusCode}`, { duration }, requestId);
  }
}

export const createLogger = (service: string, level: LogLevel = LogLevel.INFO): Logger => {
  return new Logger(service, level);
};
