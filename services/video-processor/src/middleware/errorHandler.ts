import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = res.locals['requestId'] || 'unknown';
  
  // Log the error
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    statusCode: err.statusCode,
    code: err.code,
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Determine status code
  const statusCode = err.statusCode || 500;
  
  // Determine error code
  const errorCode = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');
  
  // Determine error message
  const errorMessage = statusCode === 500 
    ? 'An internal server error occurred'
    : err.message || 'An error occurred';

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: errorMessage,
    code: errorCode,
    timestamp: new Date().toISOString(),
    requestId
  });
};

export const createError = (message: string, statusCode: number = 500, code?: string): ApiError => {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  if (code) {
    error.code = code;
  }
  return error;
};

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
