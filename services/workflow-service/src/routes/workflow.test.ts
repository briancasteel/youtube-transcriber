import request from 'supertest';
import express from 'express';

// Mock the ReActWorkflowEngine
const mockReActEngine = {
  initialize: jest.fn().mockResolvedValue(undefined),
  executeWorkflow: jest.fn(),
  getExecution: jest.fn(),
  getState: jest.fn(),
  cancelExecution: jest.fn(),
  cleanup: jest.fn(),
};

jest.mock('../services/ReActWorkflowEngine', () => ({
  ReActWorkflowEngine: jest.fn().mockImplementation(() => mockReActEngine),
}));

import workflowRouter from './workflow';

// Mock logger
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock request logger middleware
  app.use((req: any, res: any, next: any) => {
    res.locals.requestId = 'test-request-123';
    next();
  });
  
  app.use('/api/workflow', workflowRouter);
  return app;
};

describe('ReAct Workflow Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe('GET /api/workflow/execution/:executionId', () => {
    const executionId = 'exec-123-456';

    it('should get execution status successfully', async () => {
      const mockExecution = {
        id: executionId,
        workflowId: 'react-workflow',
        status: 'running',
        goal: 'Test goal',
        progress: 50,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:05:00Z',
      };

      mockReActEngine.getExecution.mockResolvedValueOnce(mockExecution);

      const response = await request(app)
        .get(`/api/workflow/execution/${executionId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockExecution);
      expect(mockReActEngine.getExecution).toHaveBeenCalledWith(executionId);
    });

    it('should handle missing execution ID', async () => {
      const response = await request(app)
        .get('/api/workflow/execution/')
        .expect(404);

      // Express will return 404 for missing route parameter
    });

    it('should handle execution not found', async () => {
      mockReActEngine.getExecution.mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/api/workflow/execution/${executionId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Workflow execution not found');
    });

    it('should handle get execution errors', async () => {
      mockReActEngine.getExecution.mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .get(`/api/workflow/execution/${executionId}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to get workflow execution');
      expect(response.body.details).toBe('Database connection failed');
    });
  });

  describe('POST /api/workflow/execution/:executionId/cancel', () => {
    const executionId = 'exec-123-456';

    it('should cancel execution successfully', async () => {
      mockReActEngine.cancelExecution.mockResolvedValueOnce(true);

      const response = await request(app)
        .post(`/api/workflow/execution/${executionId}/cancel`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.executionId).toBe(executionId);
      expect(response.body.data.status).toBe('cancelled');
      expect(mockReActEngine.cancelExecution).toHaveBeenCalledWith(executionId);
    });

    it('should handle execution not found or not cancellable', async () => {
      mockReActEngine.cancelExecution.mockResolvedValueOnce(false);

      const response = await request(app)
        .post(`/api/workflow/execution/${executionId}/cancel`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Cannot cancel workflow execution');
    });

    it('should handle cancel execution errors', async () => {
      mockReActEngine.cancelExecution.mockRejectedValueOnce(
        new Error('Cancel operation failed')
      );

      const response = await request(app)
        .post(`/api/workflow/execution/${executionId}/cancel`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to cancel workflow execution');
      expect(response.body.details).toBe('Cancel operation failed');
    });
  });

  describe('POST /api/workflow/youtube-transcription-react', () => {
    const validYouTubeRequest = {
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      options: {
        language: 'en',
        enhanceText: true,
        generateSummary: false,
        extractKeywords: false,
      },
    };

    it('should start ReAct YouTube transcription workflow successfully', async () => {
      const executionId = 'exec-react-youtube-123';
      mockReActEngine.executeWorkflow.mockResolvedValueOnce(executionId);

      const response = await request(app)
        .post('/api/workflow/youtube-transcription-react')
        .send(validYouTubeRequest)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.executionId).toBe(executionId);
      expect(response.body.data.workflowId).toBe('youtube-transcription-react');
      expect(response.body.data.status).toBe('started');
      expect(response.body.data.goal).toContain('Transcribe YouTube video');
      expect(response.body.data.reasoningUrl).toContain('/reasoning');

      expect(mockReActEngine.executeWorkflow).toHaveBeenCalledWith(
        expect.stringContaining('Transcribe YouTube video'),
        expect.objectContaining({
          youtubeUrl: validYouTubeRequest.youtubeUrl,
          language: 'en',
          enhanceText: true,
        }),
        expect.objectContaining({
          source: 'react-youtube-transcription-api',
          priority: 'normal',
          tags: expect.arrayContaining(['youtube', 'transcription', 'react', 'reasoning']),
        })
      );
    });

    it('should handle missing youtubeUrl', async () => {
      const invalidRequest = {
        options: {},
      };

      const response = await request(app)
        .post('/api/workflow/youtube-transcription-react')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing required field: youtubeUrl');
    });

    it('should use default options', async () => {
      const executionId = 'exec-react-youtube-123';
      mockReActEngine.executeWorkflow.mockResolvedValueOnce(executionId);

      const minimalRequest = {
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      };

      await request(app)
        .post('/api/workflow/youtube-transcription-react')
        .send(minimalRequest)
        .expect(202);

      expect(mockReActEngine.executeWorkflow).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          youtubeUrl: minimalRequest.youtubeUrl,
          language: 'en',
          enhanceText: false,
          generateSummary: false,
          extractKeywords: false,
        }),
        expect.any(Object)
      );
    });

    it('should handle workflow execution errors', async () => {
      mockReActEngine.executeWorkflow.mockRejectedValueOnce(
        new Error('ReAct YouTube workflow failed')
      );

      const response = await request(app)
        .post('/api/workflow/youtube-transcription-react')
        .send(validYouTubeRequest)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to execute ReAct YouTube transcription workflow');
      expect(response.body.details).toBe('ReAct YouTube workflow failed');
    });
  });

  describe('POST /api/workflow/youtube-transcription', () => {
    const validYouTubeRequest = {
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      options: {
        language: 'en',
        enhanceText: true,
      },
    };

    it('should start YouTube transcription workflow with ReAct engine', async () => {
      const executionId = 'exec-youtube-123';
      mockReActEngine.executeWorkflow.mockResolvedValueOnce(executionId);

      const response = await request(app)
        .post('/api/workflow/youtube-transcription')
        .send(validYouTubeRequest)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.executionId).toBe(executionId);
      expect(response.body.data.workflowId).toBe('youtube-transcription-react');
      expect(response.body.data.status).toBe('started');
      expect(response.body.data.goal).toContain('Transcribe YouTube video');

      expect(mockReActEngine.executeWorkflow).toHaveBeenCalledWith(
        expect.stringContaining('Transcribe YouTube video'),
        expect.objectContaining({
          youtubeUrl: validYouTubeRequest.videoUrl,
          language: 'en',
          enhanceText: true,
        }),
        expect.objectContaining({
          source: 'youtube-transcription-api',
          tags: expect.arrayContaining(['youtube', 'transcription', 'react']),
        })
      );
    });

    it('should support youtubeUrl field name', async () => {
      const executionId = 'exec-youtube-123';
      mockReActEngine.executeWorkflow.mockResolvedValueOnce(executionId);

      const requestWithYoutubeUrl = {
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        options: { language: 'en' },
      };

      await request(app)
        .post('/api/workflow/youtube-transcription')
        .send(requestWithYoutubeUrl)
        .expect(202);

      expect(mockReActEngine.executeWorkflow).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          youtubeUrl: requestWithYoutubeUrl.youtubeUrl,
        }),
        expect.any(Object)
      );
    });

    it('should handle missing URL', async () => {
      const invalidRequest = {
        options: {},
      };

      const response = await request(app)
        .post('/api/workflow/youtube-transcription')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing required field: youtubeUrl or videoUrl');
    });
  });

  describe('POST /api/workflow/react', () => {
    const validReActRequest = {
      goal: 'Process some data and generate a report',
      context: {
        dataSource: 'test-data.csv',
        outputFormat: 'pdf',
      },
      metadata: {
        userId: 'user123',
        priority: 'high',
      },
    };

    it('should start generic ReAct workflow successfully', async () => {
      const executionId = 'exec-react-123';
      mockReActEngine.executeWorkflow.mockResolvedValueOnce(executionId);

      const response = await request(app)
        .post('/api/workflow/react')
        .send(validReActRequest)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.executionId).toBe(executionId);
      expect(response.body.data.workflowId).toBe('react-workflow');
      expect(response.body.data.status).toBe('started');
      expect(response.body.data.goal).toBe(validReActRequest.goal);
      expect(response.body.data.reasoningUrl).toContain('/reasoning');

      expect(mockReActEngine.executeWorkflow).toHaveBeenCalledWith(
        validReActRequest.goal,
        validReActRequest.context,
        expect.objectContaining({
          userId: 'user123',
          source: 'react-api',
          priority: 'high',
          tags: expect.arrayContaining(['react', 'reasoning']),
        })
      );
    });

    it('should handle missing goal', async () => {
      const invalidRequest = {
        context: { test: 'data' },
      };

      const response = await request(app)
        .post('/api/workflow/react')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing required field: goal');
    });

    it('should use default values for optional fields', async () => {
      const executionId = 'exec-react-123';
      mockReActEngine.executeWorkflow.mockResolvedValueOnce(executionId);

      const minimalRequest = {
        goal: 'Simple test goal',
      };

      await request(app)
        .post('/api/workflow/react')
        .send(minimalRequest)
        .expect(202);

      expect(mockReActEngine.executeWorkflow).toHaveBeenCalledWith(
        minimalRequest.goal,
        {},
        expect.objectContaining({
          userId: undefined,
          source: 'react-api',
          priority: 'normal',
          tags: expect.arrayContaining(['react', 'reasoning']),
        })
      );
    });

    it('should handle workflow execution errors', async () => {
      mockReActEngine.executeWorkflow.mockRejectedValueOnce(
        new Error('ReAct workflow failed')
      );

      const response = await request(app)
        .post('/api/workflow/react')
        .send(validReActRequest)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to execute ReAct workflow');
      expect(response.body.details).toBe('ReAct workflow failed');
    });
  });

  describe('GET /api/workflow/react/:executionId/reasoning', () => {
    const executionId = 'exec-react-123';

    it('should get reasoning trace successfully', async () => {
      const mockState = {
        executionId,
        goal: 'Test goal',
        status: 'running',
        currentThought: 'Analyzing the situation...',
        reasoningTrace: [
          {
            step: 1,
            thought: 'I need to understand the goal',
            reasoning: 'The user wants me to process data',
            decision: 'Start by analyzing the input',
            confidence: 0.9,
          },
        ],
        actionHistory: [
          {
            id: 'action-1',
            type: 'analyze_data',
            status: 'completed',
            result: { analysis: 'complete' },
          },
        ],
        observations: [
          {
            id: 'obs-1',
            content: 'Data analysis completed successfully',
            timestamp: '2023-01-01T00:00:00Z',
          },
        ],
      };

      mockReActEngine.getState.mockResolvedValueOnce(mockState);

      const response = await request(app)
        .get(`/api/workflow/react/${executionId}/reasoning`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.executionId).toBe(executionId);
      expect(response.body.data.goal).toBe(mockState.goal);
      expect(response.body.data.reasoningTrace).toEqual(mockState.reasoningTrace);
      expect(response.body.data.progress).toEqual({
        reasoningSteps: 1,
        actionsExecuted: 1,
        successfulActions: 1,
        failedActions: 0,
      });

      expect(mockReActEngine.getState).toHaveBeenCalledWith(executionId);
    });

    it('should handle missing execution ID', async () => {
      const response = await request(app)
        .get('/api/workflow/react//reasoning')
        .expect(404);

      // Express will return 404 for missing route parameter
    });

    it('should handle execution not found', async () => {
      mockReActEngine.getState.mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/api/workflow/react/${executionId}/reasoning`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('ReAct workflow execution not found');
    });

    it('should handle get state errors', async () => {
      mockReActEngine.getState.mockRejectedValueOnce(
        new Error('State retrieval failed')
      );

      const response = await request(app)
        .get(`/api/workflow/react/${executionId}/reasoning`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to get ReAct reasoning trace');
      expect(response.body.details).toBe('State retrieval failed');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post('/api/workflow/react')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      // Express handles malformed JSON and may not return a structured response
      // Just verify we get a 400 status code
      expect(response.status).toBe(400);
    });

    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/workflow/react')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required field: goal');
    });

    it('should include request ID in all responses', async () => {
      const response = await request(app)
        .post('/api/workflow/react')
        .send({})
        .expect(400);

      expect(response.body.requestId).toBe('test-request-123');
    });

    it('should include timestamp in all responses', async () => {
      const response = await request(app)
        .post('/api/workflow/react')
        .send({})
        .expect(400);

      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });
});
