import request from 'supertest';
import express from 'express';
import ytdl from 'ytdl-core';
import { v4 as uuidv4 } from 'uuid';
import { videoRouter } from './video';

// Mock dependencies
const mockedYtdl = ytdl as jest.Mocked<typeof ytdl>;
const mockedUuidv4 = uuidv4 as jest.MockedFunction<typeof uuidv4>;

// Mock Redis client
const mockRedisClient = {
  setEx: jest.fn(),
  get: jest.fn(),
};

jest.mock('../server', () => ({
  redisClient: mockRedisClient,
}));

// Mock VideoProcessor
const mockVideoProcessor = {
  processVideo: jest.fn(),
};

jest.mock('../services/VideoProcessor', () => ({
  VideoProcessor: jest.fn(() => mockVideoProcessor),
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
  
  app.use('/api/video', videoRouter);
  return app;
};

describe('Video Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe('GET /api/video/info', () => {
    const validYouTubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    it('should get video info successfully', async () => {
      const mockVideoInfo = {
        videoDetails: {
          videoId: 'dQw4w9WgXcQ',
          title: 'Rick Astley - Never Gonna Give You Up',
          description: 'Official video description',
          lengthSeconds: '212',
          author: {
            name: 'Rick Astley',
            channel_url: 'https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw',
          },
          thumbnails: [
            { url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg' },
          ],
          publishDate: '2009-10-25',
          viewCount: '1000000000',
          keywords: ['rick', 'astley', 'never', 'gonna', 'give', 'you', 'up'],
          category: 'Music',
          isLiveContent: false,
        },
        formats: [
          {
            itag: 140,
            mimeType: 'audio/mp4; codecs="mp4a.40.2"',
            quality: 'tiny',
            hasAudio: true,
            hasVideo: false,
            container: 'mp4',
            codecs: 'mp4a.40.2',
            audioCodec: 'mp4a.40.2',
            videoCodec: null,
          },
        ],
      };

      mockedYtdl.validateURL.mockReturnValueOnce(true);
      mockedYtdl.getInfo.mockResolvedValueOnce(mockVideoInfo as any);

      const response = await request(app)
        .get('/api/video/info')
        .query({ url: validYouTubeUrl })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.videoId).toBe('dQw4w9WgXcQ');
      expect(response.body.data.title).toBe('Rick Astley - Never Gonna Give You Up');
      expect(response.body.data.lengthSeconds).toBe(212);
      expect(response.body.data.author.name).toBe('Rick Astley');
      expect(response.body.data.formats).toHaveLength(1);
      expect(mockedYtdl.validateURL).toHaveBeenCalledWith(validYouTubeUrl);
      expect(mockedYtdl.getInfo).toHaveBeenCalledWith(validYouTubeUrl);
    });

    it('should handle invalid YouTube URL', async () => {
      const invalidUrl = 'https://google.com';
      mockedYtdl.validateURL.mockReturnValueOnce(false);

      const response = await request(app)
        .get('/api/video/info')
        .query({ url: invalidUrl })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid YouTube URL');
    });

    it('should handle missing URL parameter', async () => {
      const response = await request(app)
        .get('/api/video/info')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid YouTube URL');
    });

    it('should handle ytdl.getInfo errors', async () => {
      mockedYtdl.validateURL.mockReturnValueOnce(true);
      mockedYtdl.getInfo.mockRejectedValueOnce(new Error('Video not available'));

      const response = await request(app)
        .get('/api/video/info')
        .query({ url: validYouTubeUrl })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to retrieve video information');
      expect(response.body.code).toBe('VIDEO_INFO_ERROR');
    });

    it('should handle non-string URL parameter', async () => {
      const response = await request(app)
        .get('/api/video/info')
        .query({ url: 123 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid YouTube URL');
    });
  });

  describe('POST /api/video/process', () => {
    const validProcessRequest = {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      quality: 'highestaudio',
      format: 'mp3',
    };

    it('should start video processing successfully', async () => {
      const mockVideoInfo = {
        videoDetails: {
          videoId: 'dQw4w9WgXcQ',
          title: 'Rick Astley - Never Gonna Give You Up',
          lengthSeconds: '212',
          author: {
            name: 'Rick Astley',
          },
        },
      };

      const jobId = 'test-uuid-123';
      mockedYtdl.validateURL.mockReturnValueOnce(true);
      mockedYtdl.getInfo.mockResolvedValueOnce(mockVideoInfo as any);
      mockedUuidv4.mockReturnValueOnce(jobId);
      mockRedisClient.setEx.mockResolvedValueOnce('OK');
      mockVideoProcessor.processVideo.mockResolvedValueOnce(undefined);

      const response = await request(app)
        .post('/api/video/process')
        .send(validProcessRequest)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.jobId).toBe(jobId);
      expect(response.body.data.status).toBe('queued');
      expect(response.body.data.estimatedTime).toBe('4 minutes');
      expect(response.body.data.statusUrl).toBe(`/api/video/status/${jobId}`);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        `video_job:${jobId}`,
        3600,
        expect.stringContaining(jobId)
      );
      expect(mockVideoProcessor.processVideo).toHaveBeenCalledWith(
        jobId,
        validProcessRequest.url,
        validProcessRequest.quality,
        validProcessRequest.format
      );
    });

    it('should use default quality and format', async () => {
      const mockVideoInfo = {
        videoDetails: {
          videoId: 'dQw4w9WgXcQ',
          title: 'Test Video',
          lengthSeconds: '120',
          author: { name: 'Test Author' },
        },
      };

      const minimalRequest = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      };

      mockedYtdl.validateURL.mockReturnValueOnce(true);
      mockedYtdl.getInfo.mockResolvedValueOnce(mockVideoInfo as any);
      mockRedisClient.setEx.mockResolvedValueOnce('OK');

      const response = await request(app)
        .post('/api/video/process')
        .send(minimalRequest)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(mockVideoProcessor.processVideo).toHaveBeenCalledWith(
        expect.any(String),
        minimalRequest.url,
        'highestaudio',
        'mp3'
      );
    });

    it('should handle invalid YouTube URL', async () => {
      const invalidRequest = {
        url: 'https://google.com',
      };

      mockedYtdl.validateURL.mockReturnValueOnce(false);

      const response = await request(app)
        .post('/api/video/process')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid YouTube URL');
    });

    it('should handle missing URL', async () => {
      const invalidRequest = {
        quality: 'high',
      };

      const response = await request(app)
        .post('/api/video/process')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid YouTube URL');
    });

    it('should handle invalid quality parameter', async () => {
      const invalidRequest = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        quality: 'invalid_quality',
      };

      mockedYtdl.validateURL.mockReturnValueOnce(true);

      const response = await request(app)
        .post('/api/video/process')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle invalid format parameter', async () => {
      const invalidRequest = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        format: 'invalid_format',
      };

      mockedYtdl.validateURL.mockReturnValueOnce(true);

      const response = await request(app)
        .post('/api/video/process')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle ytdl.getInfo errors', async () => {
      mockedYtdl.validateURL.mockReturnValueOnce(true);
      mockedYtdl.getInfo.mockRejectedValueOnce(new Error('Video unavailable'));

      const response = await request(app)
        .post('/api/video/process')
        .send(validProcessRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to start video processing');
      expect(response.body.code).toBe('VIDEO_PROCESSING_ERROR');
    });

    it('should handle processing errors gracefully', async () => {
      const mockVideoInfo = {
        videoDetails: {
          videoId: 'dQw4w9WgXcQ',
          title: 'Test Video',
          lengthSeconds: '120',
          author: { name: 'Test Author' },
        },
      };

      mockedYtdl.validateURL.mockReturnValueOnce(true);
      mockedYtdl.getInfo.mockResolvedValueOnce(mockVideoInfo as any);
      mockRedisClient.setEx.mockResolvedValueOnce('OK');
      mockVideoProcessor.processVideo.mockRejectedValueOnce(new Error('Processing failed'));

      // Should still return success since processing is async
      const response = await request(app)
        .post('/api/video/process')
        .send(validProcessRequest)
        .expect(202);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/video/status/:jobId', () => {
    const jobId = 'test-job-123';

    it('should get job status successfully', async () => {
      const mockJobData = {
        jobId,
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        status: 'processing',
        progress: 50,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:05:00Z',
      };

      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(mockJobData));

      const response = await request(app)
        .get(`/api/video/status/${jobId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockJobData);
      expect(mockRedisClient.get).toHaveBeenCalledWith(`video_job:${jobId}`);
    });

    it('should handle missing job ID', async () => {
      const response = await request(app)
        .get('/api/video/status/')
        .expect(404);

      // Express will return 404 for missing route parameter
    });

    it('should handle invalid job ID type', async () => {
      const response = await request(app)
        .get('/api/video/status/123')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid job ID');
      expect(response.body.code).toBe('INVALID_JOB_ID');
    });

    it('should handle job not found', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`/api/video/status/${jobId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Job not found');
      expect(response.body.code).toBe('JOB_NOT_FOUND');
    });

    it('should handle Redis errors', async () => {
      mockRedisClient.get.mockRejectedValueOnce(new Error('Redis connection failed'));

      const response = await request(app)
        .get(`/api/video/status/${jobId}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to retrieve job status');
      expect(response.body.code).toBe('STATUS_RETRIEVAL_ERROR');
    });

    it('should handle malformed JSON in Redis', async () => {
      mockRedisClient.get.mockResolvedValueOnce('invalid json');

      const response = await request(app)
        .get(`/api/video/status/${jobId}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to retrieve job status');
    });

    it('should handle empty job ID', async () => {
      const response = await request(app)
        .get('/api/video/status/')
        .expect(404);
    });

    it('should handle null job ID', async () => {
      const response = await request(app)
        .get('/api/video/status/null')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid job ID');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post('/api/video/process')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/video/process')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should include request ID in all responses', async () => {
      const response = await request(app)
        .get('/api/video/info')
        .expect(400);

      expect(response.body.requestId).toBe('test-request-123');
    });

    it('should include timestamp in all responses', async () => {
      const response = await request(app)
        .get('/api/video/info')
        .expect(400);

      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('Input Validation', () => {
    it('should validate quality enum values', async () => {
      const validQualities = ['highest', 'lowest', 'highestaudio', 'lowestaudio'];
      
      for (const quality of validQualities) {
        mockedYtdl.validateURL.mockReturnValueOnce(true);
        mockedYtdl.getInfo.mockResolvedValueOnce({
          videoDetails: {
            videoId: 'test',
            title: 'Test',
            lengthSeconds: '120',
            author: { name: 'Test' },
          },
        } as any);
        mockRedisClient.setEx.mockResolvedValueOnce('OK');

        const response = await request(app)
          .post('/api/video/process')
          .send({
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            quality,
          });

        expect(response.status).toBe(202);
      }
    });

    it('should validate format enum values', async () => {
      const validFormats = ['mp4', 'webm', 'mp3', 'wav'];
      
      for (const format of validFormats) {
        mockedYtdl.validateURL.mockReturnValueOnce(true);
        mockedYtdl.getInfo.mockResolvedValueOnce({
          videoDetails: {
            videoId: 'test',
            title: 'Test',
            lengthSeconds: '120',
            author: { name: 'Test' },
          },
        } as any);
        mockRedisClient.setEx.mockResolvedValueOnce('OK');

        const response = await request(app)
          .post('/api/video/process')
          .send({
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            format,
          });

        expect(response.status).toBe(202);
      }
    });
  });
});
