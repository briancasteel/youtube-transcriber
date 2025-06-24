import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const logger = createLogger('api-gateway');

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = req.headers['x-request-id'] as string;
  
  // Log the error
  logger.error('Request error', error, { 
    path: req.path, 
    method: req.method,
    body: req.body,
    query: req.query 
  }, requestId);

  // Default error response
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';
  const code = error.code || 'INTERNAL_ERROR';

  // Don't expose internal errors in production
  const isProduction = process.env.NODE_ENV === 'production';
  const errorResponse = {
    success: false,
    error: isProduction && statusCode === 500 ? 'Internal Server Error' : message,
    code: isProduction && statusCode === 500 ? 'INTERNAL_ERROR' : code,
    timestamp: new Date().toISOString(),
    requestId,
    ...(isProduction ? {} : { details: error.details, stack: error.stack })
  };

  res.status(statusCode).json(errorResponse);
};

export const createError = (
  message: string, 
  statusCode: number = 500, 
  code?: string, 
  details?: any
): ApiError => {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
};

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
