import request from 'supertest';
import express from 'express';
import { workflowRoutes } from './workflow';

// Mock axios
jest.mock('axios');
const mockedAxios = require('axios');

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock request logger middleware
  app.use((req: any, res: any, next: any) => {
    res.locals.requestId = 'test-request-123';
    next();
  });
  
  app.use('/api/workflow', workflowRoutes);
  
  // Error handler middleware
  app.use((error: any, req: any, res: any, next: any) => {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';
    const code = error.code || 'INTERNAL_ERROR';
    
    res.status(statusCode).json({
      success: false,
      error: message,
      code: code,
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId || 'test-request-123',
    });
  });
  
  return app;
};

describe('Workflow Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe('POST /api/workflow/youtube-transcription', () => {
    it('should start YouTube transcription workflow successfully', async () => {
      const mockResponse = {
        data: {
          data: {
            executionId: 'exec-123-456',
            status: 'started',
            workflowId: 'youtube-transcription-v1'
          }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const response = await request(app)
        .post('/api/workflow/youtube-transcription')
        .send({
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          whisperOptions: {
            model: 'base',
            language: 'en'
          },
          enhancementOptions: {
            addPunctuation: true,
            fixGrammar: true
          }
        })
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.executionId).toBe('exec-123-456');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/workflow/youtube-transcription'),
        expect.objectContaining({
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          options: expect.objectContaining({
            language: 'en',
            transcriptionModel: 'base',
            enhancementType: 'grammar_and_punctuation'
          })
        }),
        expect.any(Object)
      );
    });

    it('should handle missing URL', async () => {
      const response = await request(app)
        .post('/api/workflow/youtube-transcription')
        .send({
          whisperOptions: { model: 'base' }
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required field: url');
    });

    it('should handle invalid YouTube URL', async () => {
      const response = await request(app)
        .post('/api/workflow/youtube-transcription')
        .send({
          url: 'https://example.com/not-youtube'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid YouTube URL format');
    });
  });

  describe('GET /api/workflow/execution/:executionId', () => {
    it('should get workflow execution status successfully', async () => {
      const mockResponse = {
        data: {
          data: {
            id: 'exec-123-456',
            status: 'running',
            progress: 50,
            workflowId: 'youtube-transcription-v1'
          }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const response = await request(app)
        .get('/api/workflow/execution/exec-123-456')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('exec-123-456');
      expect(response.body.data.status).toBe('running');
    });

    it('should handle invalid execution ID', async () => {
      const response = await request(app)
        .get('/api/workflow/execution/short')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid execution ID format');
    });
  });

  describe('POST /api/workflow/execution/:executionId/cancel', () => {
    it('should cancel workflow execution successfully', async () => {
      const mockResponse = {
        data: {
          data: {
            executionId: 'exec-123-456',
            status: 'cancelled'
          }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const response = await request(app)
        .post('/api/workflow/execution/exec-123-456/cancel')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.executionId).toBe('exec-123-456');
    });
  });
});
