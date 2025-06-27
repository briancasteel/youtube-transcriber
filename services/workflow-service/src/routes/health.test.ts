import request from 'supertest';
import express from 'express';
import healthRouter from './health';

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Add request ID middleware (similar to main server)
  app.use((req, res, next) => {
    res.locals['requestId'] = req.headers['x-request-id'] || 'test-request-id';
    next();
  });
  
  app.use('/', healthRouter);
  return app;
};

describe('Health Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
    // Reset environment variables
    delete process.env['npm_package_version'];
    delete process.env['NODE_ENV'];
  });

  describe('GET /health', () => {
    it('should return healthy status with basic information', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'healthy',
          service: 'workflow-service',
          version: '1.0.0',
          uptime: expect.any(Number),
          timestamp: expect.any(String)
        },
        timestamp: expect.any(String),
        requestId: 'test-request-id'
      });

      // Verify timestamp is valid ISO string
      expect(new Date(response.body.data.timestamp).toISOString()).toBe(response.body.data.timestamp);
      expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
    });

    it('should use npm package version when available', async () => {
      process.env['npm_package_version'] = '2.1.0';
      
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.data.version).toBe('2.1.0');
    });

    it('should include custom request ID from header', async () => {
      const customRequestId = 'custom-test-id-123';
      
      const response = await request(app)
        .get('/health')
        .set('x-request-id', customRequestId)
        .expect(200);

      expect(response.body.requestId).toBe(customRequestId);
    });

    it('should have uptime greater than 0', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.data.uptime).toBeGreaterThan(0);
    });
  });

  describe('GET /health/detailed', () => {
    it('should return detailed health information', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'healthy',
          service: 'workflow-service',
          version: expect.any(String),
          uptime: expect.any(Number),
          timestamp: expect.any(String),
          environment: expect.any(String),
          nodeVersion: expect.any(String),
          memory: {
            used: expect.any(Number),
            total: expect.any(Number),
            external: expect.any(Number),
            rss: expect.any(Number)
          },
          cpu: {
            loadAverage: expect.any(Array),
            cpuCount: expect.any(Number)
          },
          dependencies: {
            videoProcessor: 'healthy',
            transcriptionService: 'healthy',
            llmService: 'healthy',
            ollama: 'healthy'
          }
        },
        timestamp: expect.any(String),
        requestId: 'test-request-id'
      });
    });

    it('should include environment information', async () => {
      process.env['NODE_ENV'] = 'production';
      
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.data.environment).toBe('production');
    });

    it('should default to development environment', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.data.environment).toBe('development');
    });

    it('should include memory usage in MB', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      const { memory } = response.body.data;
      
      // Memory values should be positive numbers (in MB)
      expect(memory.used).toBeGreaterThan(0);
      expect(memory.total).toBeGreaterThan(0);
      expect(memory.external).toBeGreaterThanOrEqual(0);
      expect(memory.rss).toBeGreaterThan(0);
    });

    it('should include CPU information', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      const { cpu } = response.body.data;
      
      expect(cpu.loadAverage).toHaveLength(3);
      expect(cpu.cpuCount).toBeGreaterThan(0);
    });

    it('should include Node.js version', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.data.nodeVersion).toBe(process.version);
    });

    it('should mark all dependencies as healthy', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      const { dependencies } = response.body.data;
      
      expect(dependencies.videoProcessor).toBe('healthy');
      expect(dependencies.transcriptionService).toBe('healthy');
      expect(dependencies.llmService).toBe('healthy');
      expect(dependencies.ollama).toBe('healthy');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid routes gracefully', async () => {
      await request(app)
        .get('/health/invalid')
        .expect(404);
    });

    it('should handle POST requests to health endpoints', async () => {
      await request(app)
        .post('/health')
        .expect(404);
    });
  });

  describe('Response Headers', () => {
    it('should set appropriate content-type header', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should include request ID in response for detailed health', async () => {
      const customRequestId = 'detailed-health-test-123';
      
      const response = await request(app)
        .get('/health/detailed')
        .set('x-request-id', customRequestId)
        .expect(200);

      expect(response.body.requestId).toBe(customRequestId);
    });
  });
});
