import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { createLogger } from '../utils/logger';

const logger = createLogger('api-gateway');

// General rate limiter for all requests
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string;
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    }, requestId);
    
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
      timestamp: new Date().toISOString(),
      requestId,
    });
  },
});

// Stricter rate limiter for transcription requests
export const transcriptionRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 transcription requests per hour
  message: {
    success: false,
    error: 'Too many transcription requests, please try again later',
    code: 'TRANSCRIPTION_RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string;
    logger.warn('Transcription rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    }, requestId);
    
    res.status(429).json({
      success: false,
      error: 'Too many transcription requests from this IP, please try again in an hour',
      code: 'TRANSCRIPTION_RATE_LIMIT_EXCEEDED',
      timestamp: new Date().toISOString(),
      requestId,
    });
  },
});

// Rate limiter for video info requests
export const videoInfoRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // Limit each IP to 30 video info requests per 5 minutes
  message: {
    success: false,
    error: 'Too many video info requests, please try again later',
    code: 'VIDEO_INFO_RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string;
    logger.warn('Video info rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    }, requestId);
    
    res.status(429).json({
      success: false,
      error: 'Too many video info requests from this IP, please try again later',
      code: 'VIDEO_INFO_RATE_LIMIT_EXCEEDED',
      timestamp: new Date().toISOString(),
      requestId,
    });
  },
});
