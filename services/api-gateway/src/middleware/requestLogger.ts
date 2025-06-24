import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';

const logger = createLogger('api-gateway');

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Generate request ID if not present
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  
  // Add request ID to headers
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Log request start
  const startTime = Date.now();
  logger.logRequest(req.method, req.path, requestId, {
    query: req.query,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection.remoteAddress,
  });

  // Override res.end to log response
  const originalEnd = res.end.bind(res);
  res.end = function(chunk?: any, encoding?: any): any {
    const duration = Date.now() - startTime;
    logger.logResponse(req.method, req.path, res.statusCode, requestId, duration);
    
    // Call original end method
    return originalEnd(chunk, encoding);
  };

  next();
};

// Middleware to extract request ID for use in other middleware
export const getRequestId = (req: Request): string => {
  return req.headers['x-request-id'] as string;
};
