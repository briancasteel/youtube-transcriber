import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { WorkflowEngine } from '../services/WorkflowEngine';
import { LanggraphWorkflowEngine } from '../services/LanggraphWorkflowEngine';
import { ReActWorkflowEngine } from '../services/ReActWorkflowEngine';
import { WorkflowDefinition } from '../types/workflow';
import logger from '../utils/logger';

const router = Router();
const workflowEngine = new WorkflowEngine();
const langgraphEngine = new LanggraphWorkflowEngine();
const reactEngine = new ReActWorkflowEngine();

// Initialize both workflow engines
workflowEngine.initialize().catch(error => {
  logger.error('Failed to initialize custom workflow engine', {
    error: error instanceof Error ? error.message : 'Unknown error'
  });
});

langgraphEngine.initialize().catch(error => {
  logger.error('Failed to initialize Langgraph workflow engine', {
    error: error instanceof Error ? error.message : 'Unknown error'
  });
});

reactEngine.initialize().catch(error => {
  logger.error('Failed to initialize ReAct workflow engine', {
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
    // Try all engines to find the execution
    let execution = await workflowEngine.getExecution(executionId);
    
    if (!execution) {
      execution = await langgraphEngine.getExecution(executionId);
    }

    if (!execution) {
      execution = await reactEngine.getExecution(executionId);
    }

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

// Langgraph-powered YouTube transcription workflow
router.post('/youtube-transcription-langgraph', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  
  logger.info('Langgraph YouTube transcription workflow request', { 
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

  const metadata = {
    userId: req.body.userId,
    source: 'langgraph-youtube-transcription-api',
    priority: options.priority || 'normal',
    tags: ['youtube', 'transcription', 'langgraph', ...(options.tags || [])]
  };

  try {
    const executionId = await langgraphEngine.executeWorkflow(
      youtubeUrl,
      {
        language: options.language || 'en',
        enhanceText: options.enhanceText || false,
        generateSummary: options.generateSummary || false,
        extractKeywords: options.extractKeywords || false,
        quality: options.quality || 'highestaudio',
        format: options.format || 'mp3'
      },
      metadata
    );

    logger.info('Langgraph YouTube transcription workflow started', {
      requestId,
      executionId,
      youtubeUrl
    });

    return res.status(202).json({
      success: true,
      data: {
        executionId,
        workflowId: 'youtube-transcription-langgraph',
        status: 'started',
        message: 'Langgraph YouTube transcription workflow initiated successfully',
        estimatedDuration: '5-15 minutes',
        statusUrl: `/api/workflow/execution/${executionId}`
      },
      timestamp: new Date().toISOString(),
      requestId
    });
  } catch (error) {
    logger.error('Failed to execute Langgraph YouTube transcription workflow', {
      requestId,
      youtubeUrl,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to execute Langgraph YouTube transcription workflow',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      requestId
    });
  }
}));

// Predefined workflow: YouTube transcription (legacy)
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
        id: 'process-video',
        name: 'Process Video',
        service: 'video-processor',
        endpoint: '/api/video/process',
        method: 'POST',
        timeout: 300000, // 5 minutes
        retries: 3,
        dependencies: [],
        inputMapping: {
          url: 'videoUrl',
          quality: 'quality',
          format: 'format'
        },
        outputMapping: {
          jobId: 'data.jobId',
          status: 'data.status',
          statusUrl: 'data.statusUrl'
        }
      },
      {
        id: 'transcribe-from-job',
        name: 'Transcribe from Job',
        service: 'transcription-service',
        endpoint: '/api/transcription/from-job',
        method: 'POST',
        timeout: 600000, // 10 minutes
        retries: 2,
        dependencies: ['process-video'],
        inputMapping: {
          jobId: 'process-video.jobId',
          whisperOptions: 'whisperOptions',
          enhancementOptions: 'enhancementOptions'
        },
        outputMapping: {
          transcriptionId: 'data.transcriptionId',
          status: 'data.status'
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
    const state = await reactEngine.getState(executionId);

    if (!state) {
      return res.status(404).json({
        success: false,
        error: 'ReAct workflow execution not found',
        timestamp: new Date().toISOString(),
        requestId
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        executionId: state.executionId,
        goal: state.goal,
        status: state.status,
        currentThought: state.currentThought,
        reasoningTrace: state.reasoningTrace,
        actionHistory: state.actionHistory,
        observations: state.observations,
        progress: {
          reasoningSteps: state.reasoningTrace.length,
          actionsExecuted: state.actionHistory.length,
          successfulActions: state.actionHistory.filter(a => a.status === 'completed').length,
          failedActions: state.actionHistory.filter(a => a.status === 'failed').length
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
  logger.info('Received SIGTERM, cleaning up workflow engines...');
  await Promise.all([
    workflowEngine.cleanup(),
    langgraphEngine.cleanup(),
    reactEngine.cleanup()
  ]);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, cleaning up workflow engines...');
  await Promise.all([
    workflowEngine.cleanup(),
    langgraphEngine.cleanup(),
    reactEngine.cleanup()
  ]);
});

export default router;
