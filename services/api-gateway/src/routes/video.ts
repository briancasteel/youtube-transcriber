import { Router, Request, Response } from 'express';
import axios from 'axios';
import { 
  createLogger
} from '../utils/logger';
import {
  createApiResponse,
  createErrorResponse,
  isValidYouTubeUrl
} from '../utils/validation';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { getRequestId } from '../middleware/requestLogger';
import { videoInfoRateLimiter } from '../middleware/rateLimiter';

const router = Router();
const logger = createLogger('api-gateway:video');

// Service URLs
const VIDEO_PROCESSOR_URL = process.env.VIDEO_PROCESSOR_URL || 'http://video-processor:8002';

// Get video information
router.get('/info', videoInfoRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const { url } = req.query;
  
  try {
    // Validate URL
    if (!url || typeof url !== 'string') {
      logger.warn('Missing video URL in request', {}, requestId);
      throw createError('Missing required parameter: url', 400, 'VALIDATION_ERROR');
    }
    
    if (!isValidYouTubeUrl(url)) {
      logger.warn('Invalid YouTube URL format', { url }, requestId);
      throw createError('Invalid YouTube URL format', 400, 'INVALID_URL');
    }
    
    logger.debug('Getting video info', { url }, requestId);

    // Forward request to video processor service
    const response = await axios.get(`${VIDEO_PROCESSOR_URL}/api/video/info`, {
      params: { url },
      headers: {
        'X-Request-ID': requestId,
      },
      timeout: 15000, // 15 seconds
    });

    res.json(createApiResponse(response.data.data));
    
  } catch (error: any) {
    if (error.response) {
      logger.error('Video processor service error', error, { 
        status: error.response.status,
        data: error.response.data 
      }, requestId);
      
      throw createError(
        error.response.data?.error || 'Video processor service error',
        error.response.status,
        error.response.data?.code || 'VIDEO_PROCESSOR_ERROR'
      );
    }
    
    // Re-throw our custom errors
    if (error.statusCode) {
      throw error;
    }
    
    logger.error('Failed to get video info', error, undefined, requestId);
    throw createError('Failed to get video info', 500, 'INTERNAL_ERROR');
  }
}));

// Process video (download and convert)
router.post('/process', asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  
  try {
    const { url, quality, format } = req.body;
    
    // Validate required fields
    if (!url) {
      logger.warn('Missing video URL in request', {}, requestId);
      throw createError('Missing required field: url', 400, 'VALIDATION_ERROR');
    }
    
    if (!isValidYouTubeUrl(url)) {
      logger.warn('Invalid YouTube URL format', { url }, requestId);
      throw createError('Invalid YouTube URL format', 400, 'INVALID_URL');
    }
    
    logger.info('Starting video processing', { 
      url,
      quality: quality || 'highestaudio',
      format: format || 'mp3'
    }, requestId);

    // Forward request to video processor service
    const response = await axios.post(`${VIDEO_PROCESSOR_URL}/api/video/process`, {
      url,
      quality: quality || 'highestaudio',
      format: format || 'mp3'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      timeout: 30000, // 30 seconds
    });

    logger.info('Video processing started successfully', { 
      jobId: response.data.data?.jobId 
    }, requestId);

    res.status(202).json(createApiResponse(response.data.data));
    
  } catch (error: any) {
    if (error.response) {
      logger.error('Video processor service error', error, { 
        status: error.response.status,
        data: error.response.data 
      }, requestId);
      
      throw createError(
        error.response.data?.error || 'Video processor service error',
        error.response.status,
        error.response.data?.code || 'VIDEO_PROCESSOR_ERROR'
      );
    }
    
    // Re-throw our custom errors
    if (error.statusCode) {
      throw error;
    }
    
    logger.error('Failed to start video processing', error, undefined, requestId);
    throw createError('Failed to start video processing', 500, 'INTERNAL_ERROR');
  }
}));

// Get video processing status
router.get('/status/:jobId', asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const { jobId } = req.params;
  
  // Validate job ID
  if (!jobId || typeof jobId !== 'string') {
    logger.warn('Invalid job ID format', { jobId }, requestId);
    throw createError('Invalid job ID format', 400, 'INVALID_JOB_ID');
  }

  try {
    logger.debug('Getting video processing status', { jobId }, requestId);

    const response = await axios.get(`${VIDEO_PROCESSOR_URL}/api/video/status/${jobId}`, {
      headers: {
        'X-Request-ID': requestId,
      },
      timeout: 10000, // 10 seconds
    });

    res.json(createApiResponse(response.data.data));
    
  } catch (error: any) {
    if (error.response?.status === 404) {
      logger.warn('Video processing job not found', { jobId }, requestId);
      throw createError('Video processing job not found', 404, 'JOB_NOT_FOUND');
    }
    
    if (error.response) {
      logger.error('Video processor service error', error, { 
        status: error.response.status,
        data: error.response.data 
      }, requestId);
      
      throw createError(
        error.response.data?.error || 'Video processor service error',
        error.response.status,
        error.response.data?.code || 'VIDEO_PROCESSOR_ERROR'
      );
    }
    
    logger.error('Failed to get video processing status', error, { jobId }, requestId);
    throw createError('Failed to get video processing status', 500, 'INTERNAL_ERROR');
  }
}));

export { router as videoRoutes };
