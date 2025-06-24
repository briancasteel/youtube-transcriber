import { Router, Request, Response } from 'express';
import axios from 'axios';
import { 
  createLogger
} from '../utils/logger';
import {
  validateStartTranscriptionRequest, 
  validateGetVideoInfoRequest,
  createApiResponse,
  createErrorResponse,
  isValidYouTubeUrl,
  isValidJobId 
} from '../utils/validation';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { getRequestId } from '../middleware/requestLogger';
import { transcriptionRateLimiter, videoInfoRateLimiter } from '../middleware/rateLimiter';

const router = Router();
const logger = createLogger('api-gateway');

// Service URLs
const WORKFLOW_SERVICE_URL = process.env.WORKFLOW_SERVICE_URL || 'http://workflow-service:8001';

// Start transcription job
router.post('/transcribe', transcriptionRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  
  try {
    // Validate request body
    const validatedData = validateStartTranscriptionRequest(req.body);
    
    logger.info('Starting transcription job', { 
      youtubeUrl: validatedData.youtubeUrl,
      options: validatedData.options 
    }, requestId);

    // Forward request to workflow service
    const response = await axios.post(`${WORKFLOW_SERVICE_URL}/transcribe`, validatedData, {
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      timeout: 30000, // 30 seconds
    });

    logger.info('Transcription job started successfully', { 
      jobId: response.data.jobId 
    }, requestId);

    res.status(201).json(createApiResponse(response.data));
    
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('Invalid transcription request', { errors: error.errors }, requestId);
      throw createError('Invalid request data', 400, 'VALIDATION_ERROR', error.errors);
    }
    
    if (error.response) {
      // Forward error from workflow service
      logger.error('Workflow service error', error, { 
        status: error.response.status,
        data: error.response.data 
      }, requestId);
      
      throw createError(
        error.response.data?.error || 'Workflow service error',
        error.response.status,
        error.response.data?.code || 'WORKFLOW_ERROR',
        error.response.data
      );
    }
    
    logger.error('Failed to start transcription job', error, undefined, requestId);
    throw createError('Failed to start transcription job', 500, 'INTERNAL_ERROR');
  }
}));

// Get job status
router.get('/transcribe/:jobId', asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const { jobId } = req.params;
  
  // Validate job ID
  if (!isValidJobId(jobId)) {
    logger.warn('Invalid job ID format', { jobId }, requestId);
    throw createError('Invalid job ID format', 400, 'INVALID_JOB_ID');
  }

  try {
    logger.debug('Getting job status', { jobId }, requestId);

    const response = await axios.get(`${WORKFLOW_SERVICE_URL}/transcribe/${jobId}`, {
      headers: {
        'X-Request-ID': requestId,
      },
      timeout: 10000, // 10 seconds
    });

    res.json(createApiResponse(response.data));
    
  } catch (error: any) {
    if (error.response?.status === 404) {
      logger.warn('Job not found', { jobId }, requestId);
      throw createError('Job not found', 404, 'JOB_NOT_FOUND');
    }
    
    if (error.response) {
      logger.error('Workflow service error', error, { 
        status: error.response.status,
        data: error.response.data 
      }, requestId);
      
      throw createError(
        error.response.data?.error || 'Workflow service error',
        error.response.status,
        error.response.data?.code || 'WORKFLOW_ERROR'
      );
    }
    
    logger.error('Failed to get job status', error, { jobId }, requestId);
    throw createError('Failed to get job status', 500, 'INTERNAL_ERROR');
  }
}));

// Get transcription result
router.get('/transcribe/:jobId/result', asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const { jobId } = req.params;
  
  // Validate job ID
  if (!isValidJobId(jobId)) {
    logger.warn('Invalid job ID format', { jobId }, requestId);
    throw createError('Invalid job ID format', 400, 'INVALID_JOB_ID');
  }

  try {
    logger.debug('Getting transcription result', { jobId }, requestId);

    const response = await axios.get(`${WORKFLOW_SERVICE_URL}/transcribe/${jobId}/result`, {
      headers: {
        'X-Request-ID': requestId,
      },
      timeout: 10000, // 10 seconds
    });

    res.json(createApiResponse(response.data));
    
  } catch (error: any) {
    if (error.response?.status === 404) {
      logger.warn('Job or result not found', { jobId }, requestId);
      throw createError('Job or result not found', 404, 'RESULT_NOT_FOUND');
    }
    
    if (error.response?.status === 202) {
      logger.info('Job still processing', { jobId }, requestId);
      throw createError('Job is still processing', 202, 'JOB_PROCESSING');
    }
    
    if (error.response) {
      logger.error('Workflow service error', error, { 
        status: error.response.status,
        data: error.response.data 
      }, requestId);
      
      throw createError(
        error.response.data?.error || 'Workflow service error',
        error.response.status,
        error.response.data?.code || 'WORKFLOW_ERROR'
      );
    }
    
    logger.error('Failed to get transcription result', error, { jobId }, requestId);
    throw createError('Failed to get transcription result', 500, 'INTERNAL_ERROR');
  }
}));

// Cancel transcription job
router.post('/transcribe/:jobId/cancel', asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const { jobId } = req.params;
  
  // Validate job ID
  if (!isValidJobId(jobId)) {
    logger.warn('Invalid job ID format', { jobId }, requestId);
    throw createError('Invalid job ID format', 400, 'INVALID_JOB_ID');
  }

  try {
    logger.info('Cancelling transcription job', { jobId }, requestId);

    const response = await axios.post(`${WORKFLOW_SERVICE_URL}/transcribe/${jobId}/cancel`, {}, {
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      timeout: 10000, // 10 seconds
    });

    logger.info('Transcription job cancelled', { jobId }, requestId);
    res.json(createApiResponse(response.data));
    
  } catch (error: any) {
    if (error.response?.status === 404) {
      logger.warn('Job not found for cancellation', { jobId }, requestId);
      throw createError('Job not found', 404, 'JOB_NOT_FOUND');
    }
    
    if (error.response?.status === 409) {
      logger.warn('Job cannot be cancelled', { jobId }, requestId);
      throw createError('Job cannot be cancelled', 409, 'JOB_NOT_CANCELLABLE');
    }
    
    if (error.response) {
      logger.error('Workflow service error', error, { 
        status: error.response.status,
        data: error.response.data 
      }, requestId);
      
      throw createError(
        error.response.data?.error || 'Workflow service error',
        error.response.status,
        error.response.data?.code || 'WORKFLOW_ERROR'
      );
    }
    
    logger.error('Failed to cancel transcription job', error, { jobId }, requestId);
    throw createError('Failed to cancel transcription job', 500, 'INTERNAL_ERROR');
  }
}));

// Get video information
router.get('/video-info', videoInfoRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  
  try {
    // Validate query parameters
    const validatedData = validateGetVideoInfoRequest(req.query);
    
    logger.debug('Getting video info', { url: validatedData.url }, requestId);

    // Forward request to workflow service
    const response = await axios.get(`${WORKFLOW_SERVICE_URL}/video-info`, {
      params: validatedData,
      headers: {
        'X-Request-ID': requestId,
      },
      timeout: 15000, // 15 seconds
    });

    res.json(createApiResponse(response.data));
    
  } catch (error: any) {
    if (error.name === 'ZodError') {
      logger.warn('Invalid video info request', { errors: error.errors }, requestId);
      throw createError('Invalid request parameters', 400, 'VALIDATION_ERROR', error.errors);
    }
    
    if (error.response) {
      logger.error('Workflow service error', error, { 
        status: error.response.status,
        data: error.response.data 
      }, requestId);
      
      throw createError(
        error.response.data?.error || 'Workflow service error',
        error.response.status,
        error.response.data?.code || 'WORKFLOW_ERROR'
      );
    }
    
    logger.error('Failed to get video info', error, undefined, requestId);
    throw createError('Failed to get video info', 500, 'INTERNAL_ERROR');
  }
}));

export { router as transcriptionRoutes };
