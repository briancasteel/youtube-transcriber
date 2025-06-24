import request from 'supertest';
import express from 'express';
import workflowRouter from './workflow';

// Mock the WorkflowEngine
const mockWorkflowEngine = {
  initialize: jest.fn(),
  executeWorkflow: jest.fn(),
  getExecution: jest.fn(),
  cancelExecution: jest.fn(),
  cleanup: jest.fn(),
};

jest.mock('../services/WorkflowEngine', () => ({
  WorkflowEngine: jest.fn(() => mockWorkflowEngine),
}));

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

describe('Workflow Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe('POST /api/workflow/execute', () => {
    const validWorkflowRequest = {
      workflowDefinition: {
        id: 'test-workflow',
        name: 'Test Workflow',
        description: 'A test workflow',
        version: '1.0.0',
        steps: [
          {
            id: 'step1',
            name: 'Test Step',
            service: 'test-service',
            endpoint: '/test',
            method: 'POST',
            dependencies: [],
          },
        ],
      },
      input: {
        testData: 'value',
      },
      metadata: {
        userId: 'user123',
        source: 'api',
      },
    };

    it('should execute workflow successfully', async () => {
      const executionId = 'exec-123-456';
      mockWorkflowEngine.executeWorkflow.mockResolvedValueOnce(executionId);

      const response = await request(app)
        .post('/api/workflow/execute')
        .send(validWorkflowRequest)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.executionId).toBe(executionId);
      expect(response.body.data.status).toBe('started');
      expect(mockWorkflowEngine.executeWorkflow).toHaveBeenCalledWith(
        validWorkflowRequest.workflowDefinition,
        validWorkflowRequest.input,
        expect.objectContaining({
          userId: 'user123',
          source: 'api',
          priority: 'normal',
          tags: [],
        })
      );
    });

    it('should handle missing workflowDefinition', async () => {
      const invalidRequest = {
        input: { test: 'data' },
      };

      const response = await request(app)
        .post('/api/workflow/execute')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
    });

    it('should handle missing input', async () => {
      const invalidRequest = {
        workflowDefinition: validWorkflowRequest.workflowDefinition,
      };

      const response = await request(app)
        .post('/api/workflow/execute')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
    });

    it('should handle invalid workflow definition structure', async () => {
      const invalidRequest = {
        workflowDefinition: {
          name: 'Test Workflow', // missing id and steps
        },
        input: { test: 'data' },
      };

      const response = await request(app)
        .post('/api/workflow/execute')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid workflow definition');
    });

    it('should handle workflow execution errors', async () => {
      mockWorkflowEngine.executeWorkflow.mockRejectedValueOnce(
        new Error('Workflow execution failed')
      );

      const response = await request(app)
        .post('/api/workflow/execute')
        .send(validWorkflowRequest)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to execute workflow');
      expect(response.body.details).toBe('Workflow execution failed');
    });

    it('should use default metadata values', async () => {
      const executionId = 'exec-123-456';
      mockWorkflowEngine.executeWorkflow.mockResolvedValueOnce(executionId);

      const requestWithoutMetadata = {
        workflowDefinition: validWorkflowRequest.workflowDefinition,
        input: validWorkflowRequest.input,
      };

      await request(app)
        .post('/api/workflow/execute')
        .send(requestWithoutMetadata)
        .expect(202);

      expect(mockWorkflowEngine.executeWorkflow).toHaveBeenCalledWith(
        validWorkflowRequest.workflowDefinition,
        validWorkflowRequest.input,
        expect.objectContaining({
          userId: undefined,
          source: 'api',
          priority: 'normal',
          tags: [],
        })
      );
    });
  });

  describe('GET /api/workflow/execution/:executionId', () => {
    const executionId = 'exec-123-456';

    it('should get execution status successfully', async () => {
      const mockExecution = {
        id: executionId,
        workflowId: 'test-workflow',
        status: 'running',
        progress: 50,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:05:00Z',
      };

      mockWorkflowEngine.getExecution.mockResolvedValueOnce(mockExecution);

      const response = await request(app)
        .get(`/api/workflow/execution/${executionId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockExecution);
      expect(mockWorkflowEngine.getExecution).toHaveBeenCalledWith(executionId);
    });

    it('should handle missing execution ID', async () => {
      const response = await request(app)
        .get('/api/workflow/execution/')
        .expect(404);

      // Express will return 404 for missing route parameter
    });

    it('should handle execution not found', async () => {
      mockWorkflowEngine.getExecution.mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/api/workflow/execution/${executionId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Workflow execution not found');
    });

    it('should handle get execution errors', async () => {
      mockWorkflowEngine.getExecution.mockRejectedValueOnce(
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
      mockWorkflowEngine.cancelExecution.mockResolvedValueOnce(true);

      const response = await request(app)
        .post(`/api/workflow/execution/${executionId}/cancel`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.executionId).toBe(executionId);
      expect(response.body.data.status).toBe('cancelled');
      expect(mockWorkflowEngine.cancelExecution).toHaveBeenCalledWith(executionId);
    });

    it('should handle execution not found or not cancellable', async () => {
      mockWorkflowEngine.cancelExecution.mockResolvedValueOnce(false);

      const response = await request(app)
        .post(`/api/workflow/execution/${executionId}/cancel`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Cannot cancel workflow execution');
    });

    it('should handle cancel execution errors', async () => {
      mockWorkflowEngine.cancelExecution.mockRejectedValueOnce(
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

  describe('POST /api/workflow/youtube-transcription', () => {
    const validYouTubeRequest = {
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      options: {
        language: 'en',
        transcriptionModel: 'whisper-1',
        enhancementType: 'grammar_and_punctuation',
      },
    };

    it('should start YouTube transcription workflow successfully', async () => {
      const executionId = 'exec-youtube-123';
      mockWorkflowEngine.executeWorkflow.mockResolvedValueOnce(executionId);

      const response = await request(app)
        .post('/api/workflow/youtube-transcription')
        .send(validYouTubeRequest)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.executionId).toBe(executionId);
      expect(response.body.data.workflowId).toBe('youtube-transcription-v1');
      expect(response.body.data.status).toBe('started');
      expect(response.body.data.estimatedDuration).toBe('10-30 minutes');

      expect(mockWorkflowEngine.executeWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'youtube-transcription-v1',
          name: 'YouTube Video Transcription',
          steps: expect.arrayContaining([
            expect.objectContaining({ id: 'download-video' }),
            expect.objectContaining({ id: 'extract-audio' }),
            expect.objectContaining({ id: 'transcribe-audio' }),
            expect.objectContaining({ id: 'enhance-transcription' }),
          ]),
        }),
        expect.objectContaining({
          videoUrl: validYouTubeRequest.videoUrl,
          language: 'en',
          transcriptionModel: 'whisper-1',
          enhancementType: 'grammar_and_punctuation',
        }),
        expect.objectContaining({
          source: 'youtube-transcription-api',
          priority: 'normal',
          tags: expect.arrayContaining(['youtube', 'transcription']),
        })
      );
    });

    it('should handle missing videoUrl', async () => {
      const invalidRequest = {
        options: {},
      };

      const response = await request(app)
        .post('/api/workflow/youtube-transcription')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing required field: videoUrl');
    });

    it('should use default options', async () => {
      const executionId = 'exec-youtube-123';
      mockWorkflowEngine.executeWorkflow.mockResolvedValueOnce(executionId);

      const minimalRequest = {
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      };

      await request(app)
        .post('/api/workflow/youtube-transcription')
        .send(minimalRequest)
        .expect(202);

      expect(mockWorkflowEngine.executeWorkflow).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          videoUrl: minimalRequest.videoUrl,
          language: 'auto',
          transcriptionModel: 'whisper-1',
          enhancementType: 'grammar_and_punctuation',
        }),
        expect.any(Object)
      );
    });

    it('should handle workflow execution errors', async () => {
      mockWorkflowEngine.executeWorkflow.mockRejectedValueOnce(
        new Error('YouTube workflow failed')
      );

      const response = await request(app)
        .post('/api/workflow/youtube-transcription')
        .send(validYouTubeRequest)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to execute YouTube transcription workflow');
      expect(response.body.details).toBe('YouTube workflow failed');
    });

    it('should include custom tags and userId', async () => {
      const executionId = 'exec-youtube-123';
      mockWorkflowEngine.executeWorkflow.mockResolvedValueOnce(executionId);

      const requestWithExtras = {
        ...validYouTubeRequest,
        userId: 'user456',
        options: {
          ...validYouTubeRequest.options,
          priority: 'high',
          tags: ['custom', 'tag'],
        },
      };

      await request(app)
        .post('/api/workflow/youtube-transcription')
        .send(requestWithExtras)
        .expect(202);

      expect(mockWorkflowEngine.executeWorkflow).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          userId: 'user456',
          priority: 'high',
          tags: expect.arrayContaining(['youtube', 'transcription', 'custom', 'tag']),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post('/api/workflow/execute')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/workflow/execute')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
    });

    it('should include request ID in all responses', async () => {
      const response = await request(app)
        .post('/api/workflow/execute')
        .send({})
        .expect(400);

      expect(response.body.requestId).toBe('test-request-123');
    });

    it('should include timestamp in all responses', async () => {
      const response = await request(app)
        .post('/api/workflow/execute')
        .send({})
        .expect(400);

      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('Workflow Definition Validation', () => {
    it('should validate workflow definition has required fields', async () => {
      const testCases = [
        {
          description: 'missing id',
          workflowDefinition: {
            name: 'Test',
            steps: [],
          },
        },
        {
          description: 'missing steps',
          workflowDefinition: {
            id: 'test',
            name: 'Test',
          },
        },
        {
          description: 'steps not array',
          workflowDefinition: {
            id: 'test',
            name: 'Test',
            steps: 'not-array',
          },
        },
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/workflow/execute')
          .send({
            workflowDefinition: testCase.workflowDefinition,
            input: { test: 'data' },
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Invalid workflow definition');
      }
    });
  });
});
