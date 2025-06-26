import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { ReActWorkflowEngine } from '../services/ReActWorkflowEngine';
import logger from '../utils/logger';

const router = Router();
const reactEngine = new ReActWorkflowEngine();

// Initialize ReAct workflow engine
reactEngine.initialize().catch(error => {
  logger.error('Failed to initialize ReAct workflow engine', {
    error: error instanceof Error ? error.message : 'Unknown error'
  });
});

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
    const execution = await reactEngine.getWorkflowStatus(executionId);

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
    const cancelled = await reactEngine.cancelWorkflow(executionId);

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

// ReAct-powered YouTube transcription workflow
router.post('/youtube-transcription-react', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  
  logger.info('ReAct YouTube transcription workflow request', { 
    requestId,
    body: req.body 
  });

  const { youtubeUrl, options = {} } = req.body;

  if (!youtubeUrl) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: youtubeUrl',
      timestamp: new Date().toISOString(),
      requestId
    });
  }

  const goal = `Transcribe YouTube video from ${youtubeUrl}${options.enhanceText ? ' and enhance the text' : ''}`;
  const context = {
    youtubeUrl,
    language: options.language || 'en',
    enhanceText: options.enhanceText || false,
    generateSummary: options.generateSummary || false,
    extractKeywords: options.extractKeywords || false,
    quality: options.quality || 'highestaudio',
    format: options.format || 'mp3'
  };

  const metadata = {
    userId: req.body.userId,
    source: 'react-youtube-transcription-api',
    priority: options.priority || 'normal',
    tags: ['youtube', 'transcription', 'react', 'reasoning', ...(options.tags || [])]
  };

  try {
    const executionId = await reactEngine.executeWorkflow(goal, context, metadata);

    logger.info('ReAct YouTube transcription workflow started', {
      requestId,
      executionId,
      youtubeUrl,
      goal
    });

    return res.status(202).json({
      success: true,
      data: {
        executionId,
        workflowId: 'youtube-transcription-react',
        status: 'started',
        message: 'ReAct YouTube transcription workflow initiated successfully',
        goal,
        estimatedDuration: '5-20 minutes',
        statusUrl: `/api/workflow/execution/${executionId}`,
        reasoningUrl: `/api/workflow/react/${executionId}/reasoning`
      },
      timestamp: new Date().toISOString(),
      requestId
    });
  } catch (error) {
    logger.error('Failed to execute ReAct YouTube transcription workflow', {
      requestId,
      youtubeUrl,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to execute ReAct YouTube transcription workflow',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      requestId
    });
  }
}));

// Main YouTube transcription endpoint (uses ReAct)
router.post('/youtube-transcription', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  
  logger.info('YouTube transcription workflow request (ReAct)', { 
    requestId,
    body: req.body 
  });

  const { videoUrl, youtubeUrl, options = {} } = req.body;
  const url = youtubeUrl || videoUrl; // Support both field names for backward compatibility

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: youtubeUrl or videoUrl',
      timestamp: new Date().toISOString(),
      requestId
    });
  }

  const goal = `Transcribe YouTube video from ${url}${options.enhanceText ? ' and enhance the text' : ''}`;
  const context = {
    youtubeUrl: url,
    language: options.language || 'en',
    enhanceText: options.enhanceText || false,
    generateSummary: options.generateSummary || false,
    extractKeywords: options.extractKeywords || false,
    quality: options.quality || 'highestaudio',
    format: options.format || 'mp3'
  };

  const metadata = {
    userId: req.body.userId,
    source: 'youtube-transcription-api',
    priority: options.priority || 'normal',
    tags: ['youtube', 'transcription', 'react', ...(options.tags || [])]
  };

  try {
    const executionId = await reactEngine.executeWorkflow(goal, context, metadata);

    logger.info('YouTube transcription workflow started (ReAct)', {
      requestId,
      executionId,
      youtubeUrl: url,
      goal
    });

    return res.status(202).json({
      success: true,
      data: {
        executionId,
        workflowId: 'youtube-transcription-react',
        status: 'started',
        message: 'YouTube transcription workflow initiated successfully',
        goal,
        estimatedDuration: '5-20 minutes',
        statusUrl: `/api/workflow/execution/${executionId}`,
        reasoningUrl: `/api/workflow/react/${executionId}/reasoning`
      },
      timestamp: new Date().toISOString(),
      requestId
    });
  } catch (error) {
    logger.error('Failed to execute YouTube transcription workflow', {
      requestId,
      youtubeUrl: url,
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

// Generic ReAct workflow execution
router.post('/react', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  
  logger.info('Generic ReAct workflow request', { 
    requestId,
    body: req.body 
  });

  const { goal, context = {}, metadata = {} } = req.body;

  if (!goal) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: goal',
      timestamp: new Date().toISOString(),
      requestId
    });
  }

  const workflowMetadata = {
    userId: metadata.userId,
    source: metadata.source || 'react-api',
    priority: metadata.priority || 'normal',
    tags: ['react', 'reasoning', ...(metadata.tags || [])]
  };

  try {
    const executionId = await reactEngine.executeWorkflow(goal, context, workflowMetadata);

    logger.info('Generic ReAct workflow started', {
      requestId,
      executionId,
      goal
    });

    return res.status(202).json({
      success: true,
      data: {
        executionId,
        workflowId: 'react-workflow',
        status: 'started',
        message: 'ReAct workflow initiated successfully',
        goal,
        statusUrl: `/api/workflow/execution/${executionId}`,
        reasoningUrl: `/api/workflow/react/${executionId}/reasoning`
      },
      timestamp: new Date().toISOString(),
      requestId
    });
  } catch (error) {
    logger.error('Failed to execute ReAct workflow', {
      requestId,
      goal,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to execute ReAct workflow',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      requestId
    });
  }
}));

// Get ReAct workflow reasoning trace
router.get('/react/:executionId/reasoning', asyncHandler(async (req: Request, res: Response) => {
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

  logger.debug('ReAct reasoning trace request', {
    requestId,
    executionId
  });

  try {
    const execution = await reactEngine.getWorkflowStatus(executionId);

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'ReAct workflow execution not found',
        timestamp: new Date().toISOString(),
        requestId
      });
    }

    // For now, return basic execution info since we don't have direct access to reasoning trace
    return res.status(200).json({
      success: true,
      data: {
        executionId: execution.id,
        workflowId: execution.workflowId,
        status: execution.status,
        currentStep: execution.currentStep,
        completedSteps: execution.completedSteps,
        failedSteps: execution.failedSteps,
        stepResults: execution.stepResults,
        progress: {
          reasoningSteps: 0, // Not directly available
          actionsExecuted: execution.completedSteps.length + execution.failedSteps.length,
          successfulActions: execution.completedSteps.length,
          failedActions: execution.failedSteps.length
        }
      },
      timestamp: new Date().toISOString(),
      requestId
    });
  } catch (error) {
    logger.error('Failed to get ReAct reasoning trace', {
      requestId,
      executionId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get ReAct reasoning trace',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      requestId
    });
  }
}));

// Cleanup on process exit
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, cleaning up ReAct workflow engine...');
  await reactEngine.cleanup();
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, cleaning up ReAct workflow engine...');
  await reactEngine.cleanup();
});

export default router;
