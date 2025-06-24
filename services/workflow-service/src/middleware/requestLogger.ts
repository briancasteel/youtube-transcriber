import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = uuidv4();
  const startTime = Date.now();

  // Store request ID in response locals for use in other middleware
  res.locals['requestId'] = requestId;

  // Log incoming request
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    headers: {
      'content-type': req.get('Content-Type'),
      'authorization': req.get('Authorization') ? '[REDACTED]' : undefined
    }
  });

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body: any) {
    const duration = Date.now() - startTime;
    
    logger.info('Outgoing response', {
      requestId,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length')
    });

    return originalJson.call(this, body);
  };

  // Override res.end to log response for non-JSON responses
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const duration = Date.now() - startTime;
    
    // Only log if we haven't already logged via res.json
    if (!res.headersSent || res.get('Content-Type')?.includes('application/json') === false) {
      logger.info('Outgoing response', {
        requestId,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        contentLength: res.get('Content-Length')
      });
    }

    return originalEnd.call(this, chunk, encoding);
  };

  next();
};
