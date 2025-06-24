import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export interface AppError extends Error {
  statusCode: number;
  code?: string;
  isOperational?: boolean;
}

export const createError = (message: string, statusCode: number = 500, code?: string): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  if (code) {
    error.code = code;
  }
  error.isOperational = true;
  return error;
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = res.locals['requestId'] || 'unknown';
  
  // Default error values
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal Server Error';
  let code = error.code || 'INTERNAL_ERROR';

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid input data';
  } else if (error.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = 'Invalid ID format';
  } else if (error.name === 'MongoError' && error.message.includes('duplicate key')) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    message = 'Resource already exists';
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
  }

  // Log error details
  logger.error('Request error', {
    requestId,
    error: {
      name: error.name,
      message: error.message,
      code,
      statusCode,
      stack: error.stack
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query
    }
  });

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: message,
    code,
    timestamp: new Date().toISOString(),
    requestId,
    ...(process.env['NODE_ENV'] === 'development' && { stack: error.stack })
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const requestId = res.locals['requestId'] || 'unknown';
  
  logger.warn('Route not found', {
    requestId,
    method: req.method,
    url: req.url
  });

  res.status(404).json({
    success: false,
    error: 'Route not found',
    code: 'NOT_FOUND',
    timestamp: new Date().toISOString(),
    requestId
  });
};
