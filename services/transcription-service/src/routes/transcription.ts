import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { TranscriptionService } from '../services/TranscriptionService';

const router = Router();

const transcribeFromJobSchema = z.object({
  jobId: z.string().uuid(),
  audioPath: z.string(),
  language: z.string().optional().default('auto'),
  model: z.enum(['tiny', 'base', 'small', 'medium', 'large']).optional().default('base'),
  format: z.enum(['text', 'srt', 'vtt', 'json']).optional().default('text'),
  includeTimestamps: z.boolean().optional().default(false),
  includeWordTimestamps: z.boolean().optional().default(false)
});

// Initialize transcription service
const transcriptionService = new TranscriptionService();

// Note: File upload functionality will be added later with proper multer setup

// Transcribe from existing job (called by video processor)
router.post('/from-job', asyncHandler(async (req: Request, res: Response) => {
  const validatedData = transcribeFromJobSchema.parse(req.body);
  
  logger.info('Transcription requested from job', {
    jobId: validatedData.jobId,
    audioPath: validatedData.audioPath,
    requestId: res.locals['requestId']
  });

  try {
    // Start transcription process
    const result = await transcriptionService.transcribeFromJob(validatedData);

    res.status(202).json({
      success: true,
      data: {
        transcriptionId: validatedData.jobId,
        status: 'processing',
        estimatedTime: '2-5 minutes',
        statusUrl: `/api/transcription/status/${validatedData.jobId}`,
        ...result
      },
      message: 'Transcription started from job',
      timestamp: new Date().toISOString(),
      requestId: res.locals['requestId']
    });

  } catch (error) {
    logger.error('Failed to start transcription from job', {
      error: (error as Error).message,
      jobId: validatedData.jobId,
      requestId: res.locals['requestId']
    });
    
    throw createError('Failed to start transcription from job', 500, 'TRANSCRIPTION_JOB_ERROR');
  }
}));

// Get transcription status
router.get('/status/:transcriptionId', asyncHandler(async (req: Request, res: Response) => {
  const { transcriptionId } = req.params;
  
  if (!transcriptionId || typeof transcriptionId !== 'string') {
    throw createError('Invalid transcription ID', 400, 'INVALID_TRANSCRIPTION_ID');
  }

  try {
    const status = await transcriptionService.getTranscriptionStatus(transcriptionId);
    
    if (!status) {
      throw createError('Transcription not found', 404, 'TRANSCRIPTION_NOT_FOUND');
    }

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString(),
      requestId: res.locals['requestId']
    });

  } catch (error) {
    if ((error as any).code === 'TRANSCRIPTION_NOT_FOUND') {
      throw error;
    }
    
    logger.error('Failed to get transcription status', {
      error: (error as Error).message,
      transcriptionId,
      requestId: res.locals['requestId']
    });
    
    throw createError('Failed to retrieve transcription status', 500, 'STATUS_RETRIEVAL_ERROR');
  }
}));

// Get transcription result
router.get('/result/:transcriptionId', asyncHandler(async (req: Request, res: Response) => {
  const { transcriptionId } = req.params;
  const { format } = req.query;
  
  if (!transcriptionId || typeof transcriptionId !== 'string') {
    throw createError('Invalid transcription ID', 400, 'INVALID_TRANSCRIPTION_ID');
  }

  try {
    const result = await transcriptionService.getTranscriptionResult(
      transcriptionId, 
      format as string
    );
    
    if (!result) {
      throw createError('Transcription result not found', 404, 'RESULT_NOT_FOUND');
    }

    // Set appropriate content type based on format
    if (format === 'srt') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    } else if (format === 'vtt') {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    } else if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    } else {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
      requestId: res.locals['requestId']
    });

  } catch (error) {
    if ((error as any).code === 'RESULT_NOT_FOUND') {
      throw error;
    }
    
    logger.error('Failed to get transcription result', {
      error: (error as Error).message,
      transcriptionId,
      requestId: res.locals['requestId']
    });
    
    throw createError('Failed to retrieve transcription result', 500, 'RESULT_RETRIEVAL_ERROR');
  }
}));

// List transcriptions
router.get('/list', asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '10', status } = req.query;
  
  try {
    const transcriptions = await transcriptionService.listTranscriptions({
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      status: status as string
    });

    res.json({
      success: true,
      data: transcriptions,
      timestamp: new Date().toISOString(),
      requestId: res.locals['requestId']
    });

  } catch (error) {
    logger.error('Failed to list transcriptions', {
      error: (error as Error).message,
      requestId: res.locals['requestId']
    });
    
    throw createError('Failed to list transcriptions', 500, 'LIST_RETRIEVAL_ERROR');
  }
}));

export { router as transcriptionRouter };
