import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = uuidv4();
  const startTime = Date.now();

  // Store request ID in response locals for access in other middleware
  res.locals['requestId'] = requestId;

  // Log incoming request
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    timestamp: new Date().toISOString()
  });

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body: any) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Log response
    logger.info('Outgoing response', {
      requestId,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentType: res.get('Content-Type'),
      timestamp: new Date().toISOString()
    });

    // Call original json method
    return originalJson.call(this, body);
  };

  // Override res.send to log response for non-JSON responses
  const originalSend = res.send;
  res.send = function(body: any) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Only log if json wasn't already called
    if (!res.headersSent || res.get('Content-Type') !== 'application/json') {
      logger.info('Outgoing response', {
        requestId,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        contentType: res.get('Content-Type'),
        timestamp: new Date().toISOString()
      });
    }

    return originalSend.call(this, body);
  };

  // Handle response finish event for cases where neither json nor send is called
  res.on('finish', () => {
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Log if response wasn't already logged
    if (!res.headersSent) {
      logger.info('Response finished', {
        requestId,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });
    }
  });

  next();
};
