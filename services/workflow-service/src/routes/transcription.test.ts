import request from 'supertest';
import express from 'express';
import transcriptionRouter, { setTranscriptionAgent, resetTranscriptionAgent } from './transcription';

// Mock the entire module with a simpler approach
jest.mock('../agents/YouTubeTranscriptionAgent');

// Import the mocked class
import { YouTubeTranscriptionAgent } from '../agents/YouTubeTranscriptionAgent';

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Add request ID middleware (similar to main server)
  app.use((req, res, next) => {
    res.locals['requestId'] = req.headers['x-request-id'] || 'test-request-id';
    next();
  });
  
  app.use('/', transcriptionRouter);
  return app;
};

describe('Transcription Routes', () => {
  let app: express.Application;
  let mockTranscribe: jest.Mock;
  let mockGetAgentStatus: jest.Mock;
  let mockValidationTool: jest.Mock;

  beforeEach(() => {
    // Reset the agent before each test
    resetTranscriptionAgent();
    
    app = createTestApp();
    
    // Create fresh mocks for each test
    mockTranscribe = jest.fn();
    mockGetAgentStatus = jest.fn();
    mockValidationTool = jest.fn();
    
    // Create a mock agent instance
    const mockAgent = {
      transcribe: mockTranscribe,
      getAgentStatus: mockGetAgentStatus,
      tools: [{ func: mockValidationTool }]
    } as any;
    
    // Inject the mock agent
    setTranscriptionAgent(mockAgent);
  });

  afterEach(() => {
    // Clean up after each test
    resetTranscriptionAgent();
  });

  describe('POST /transcribe', () => {
    const validTranscriptionResult = {
      videoId: 'test-video-id',
      title: 'Test Video Title',
      description: 'Test video description',
      captions: [
        { text: 'Hello world', start: 0, duration: 2 },
        { text: 'This is a test', start: 2, duration: 3 }
      ],
      summary: 'Test video summary',
      keywords: ['test', 'video'],
      metadata: {
        duration: 120,
        language: 'en',
        processingTime: 1000,
        enhanced: true
      }
    };

    it('should successfully transcribe a valid YouTube URL', async () => {
      mockTranscribe.mockResolvedValue(validTranscriptionResult);

      const response = await request(app)
        .post('/transcribe')
        .send({
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          options: {
            language: 'en',
            includeTimestamps: true
          }
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: validTranscriptionResult
      });

      expect(mockTranscribe).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        {
          language: 'en',
          includeTimestamps: true
        }
      );
    });

    it('should handle transcription without options', async () => {
      mockTranscribe.mockResolvedValue(validTranscriptionResult);

      const response = await request(app)
        .post('/transcribe')
        .send({
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockTranscribe).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        {}
      );
    });

    it('should return 400 for invalid URL format', async () => {
      const response = await request(app)
        .post('/transcribe')
        .send({
          videoUrl: 'not-a-valid-url'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid request')
      });

      expect(mockTranscribe).not.toHaveBeenCalled();
    });

    it('should return 400 for missing videoUrl', async () => {
      const response = await request(app)
        .post('/transcribe')
        .send({
          options: { language: 'en' }
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid request')
      });

      expect(mockTranscribe).not.toHaveBeenCalled();
    });

    it('should return 404 when video is not found', async () => {
      mockTranscribe.mockRejectedValue(new Error('Video not found or unavailable'));

      const response = await request(app)
        .post('/transcribe')
        .send({
          videoUrl: 'https://www.youtube.com/watch?v=nonexistent'
        })
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Video not found or unavailable'
      });
    });

    it('should return 429 for rate limit errors', async () => {
      mockTranscribe.mockRejectedValue(new Error('Rate limit exceeded'));

      const response = await request(app)
        .post('/transcribe')
        .send({
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        })
        .expect(429);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Rate limit exceeded'
      });
    });

    it('should return 500 for general errors', async () => {
      mockTranscribe.mockRejectedValue(new Error('Internal processing error'));

      const response = await request(app)
        .post('/transcribe')
        .send({
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Internal processing error'
      });
    });

    it('should validate options schema', async () => {
      const response = await request(app)
        .post('/transcribe')
        .send({
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          options: {
            includeTimestamps: 'not-a-boolean' // Invalid type
          }
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(mockTranscribe).not.toHaveBeenCalled();
    });
  });

  describe('GET /agent/status', () => {
    const mockStatus = {
      available: true,
      model: 'llama3.2',
      tools: ['youtube_validator', 'video_info', 'audio_extractor', 'transcription', 'text_enhancer']
    };

    it('should return agent status successfully', async () => {
      mockGetAgentStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/agent/status')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: mockStatus
      });

      expect(mockGetAgentStatus).toHaveBeenCalled();
    });

    it('should handle agent status errors', async () => {
      mockGetAgentStatus.mockRejectedValue(new Error('Agent unavailable'));

      const response = await request(app)
        .get('/agent/status')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Agent unavailable'
      });
    });
  });

  describe('POST /validate', () => {
    const mockValidationResult = {
      valid: true,
      videoId: 'dQw4w9WgXcQ',
      error: null
    };

    it('should validate a YouTube URL successfully', async () => {
      mockValidationTool.mockResolvedValue(mockValidationResult);

      const response = await request(app)
        .post('/validate')
        .send({
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: mockValidationResult
      });

      expect(mockValidationTool).toHaveBeenCalledWith({
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      });
    });

    it('should return 400 for missing videoUrl', async () => {
      const response = await request(app)
        .post('/validate')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'videoUrl is required and must be a string'
      });
    });

    it('should return 400 for non-string videoUrl', async () => {
      const response = await request(app)
        .post('/validate')
        .send({
          videoUrl: 123
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'videoUrl is required and must be a string'
      });
    });

    it('should handle validation errors', async () => {
      mockValidationTool.mockRejectedValue(new Error('Invalid video URL'));

      const response = await request(app)
        .post('/validate')
        .send({
          videoUrl: 'https://www.youtube.com/watch?v=invalid'
        })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid video URL'
      });
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'healthy',
          timestamp: expect.any(String),
          service: 'youtube-transcription-agent',
          version: '1.0.0'
        }
      });

      // Verify timestamp is valid ISO string
      expect(new Date(response.body.data.timestamp).toISOString()).toBe(response.body.data.timestamp);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid routes gracefully', async () => {
      await request(app)
        .get('/invalid-route')
        .expect(404);
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/transcribe')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });
  });

  describe('Request Logging', () => {
    it('should log transcription requests', async () => {
      const validTranscriptionResult = {
        videoId: 'test-video-id',
        title: 'Test Video Title',
        description: 'Test video description',
        captions: [
          { text: 'Hello world', start: 0, duration: 2 },
          { text: 'This is a test', start: 2, duration: 3 }
        ],
        summary: 'Test video summary',
        keywords: ['test', 'video'],
        metadata: {
          duration: 120,
          language: 'en',
          processingTime: 1000,
          enhanced: true
        }
      };

      mockTranscribe.mockResolvedValue(validTranscriptionResult);

      await request(app)
        .post('/transcribe')
        .set('User-Agent', 'test-agent')
        .send({
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        })
        .expect(200);

      // Verify the agent was called (logging is mocked in test-setup.ts)
      expect(mockTranscribe).toHaveBeenCalled();
    });
  });
});
