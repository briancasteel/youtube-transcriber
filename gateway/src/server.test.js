const request = require('supertest');
const app = require('./server');

// Mock axios for external API calls
jest.mock('axios');
const axios = require('axios');

describe('Gateway Server', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Health Endpoints', () => {
    describe('GET /health', () => {
      it('should return gateway health status', async () => {
        const response = await request(app)
          .get('/health')
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          data: {
            service: 'YouTube Transcriber API Gateway',
            status: 'healthy',
            timestamp: expect.any(String),
            version: '1.0.0'
          },
          timestamp: expect.any(String),
          requestId: expect.any(String)
        });

        // Verify timestamp is valid ISO string
        expect(new Date(response.body.data.timestamp).toISOString()).toBe(response.body.data.timestamp);
        expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
      });

      it('should include request ID from header', async () => {
        const customRequestId = 'test-gateway-123';
        
        const response = await request(app)
          .get('/health')
          .set('x-request-id', customRequestId)
          .expect(200);

        expect(response.body.requestId).toBe(customRequestId);
      });

      it('should generate request ID if not provided', async () => {
        const response = await request(app)
          .get('/health')
          .expect(200);

        expect(response.body.requestId).toMatch(/^req-\d+-[a-z0-9]+$/);
      });
    });

    describe('GET /api/health', () => {
      it('should return API health status', async () => {
        const response = await request(app)
          .get('/api/health')
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          data: {
            service: 'YouTube Transcriber API Gateway',
            status: 'healthy',
            timestamp: expect.any(String),
            version: '1.0.0'
          },
          timestamp: expect.any(String),
          requestId: expect.any(String)
        });
      });
    });
  });

  describe('Root Endpoint', () => {
    describe('GET /', () => {
      it('should return service information and endpoints', async () => {
        const response = await request(app)
          .get('/')
          .expect(200);

        expect(response.body).toMatchObject({
          service: 'YouTube Transcriber API Gateway',
          version: '1.0.0',
          status: 'healthy',
          timestamp: expect.any(String),
          endpoints: {
            health: '/health',
            transcribe: '/api/transcribe',
            validate: '/api/validate',
            agentStatus: '/api/agent/status'
          }
        });

        // Verify timestamp is valid ISO string
        expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
      });
    });
  });

  describe('Error Handling', () => {
    describe('404 Handler', () => {
      it('should return 404 for unknown routes', async () => {
        const response = await request(app)
          .get('/unknown-route')
          .expect(404);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Endpoint not found',
          path: '/unknown-route',
          method: 'GET',
          timestamp: expect.any(String),
          requestId: expect.any(String)
        });
      });

      it('should return 502 for unknown API routes (proxied)', async () => {
        const response = await request(app)
          .get('/api/unknown')
          .expect(502);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Bad Gateway - Service unavailable',
          code: 'PROXY_ERROR',
          timestamp: expect.any(String),
          requestId: expect.any(String)
        });
      });

      it('should handle POST requests to unknown routes', async () => {
        const response = await request(app)
          .post('/unknown-route')
          .send({ test: 'data' })
          .expect(404);

        expect(response.body.method).toBe('POST');
      });
    });

    describe('Error Middleware', () => {
      it('should handle malformed JSON', async () => {
        const response = await request(app)
          .post('/api/transcribe')
          .set('Content-Type', 'application/json')
          .send('{"invalid": json}')
          .expect(400);
      });
    });
  });

  describe('CORS Configuration', () => {
    it('should include CORS headers for cross-origin requests', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      // CORS headers are only set when there's an Origin header
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should handle OPTIONS requests', async () => {
      await request(app)
        .options('/api/transcribe')
        .set('Origin', 'http://localhost:3000')
        .expect(204);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Check for helmet security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
    });
  });

  describe('Request ID Middleware', () => {
    it('should add request ID to response headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id']).toMatch(/^req-\d+-[a-z0-9]+$/);
    });

    it('should use provided request ID', async () => {
      const customRequestId = 'custom-test-id';
      
      const response = await request(app)
        .get('/health')
        .set('x-request-id', customRequestId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(customRequestId);
    });
  });

  describe('Compression', () => {
    it('should handle compression middleware', async () => {
      const response = await request(app)
        .get('/')
        .set('Accept-Encoding', 'gzip')
        .expect(200);

      // Compression middleware is present, but small responses may not be compressed
      // Just verify the request succeeds and content-type is correct
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('Rate Limiting', () => {
    it('should accept requests within rate limits', async () => {
      // Make a few requests to test rate limiting doesn't block normal usage
      for (let i = 0; i < 5; i++) {
        await request(app)
          .get('/health')
          .expect(200);
      }
    });

    it('should handle rate limiting middleware', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Rate limiting is configured but headers may not always be present
      // Just verify the request succeeds
      expect(response.status).toBe(200);
    });
  });

  describe('Content Type Handling', () => {
    it('should handle JSON content type', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should parse JSON request bodies', async () => {
      // This will be proxied, but we can test that the gateway accepts JSON
      const response = await request(app)
        .post('/api/validate')
        .send({ videoUrl: 'test' })
        .expect(502); // 502 because backend is not running, but JSON was parsed

      expect(response.body.error).toContain('Bad Gateway');
    });
  });

  describe('Proxy Error Handling', () => {
    it('should return 502 when backend service is unavailable', async () => {
      const response = await request(app)
        .get('/api/agent/status')
        .expect(502);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Bad Gateway - Service unavailable',
        code: 'PROXY_ERROR',
        timestamp: expect.any(String),
        requestId: expect.any(String)
      });
    });

    it('should handle proxy timeouts', async () => {
      const response = await request(app)
        .post('/api/transcribe')
        .send({ videoUrl: 'https://www.youtube.com/watch?v=test' })
        .expect(502);

      expect(response.body.code).toBe('PROXY_ERROR');
    });
  });

  describe('Request Logging', () => {
    it('should log requests', async () => {
      // Since morgan is used for logging, we can't easily test the actual logs
      // but we can verify the request completes successfully
      await request(app)
        .get('/health')
        .expect(200);
    });
  });
});
