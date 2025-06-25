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
import { transcriptionRateLimiter } from '../middleware/rateLimiter';

const router = Router();
const logger = createLogger('api-gateway:workflow');

// Service URLs - Fixed to use correct port
const WORKFLOW_SERVICE_URL = process.env.WORKFLOW_SERVICE_URL || 'http://workflow-service:8004';

// Start YouTube transcription workflow
router.post('/youtube-transcription', transcriptionRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  
  try {
    const { url, whisperOptions, enhancementOptions } = req.body;
    
    // Validate required fields
    if (!url) {
      logger.warn('Missing YouTube URL in request', {}, requestId);
      throw createError('Missing required field: url', 400, 'VALIDATION_ERROR');
    }
    
    if (!isValidYouTubeUrl(url)) {
      logger.warn('Invalid YouTube URL format', { url }, requestId);
      throw createError('Invalid YouTube URL format', 400, 'INVALID_URL');
    }
    
    logger.info('Starting YouTube transcription workflow', { 
      url,
      whisperOptions,
      enhancementOptions 
    }, requestId);

    // Map frontend parameters to workflow service format
    const workflowRequest = {
      videoUrl: url,
      options: {
        language: whisperOptions?.language || 'auto',
        transcriptionModel: whisperOptions?.model || 'whisper-1',
        enhancementType: enhancementOptions?.addPunctuation ? 'grammar_and_punctuation' : 'none',
        priority: 'normal',
        tags: ['youtube', 'transcription']
      }
    };

    // Forward request to workflow service
    const response = await axios.post(`${WORKFLOW_SERVICE_URL}/api/workflow/youtube-transcription`, workflowRequest, {
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      timeout: 30000, // 30 seconds
    });

    logger.info('YouTube transcription workflow started successfully', { 
      executionId: response.data.data?.executionId 
    }, requestId);

    res.status(202).json(createApiResponse(response.data.data));
    
  } catch (error: any) {
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
    
    // Re-throw our custom errors
    if (error.statusCode) {
      throw error;
    }
    
    logger.error('Failed to start YouTube transcription workflow', error, undefined, requestId);
    throw createError('Failed to start transcription workflow', 500, 'INTERNAL_ERROR');
  }
}));

// Get workflow execution status
router.get('/execution/:executionId', asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const { executionId } = req.params;
  
  // Validate execution ID
  if (!executionId || executionId.length < 10) {
    logger.warn('Invalid execution ID format', { executionId }, requestId);
    throw createError('Invalid execution ID format', 400, 'INVALID_EXECUTION_ID');
  }

  try {
    logger.debug('Getting workflow execution status', { executionId }, requestId);

    const response = await axios.get(`${WORKFLOW_SERVICE_URL}/api/workflow/execution/${executionId}`, {
      headers: {
        'X-Request-ID': requestId,
      },
      timeout: 10000, // 10 seconds
    });

    res.json(createApiResponse(response.data.data));
    
  } catch (error: any) {
    if (error.response?.status === 404) {
      logger.warn('Workflow execution not found', { executionId }, requestId);
      throw createError('Workflow execution not found', 404, 'EXECUTION_NOT_FOUND');
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
    
    logger.error('Failed to get workflow execution status', error, { executionId }, requestId);
    throw createError('Failed to get execution status', 500, 'INTERNAL_ERROR');
  }
}));

// Cancel workflow execution
router.post('/execution/:executionId/cancel', asyncHandler(async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const { executionId } = req.params;
  
  // Validate execution ID
  if (!executionId || executionId.length < 10) {
    logger.warn('Invalid execution ID format', { executionId }, requestId);
    throw createError('Invalid execution ID format', 400, 'INVALID_EXECUTION_ID');
  }

  try {
    logger.info('Cancelling workflow execution', { executionId }, requestId);

    const response = await axios.post(`${WORKFLOW_SERVICE_URL}/api/workflow/execution/${executionId}/cancel`, {}, {
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      timeout: 10000, // 10 seconds
    });

    logger.info('Workflow execution cancelled successfully', { executionId }, requestId);
    res.json(createApiResponse(response.data.data));
    
  } catch (error: any) {
    if (error.response?.status === 404) {
      logger.warn('Workflow execution not found for cancellation', { executionId }, requestId);
      throw createError('Workflow execution not found', 404, 'EXECUTION_NOT_FOUND');
    }
    
    if (error.response?.status === 400) {
      logger.warn('Workflow execution cannot be cancelled', { executionId }, requestId);
      throw createError('Workflow execution cannot be cancelled', 400, 'EXECUTION_NOT_CANCELLABLE');
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
    
    logger.error('Failed to cancel workflow execution', error, { executionId }, requestId);
    throw createError('Failed to cancel execution', 500, 'INTERNAL_ERROR');
  }
}));

export { router as workflowRoutes };
