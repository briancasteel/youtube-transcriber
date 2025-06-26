import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { YouTubeTranscriptionAgent, TranscriptionOptions } from '../agents/YouTubeTranscriptionAgent';
import logger from '../utils/logger';

const router = Router();

// Request validation schema
const transcribeRequestSchema = z.object({
  videoUrl: z.string().url('Invalid URL format'),
  options: z.object({
    language: z.string().optional(),
    includeTimestamps: z.boolean().optional(),
    enhanceText: z.boolean().optional(),
    audioQuality: z.string().optional(),
    audioFormat: z.string().optional()
  }).optional()
});

// Response interfaces
interface TranscribeResponse {
  success: boolean;
  data?: any;
  error?: string;
  executionId?: string;
}

interface AgentStatusResponse {
  success: boolean;
  data?: {
    available: boolean;
    model: string;
    tools: string[];
  };
  error?: string;
}

// Initialize the agent
const transcriptionAgent = new YouTubeTranscriptionAgent();

/**
 * POST /api/transcribe
 * Main transcription endpoint - processes YouTube video with AI agent
 */
router.post('/transcribe', async (req: Request, res: Response<TranscribeResponse>): Promise<void> => {
  const startTime = Date.now();
  
  try {
    // Validate request body
    const validationResult = transcribeRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: `Invalid request: ${validationResult.error.errors.map(e => e.message).join(', ')}`
      });
      return;
    }

    const { videoUrl, options = {} } = validationResult.data;

    logger.info('Transcription request received', {
      videoUrl,
      options,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });

    // Process with AI agent
    const result = await transcriptionAgent.transcribe(videoUrl, options as TranscriptionOptions);

    const processingTime = Date.now() - startTime;

    logger.info('Transcription completed successfully', {
      videoUrl,
      videoId: result.videoId,
      title: result.title,
      processingTime,
      textLength: result.captions.reduce((total, caption) => total + caption.text.length, 0)
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    logger.error('Transcription failed', {
      error: errorMessage,
      videoUrl: req.body?.videoUrl,
      processingTime,
      stack: error instanceof Error ? error.stack : undefined
    });

    // Determine appropriate status code based on error type
    let statusCode = 500;
    if (errorMessage.includes('Invalid URL') || errorMessage.includes('validation')) {
      statusCode = 400;
    } else if (errorMessage.includes('not found') || errorMessage.includes('unavailable')) {
      statusCode = 404;
    } else if (errorMessage.includes('timeout') || errorMessage.includes('rate limit')) {
      statusCode = 429;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * GET /api/agent/status
 * Get agent status and available tools
 */
router.get('/agent/status', async (req: Request, res: Response<AgentStatusResponse>) => {
  try {
    const status = await transcriptionAgent.getAgentStatus();

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    logger.error('Failed to get agent status', {
      error: errorMessage
    });

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * POST /api/validate
 * Validate YouTube URL without processing
 */
router.post('/validate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { videoUrl } = req.body;

    if (!videoUrl || typeof videoUrl !== 'string') {
      res.status(400).json({
        success: false,
        error: 'videoUrl is required and must be a string'
      });
      return;
    }

    // Use the agent's validator tool directly
    const agent = new YouTubeTranscriptionAgent();
    const validation = await (agent as any).tools[0].func({ videoUrl });

    res.json({
      success: true,
      data: validation
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    logger.error('URL validation failed', {
      error: errorMessage,
      videoUrl: req.body?.videoUrl
    });

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'youtube-transcription-agent',
      version: '1.0.0'
    }
  });
});

export default router;
