import request from 'supertest';
import express from 'express';
import axios from 'axios';
import { transcriptionRoutes } from './transcription';

// Mock dependencies
jest.mock('../utils/logger');
jest.mock('../middleware/rateLimiter', () => ({
  transcriptionRateLimiter: (req: any, res: any, next: any) => next(),
  videoInfoRateLimiter: (req: any, res: any, next: any) => next(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock request logger middleware
  app.use((req: any, res: any, next: any) => {
    res.locals.requestId = 'test-request-123';
    next();
  });
  
  app.use('/api/transcription', transcriptionRoutes);
  return app;
};

describe('Transcription Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe('POST /api/transcription/transcribe', () => {
    const validTranscriptionRequest = {
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      options: {
        language: 'en',
        model: 'whisper-1',
      },
    };

    it('should start transcription job successfully', async () => {
      const mockResponse = {
        data: {
          jobId: 'job-123-456',
          status: 'queued',
          estimatedTime: '5-10 minutes',
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const response = await request(app)
        .post('/api/transcription/transcribe')
        .send(validTranscriptionRequest)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockResponse.data);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://test-workflow:8001/transcribe',
        validTranscriptionRequest,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Request-ID': 'test-request-123',
          }),
          timeout: 30000,
        })
      );
    });

    it('should handle validation errors', async () => {
      const invalidRequest = {
        youtubeUrl: 'invalid-url',
      };

      const response = await request(app)
        .post('/api/transcription/transcribe')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid request data');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should handle missing youtubeUrl', async () => {
      const invalidRequest = {
        options: {},
      };

      const response = await request(app)
        .post('/api/transcription/transcribe')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid request data');
    });

    it('should handle workflow service errors', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          status: 500,
          data: {
            error: 'Internal server error',
            code: 'WORKFLOW_ERROR',
          },
        },
      });

      const response = await request(app)
        .post('/api/transcription/transcribe')
        .send(validTranscriptionRequest)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
      expect(response.body.code).toBe('WORKFLOW_ERROR');
    });

    it('should handle workflow service timeout', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        code: 'ECONNABORTED',
        message: 'timeout of 30000ms exceeded',
      });

      const response = await request(app)
        .post('/api/transcription/transcribe')
        .send(validTranscriptionRequest)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to start transcription job');
      expect(response.body.code).toBe('INTERNAL_ERROR');
    });

    it('should handle network errors', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED 127.0.0.1:8001',
      });

      const response = await request(app)
        .post('/api/transcription/transcribe')
        .send(validTranscriptionRequest)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to start transcription job');
    });
  });

  describe('GET /api/transcription/transcribe/:jobId', () => {
    const validJobId = 'job-123-456';

    it('should get job status successfully', async () => {
      const mockResponse = {
        data: {
          jobId: validJobId,
          status: 'processing',
          progress: 50,
          createdAt: '2023-01-01T00:00:00Z',
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const response = await request(app)
        .get(`/api/transcription/transcribe/${validJobId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `http://test-workflow:8001/transcribe/${validJobId}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Request-ID': 'test-request-123',
          }),
          timeout: 10000,
        })
      );
    });

    it('should handle invalid job ID format', async () => {
      const invalidJobId = 'invalid_job_id';

      const response = await request(app)
        .get(`/api/transcription/transcribe/${invalidJobId}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid job ID format');
      expect(response.body.code).toBe('INVALID_JOB_ID');
    });

    it('should handle job not found', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 404,
          data: {
            error: 'Job not found',
          },
        },
      });

      const response = await request(app)
        .get(`/api/transcription/transcribe/${validJobId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Job not found');
      expect(response.body.code).toBe('JOB_NOT_FOUND');
    });

    it('should handle workflow service errors', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 500,
          data: {
            error: 'Database connection failed',
            code: 'DB_ERROR',
          },
        },
      });

      const response = await request(app)
        .get(`/api/transcription/transcribe/${validJobId}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Database connection failed');
      expect(response.body.code).toBe('DB_ERROR');
    });
  });

  describe('GET /api/transcription/transcribe/:jobId/result', () => {
    const validJobId = 'job-123-456';

    it('should get transcription result successfully', async () => {
      const mockResponse = {
        data: {
          jobId: validJobId,
          transcription: 'This is the transcribed text.',
          segments: [
            { start: 0, end: 5, text: 'This is' },
            { start: 5, end: 10, text: 'the transcribed text.' },
          ],
          confidence: 0.95,
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const response = await request(app)
        .get(`/api/transcription/transcribe/${validJobId}/result`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockResponse.data);
    });

    it('should handle invalid job ID format', async () => {
      const invalidJobId = 'invalid_job_id';

      const response = await request(app)
        .get(`/api/transcription/transcribe/${invalidJobId}/result`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid job ID format');
    });

    it('should handle result not found', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 404,
          data: {
            error: 'Result not found',
          },
        },
      });

      const response = await request(app)
        .get(`/api/transcription/transcribe/${validJobId}/result`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Job or result not found');
      expect(response.body.code).toBe('RESULT_NOT_FOUND');
    });

    it('should handle job still processing', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 202,
          data: {
            error: 'Job is still processing',
          },
        },
      });

      const response = await request(app)
        .get(`/api/transcription/transcribe/${validJobId}/result`)
        .expect(202);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Job is still processing');
      expect(response.body.code).toBe('JOB_PROCESSING');
    });
  });

  describe('POST /api/transcription/transcribe/:jobId/cancel', () => {
    const validJobId = 'job-123-456';

    it('should cancel job successfully', async () => {
      const mockResponse = {
        data: {
          jobId: validJobId,
          status: 'cancelled',
          message: 'Job cancelled successfully',
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const response = await request(app)
        .post(`/api/transcription/transcribe/${validJobId}/cancel`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockResponse.data);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `http://test-workflow:8001/transcribe/${validJobId}/cancel`,
        {},
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Request-ID': 'test-request-123',
          }),
          timeout: 10000,
        })
      );
    });

    it('should handle invalid job ID format', async () => {
      const invalidJobId = 'invalid_job_id';

      const response = await request(app)
        .post(`/api/transcription/transcribe/${invalidJobId}/cancel`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid job ID format');
    });

    it('should handle job not found for cancellation', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          status: 404,
          data: {
            error: 'Job not found',
          },
        },
      });

      const response = await request(app)
        .post(`/api/transcription/transcribe/${validJobId}/cancel`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Job not found');
      expect(response.body.code).toBe('JOB_NOT_FOUND');
    });

    it('should handle job not cancellable', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          status: 409,
          data: {
            error: 'Job cannot be cancelled',
          },
        },
      });

      const response = await request(app)
        .post(`/api/transcription/transcribe/${validJobId}/cancel`)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Job cannot be cancelled');
      expect(response.body.code).toBe('JOB_NOT_CANCELLABLE');
    });
  });

  describe('GET /api/transcription/video-info', () => {
    it('should get video info successfully', async () => {
      const mockResponse = {
        data: {
          videoId: 'dQw4w9WgXcQ',
          title: 'Rick Astley - Never Gonna Give You Up',
          duration: 212,
          author: 'Rick Astley',
          thumbnails: [
            { url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg' },
          ],
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const response = await request(app)
        .get('/api/transcription/video-info')
        .query({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockResponse.data);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://test-workflow:8001/video-info',
        expect.objectContaining({
          params: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
          headers: expect.objectContaining({
            'X-Request-ID': 'test-request-123',
          }),
          timeout: 15000,
        })
      );
    });

    it('should handle missing url parameter', async () => {
      const response = await request(app)
        .get('/api/transcription/video-info')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid request parameters');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should handle invalid YouTube URL', async () => {
      const response = await request(app)
        .get('/api/transcription/video-info')
        .query({ url: 'https://google.com' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid request parameters');
    });

    it('should handle workflow service errors', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'Video not found',
            code: 'VIDEO_NOT_FOUND',
          },
        },
      });

      const response = await request(app)
        .get('/api/transcription/video-info')
        .query({ url: 'https://www.youtube.com/watch?v=invalid123' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Video not found');
      expect(response.body.code).toBe('VIDEO_NOT_FOUND');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post('/api/transcription/transcribe')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/transcription/transcribe')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid request data');
    });

    it('should handle very long job IDs', async () => {
      const longJobId = 'a'.repeat(100);

      const response = await request(app)
        .get(`/api/transcription/transcribe/${longJobId}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid job ID format');
    });

    it('should handle special characters in job IDs', async () => {
      const specialJobId = 'job@123#456$';

      const response = await request(app)
        .get(`/api/transcription/transcribe/${specialJobId}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid job ID format');
    });
  });

  describe('Request Headers', () => {
    it('should include request ID in all requests to workflow service', async () => {
      const mockResponse = { data: { jobId: 'test-job' } };
      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      await request(app)
        .post('/api/transcription/transcribe')
        .send({
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        })
        .expect(201);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Request-ID': 'test-request-123',
          }),
        })
      );
    });

    it('should handle custom request IDs', async () => {
      const customRequestId = 'custom-request-456';
      const app = express();
      app.use(express.json());
      
      // Mock request logger middleware with custom ID
      app.use((req: any, res: any, next: any) => {
        res.locals.requestId = customRequestId;
        next();
      });
      
      app.use('/api/transcription', transcriptionRoutes);

      const mockResponse = { data: { jobId: 'test-job' } };
      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      await request(app)
        .post('/api/transcription/transcribe')
        .send({
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        })
        .expect(201);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Request-ID': customRequestId,
          }),
        })
      );
    });
  });
});
