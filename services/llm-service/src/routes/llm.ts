import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import logger from '../utils/logger';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { LLMService, ProcessTranscriptionRequest } from '../services/LLMService';
import { WhisperOptions } from '../services/WhisperService';
import { TextEnhancementOptions } from '../services/OllamaService';

const router = Router();

// Initialize LLM service
const llmService = new LLMService();

// Initialize the service when the module loads
llmService.initialize().catch(error => {
  logger.error('Failed to initialize LLM service', { error });
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req: any, file: any, cb: any) => {
    const uploadDir = process.env['UPLOAD_DIR'] || '/app/uploads';
    cb(null, uploadDir);
  },
  filename: (req: any, file: any, cb: any) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    // Accept audio files
    const allowedMimes = [
      'audio/mpeg',
      'audio/wav',
      'audio/mp3',
      'audio/mp4',
      'audio/aac',
      'audio/ogg',
      'audio/webm',
      'video/mp4', // For video files that will be converted to audio
      'video/webm',
      'video/quicktime'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio and video files are allowed.'));
    }
  }
});

// Validation schemas
const processTranscriptionSchema = z.object({
  whisperOptions: z.object({
    model: z.enum(['tiny', 'base', 'small', 'medium', 'large']).optional(),
    language: z.string().optional(),
    outputFormat: z.enum(['txt', 'srt', 'vtt', 'json']).optional(),
    includeTimestamps: z.boolean().optional(),
    includeWordTimestamps: z.boolean().optional(),
    temperature: z.number().min(0).max(1).optional(),
    maxTokens: z.number().positive().optional()
  }).optional(),
  enhancementOptions: z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(1).optional(),
    maxTokens: z.number().positive().optional(),
    addPunctuation: z.boolean().optional(),
    fixGrammar: z.boolean().optional(),
    improveClarity: z.boolean().optional(),
    generateSummary: z.boolean().optional(),
    extractKeywords: z.boolean().optional()
  }).optional()
});

const processFromPathSchema = z.object({
  audioPath: z.string().min(1),
  originalFilename: z.string().optional(),
  whisperOptions: z.object({
    model: z.enum(['tiny', 'base', 'small', 'medium', 'large']).optional(),
    language: z.string().optional(),
    outputFormat: z.enum(['txt', 'srt', 'vtt', 'json']).optional(),
    includeTimestamps: z.boolean().optional(),
    includeWordTimestamps: z.boolean().optional(),
    temperature: z.number().min(0).max(1).optional(),
    maxTokens: z.number().positive().optional()
  }).optional(),
  enhancementOptions: z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(1).optional(),
    maxTokens: z.number().positive().optional(),
    addPunctuation: z.boolean().optional(),
    fixGrammar: z.boolean().optional(),
    improveClarity: z.boolean().optional(),
    generateSummary: z.boolean().optional(),
    extractKeywords: z.boolean().optional()
  }).optional()
});

// Helper function to convert Zod output to proper types
function convertWhisperOptions(options: any): WhisperOptions | undefined {
  if (!options) return undefined;
  
  const result: WhisperOptions = {};
  if (options.model !== undefined) result.model = options.model;
  if (options.language !== undefined) result.language = options.language;
  if (options.outputFormat !== undefined) result.outputFormat = options.outputFormat;
  if (options.includeTimestamps !== undefined) result.includeTimestamps = options.includeTimestamps;
  if (options.includeWordTimestamps !== undefined) result.includeWordTimestamps = options.includeWordTimestamps;
  if (options.temperature !== undefined) result.temperature = options.temperature;
  if (options.maxTokens !== undefined) result.maxTokens = options.maxTokens;
  
  return Object.keys(result).length > 0 ? result : undefined;
}

function convertEnhancementOptions(options: any): TextEnhancementOptions | undefined {
  if (!options) return undefined;
  
  const result: TextEnhancementOptions = {};
  if (options.model !== undefined) result.model = options.model;
  if (options.temperature !== undefined) result.temperature = options.temperature;
  if (options.maxTokens !== undefined) result.maxTokens = options.maxTokens;
  if (options.addPunctuation !== undefined) result.addPunctuation = options.addPunctuation;
  if (options.fixGrammar !== undefined) result.fixGrammar = options.fixGrammar;
  if (options.improveClarity !== undefined) result.improveClarity = options.improveClarity;
  if (options.generateSummary !== undefined) result.generateSummary = options.generateSummary;
  if (options.extractKeywords !== undefined) result.extractKeywords = options.extractKeywords;
  
  return Object.keys(result).length > 0 ? result : undefined;
}

// POST /api/llm/transcribe - Upload and transcribe audio file
router.post('/transcribe', upload.single('audio'), asyncHandler(async (req: Request & { file?: any }, res: Response) => {
  const requestId = res.locals['requestId'];
  
  if (!req.file) {
    throw createError('No audio file provided', 400, 'MISSING_FILE');
  }

  logger.info('Audio file uploaded for transcription', {
    requestId,
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype
  });

  try {
    // Validate request body
    const validatedData = processTranscriptionSchema.parse(req.body);

    // Build request object with proper types
    const transcriptionRequest: ProcessTranscriptionRequest = {
      audioPath: req.file.path,
      originalFilename: req.file.originalname
    };

    const whisperOptions = convertWhisperOptions(validatedData.whisperOptions);
    if (whisperOptions) {
      transcriptionRequest.whisperOptions = whisperOptions;
    }

    const enhancementOptions = convertEnhancementOptions(validatedData.enhancementOptions);
    if (enhancementOptions) {
      transcriptionRequest.enhancementOptions = enhancementOptions;
    }

    // Process transcription
    const jobId = await llmService.processTranscription(transcriptionRequest);

    res.status(202).json({
      success: true,
      data: {
        jobId,
        status: 'queued',
        message: 'Transcription job created successfully'
      },
      timestamp: new Date().toISOString(),
      requestId
    });

  } catch (error) {
    logger.error('Failed to process transcription request', {
      requestId,
      filename: req.file.filename,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}));

// POST /api/llm/transcribe-from-path - Transcribe from existing audio file path
router.post('/transcribe-from-path', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  
  try {
    // Validate request body
    const validatedData = processFromPathSchema.parse(req.body);

    logger.info('Processing transcription from path', {
      requestId,
      audioPath: validatedData.audioPath,
      originalFilename: validatedData.originalFilename
    });

    // Build request object with proper types
    const transcriptionRequest: ProcessTranscriptionRequest = {
      audioPath: validatedData.audioPath
    };

    if (validatedData.originalFilename) {
      transcriptionRequest.originalFilename = validatedData.originalFilename;
    }

    const whisperOptions = convertWhisperOptions(validatedData.whisperOptions);
    if (whisperOptions) {
      transcriptionRequest.whisperOptions = whisperOptions;
    }

    const enhancementOptions = convertEnhancementOptions(validatedData.enhancementOptions);
    if (enhancementOptions) {
      transcriptionRequest.enhancementOptions = enhancementOptions;
    }

    // Process transcription
    const jobId = await llmService.processTranscription(transcriptionRequest);

    res.status(202).json({
      success: true,
      data: {
        jobId,
        status: 'queued',
        message: 'Transcription job created successfully'
      },
      timestamp: new Date().toISOString(),
      requestId
    });

  } catch (error) {
    logger.error('Failed to process transcription from path', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}));

// GET /api/llm/jobs/:jobId/status - Get job status
router.get('/jobs/:jobId/status', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  const { jobId } = req.params;

  if (!jobId) {
    throw createError('Job ID is required', 400, 'MISSING_JOB_ID');
  }

  logger.debug('Getting job status', { requestId, jobId });

  const job = await llmService.getJobStatus(jobId);
  
  if (!job) {
    throw createError('Job not found', 404, 'JOB_NOT_FOUND');
  }

  res.status(200).json({
    success: true,
    data: {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
      error: job.error
    },
    timestamp: new Date().toISOString(),
    requestId
  });
}));

// GET /api/llm/jobs/:jobId/result - Get job result
router.get('/jobs/:jobId/result', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  const { jobId } = req.params;

  if (!jobId) {
    throw createError('Job ID is required', 400, 'MISSING_JOB_ID');
  }

  logger.debug('Getting job result', { requestId, jobId });

  const result = await llmService.getJobResult(jobId);
  
  if (!result) {
    const job = await llmService.getJobStatus(jobId);
    if (!job) {
      throw createError('Job not found', 404, 'JOB_NOT_FOUND');
    }
    if (job.status === 'failed') {
      throw createError(`Job failed: ${job.error}`, 400, 'JOB_FAILED');
    }
    if (job.status !== 'completed') {
      throw createError('Job not completed yet', 400, 'JOB_NOT_COMPLETED');
    }
  }

  res.status(200).json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
    requestId
  });
}));

// GET /api/llm/jobs - List jobs with pagination
router.get('/jobs', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  logger.debug('Listing jobs', { requestId, limit, offset });

  const jobs = await llmService.listJobs(limit, offset);

  res.status(200).json({
    success: true,
    data: {
      jobs: jobs.map(job => ({
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        originalFilename: job.originalFilename,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
        error: job.error
      })),
      pagination: {
        limit,
        offset,
        total: jobs.length
      }
    },
    timestamp: new Date().toISOString(),
    requestId
  });
}));

// DELETE /api/llm/jobs/:jobId - Cancel job
router.delete('/jobs/:jobId', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  const { jobId } = req.params;

  if (!jobId) {
    throw createError('Job ID is required', 400, 'MISSING_JOB_ID');
  }

  logger.info('Cancelling job', { requestId, jobId });

  const cancelled = await llmService.cancelJob(jobId);
  
  if (!cancelled) {
    throw createError('Job not found or cannot be cancelled', 400, 'CANNOT_CANCEL_JOB');
  }

  res.status(200).json({
    success: true,
    data: {
      jobId,
      message: 'Job cancelled successfully'
    },
    timestamp: new Date().toISOString(),
    requestId
  });
}));

// GET /api/llm/models/whisper - Get available Whisper models
router.get('/models/whisper', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  
  logger.debug('Getting available Whisper models', { requestId });

  const models = await llmService.getAvailableWhisperModels();

  res.status(200).json({
    success: true,
    data: {
      models
    },
    timestamp: new Date().toISOString(),
    requestId
  });
}));

// GET /api/llm/models/ollama - Get available Ollama models
router.get('/models/ollama', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  
  logger.debug('Getting available Ollama models', { requestId });

  const models = await llmService.getAvailableOllamaModels();

  res.status(200).json({
    success: true,
    data: {
      models
    },
    timestamp: new Date().toISOString(),
    requestId
  });
}));

// GET /api/llm/health - Get service health status
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  
  logger.debug('Checking LLM service health', { requestId });

  const health = await llmService.checkHealth();

  const statusCode = health.overall ? 200 : 503;

  res.status(statusCode).json({
    success: health.overall,
    data: health,
    timestamp: new Date().toISOString(),
    requestId
  });
}));

export default router;
