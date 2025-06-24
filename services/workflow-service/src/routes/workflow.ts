import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { WorkflowEngine } from '../services/WorkflowEngine';
import { WorkflowDefinition } from '../types/workflow';
import logger from '../utils/logger';

const router = Router();
const workflowEngine = new WorkflowEngine();

// Initialize workflow engine
workflowEngine.initialize().catch(error => {
  logger.error('Failed to initialize workflow engine', {
    error: error instanceof Error ? error.message : 'Unknown error'
  });
});

// Execute a workflow
router.post('/execute', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  
  logger.info('Workflow execution request received', { 
    requestId,
    body: req.body 
  });

  const { workflowDefinition, input, metadata } = req.body;

  // Validate required fields
  if (!workflowDefinition || !input) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: workflowDefinition and input are required',
      timestamp: new Date().toISOString(),
      requestId
    });
  }

  // Validate workflow definition structure
  if (!workflowDefinition.id || !workflowDefinition.steps || !Array.isArray(workflowDefinition.steps)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid workflow definition: must have id and steps array',
      timestamp: new Date().toISOString(),
      requestId
    });
  }

  try {
    const executionId = await workflowEngine.executeWorkflow(
      workflowDefinition as WorkflowDefinition,
      input,
      {
        userId: metadata?.userId,
        source: metadata?.source || 'api',
        priority: metadata?.priority || 'normal',
        tags: metadata?.tags || []
      }
    );

    logger.info('Workflow execution started', {
      requestId,
      executionId,
      workflowId: workflowDefinition.id
    });

    return res.status(202).json({
      success: true,
      data: {
        executionId,
        status: 'started',
        message: 'Workflow execution initiated successfully'
      },
      timestamp: new Date().toISOString(),
      requestId
    });
  } catch (error) {
    logger.error('Failed to execute workflow', {
      requestId,
      workflowId: workflowDefinition.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to execute workflow',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      requestId
    });
  }
}));

// Get workflow execution status
router.get('/execution/:executionId', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  const { executionId } = req.params;

  if (!executionId) {
    return res.status(400).json({
      success: false,
      error: 'Missing execution ID',
      timestamp: new Date().toISOString(),
      requestId
    });
  }

  logger.debug('Workflow execution status request', {
    requestId,
    executionId
  });

  try {
    const execution = await workflowEngine.getExecution(executionId);

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Workflow execution not found',
        timestamp: new Date().toISOString(),
        requestId
      });
    }

    return res.status(200).json({
      success: true,
      data: execution,
      timestamp: new Date().toISOString(),
      requestId
    });
  } catch (error) {
    logger.error('Failed to get workflow execution', {
      requestId,
      executionId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get workflow execution',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      requestId
    });
  }
}));

// Cancel workflow execution
router.post('/execution/:executionId/cancel', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  const { executionId } = req.params;

  if (!executionId) {
    return res.status(400).json({
      success: false,
      error: 'Missing execution ID',
      timestamp: new Date().toISOString(),
      requestId
    });
  }

  logger.info('Workflow execution cancellation request', {
    requestId,
    executionId
  });

  try {
    const cancelled = await workflowEngine.cancelExecution(executionId);

    if (!cancelled) {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel workflow execution (not found or already completed)',
        timestamp: new Date().toISOString(),
        requestId
      });
    }

    logger.info('Workflow execution cancelled', {
      requestId,
      executionId
    });

    return res.status(200).json({
      success: true,
      data: {
        executionId,
        status: 'cancelled',
        message: 'Workflow execution cancelled successfully'
      },
      timestamp: new Date().toISOString(),
      requestId
    });
  } catch (error) {
    logger.error('Failed to cancel workflow execution', {
      requestId,
      executionId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to cancel workflow execution',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      requestId
    });
  }
}));

// Predefined workflow: YouTube transcription
router.post('/youtube-transcription', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  
  logger.info('YouTube transcription workflow request', { 
    requestId,
    body: req.body 
  });

  const { videoUrl, options = {} } = req.body;

  if (!videoUrl) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: videoUrl',
      timestamp: new Date().toISOString(),
      requestId
    });
  }

  // Define YouTube transcription workflow
  const workflowDefinition: WorkflowDefinition = {
    id: 'youtube-transcription-v1',
    name: 'YouTube Video Transcription',
    description: 'Complete pipeline for transcribing YouTube videos with AI enhancement',
    version: '1.0.0',
    timeout: 1800000, // 30 minutes
    retryPolicy: {
      maxRetries: 2,
      backoffStrategy: 'exponential',
      baseDelay: 5000
    },
    steps: [
      {
        id: 'download-video',
        name: 'Download Video',
        service: 'video-processor',
        endpoint: '/api/download',
        method: 'POST',
        timeout: 300000, // 5 minutes
        retries: 3,
        dependencies: [],
        inputMapping: {
          url: 'videoUrl'
        },
        outputMapping: {
          videoPath: 'data.videoPath',
          audioPath: 'data.audioPath',
          metadata: 'data.metadata'
        }
      },
      {
        id: 'extract-audio',
        name: 'Extract Audio',
        service: 'video-processor',
        endpoint: '/api/extract-audio',
        method: 'POST',
        timeout: 180000, // 3 minutes
        retries: 2,
        dependencies: ['download-video'],
        inputMapping: {
          videoPath: 'download-video.videoPath'
        },
        outputMapping: {
          audioPath: 'data.audioPath',
          duration: 'data.duration'
        }
      },
      {
        id: 'transcribe-audio',
        name: 'Transcribe Audio',
        service: 'transcription-service',
        endpoint: '/api/transcribe',
        method: 'POST',
        timeout: 600000, // 10 minutes
        retries: 2,
        dependencies: ['extract-audio'],
        inputMapping: {
          audioPath: 'extract-audio.audioPath',
          language: 'language',
          model: 'transcriptionModel'
        },
        outputMapping: {
          transcription: 'data.transcription',
          segments: 'data.segments',
          confidence: 'data.confidence'
        }
      },
      {
        id: 'enhance-transcription',
        name: 'Enhance Transcription',
        service: 'llm-service',
        endpoint: '/api/enhance',
        method: 'POST',
        timeout: 300000, // 5 minutes
        retries: 2,
        dependencies: ['transcribe-audio'],
        inputMapping: {
          text: 'transcribe-audio.transcription',
          enhancementType: 'enhancementType'
        },
        outputMapping: {
          enhancedText: 'data.enhancedText',
          summary: 'data.summary',
          keyPoints: 'data.keyPoints'
        }
      }
    ]
  };

  const input = {
    videoUrl,
    language: options.language || 'auto',
    transcriptionModel: options.transcriptionModel || 'whisper-1',
    enhancementType: options.enhancementType || 'grammar_and_punctuation'
  };

  const metadata = {
    userId: req.body.userId,
    source: 'youtube-transcription-api',
    priority: options.priority || 'normal',
    tags: ['youtube', 'transcription', ...(options.tags || [])]
  };

  try {
    const executionId = await workflowEngine.executeWorkflow(
      workflowDefinition,
      input,
      metadata
    );

    logger.info('YouTube transcription workflow started', {
      requestId,
      executionId,
      videoUrl
    });

    return res.status(202).json({
      success: true,
      data: {
        executionId,
        workflowId: workflowDefinition.id,
        status: 'started',
        message: 'YouTube transcription workflow initiated successfully',
        estimatedDuration: '10-30 minutes'
      },
      timestamp: new Date().toISOString(),
      requestId
    });
  } catch (error) {
    logger.error('Failed to execute YouTube transcription workflow', {
      requestId,
      videoUrl,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to execute YouTube transcription workflow',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      requestId
    });
  }
}));

// Cleanup on process exit
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, cleaning up workflow engine...');
  await workflowEngine.cleanup();
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, cleaning up workflow engine...');
  await workflowEngine.cleanup();
});

export default router;
