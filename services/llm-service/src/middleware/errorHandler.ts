import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = res.locals['requestId'] || 'unknown';
  
  // Default error values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || 'INTERNAL_ERROR';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_INPUT';
    message = 'Invalid input format';
  } else if (err.name === 'MongoError' && err.message.includes('duplicate key')) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    message = 'Resource already exists';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token expired';
  }

  // Log error details
  logger.error('Request error occurred', {
    requestId,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode,
      code
    },
    request: {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    }
  });

  // Send error response
  const errorResponse = {
    success: false,
    error: message,
    code,
    timestamp: new Date().toISOString(),
    requestId
  };

  // Include stack trace in development
  if (process.env['NODE_ENV'] === 'development') {
    (errorResponse as any).stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
};

export const createError = (
  message: string,
  statusCode: number = 500,
  code: string = 'INTERNAL_ERROR'
): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.isOperational = true;
  return error;
};

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
