import request from 'supertest';
import express from 'express';
import axios from 'axios';
import { healthRoutes } from './health';

// Mock axios
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/health', healthRoutes);
  return app;
};

describe('Health Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return basic health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        serviceName: 'api-gateway',
        status: 'healthy',
        version: '1.0.0',
        environment: 'test',
      });

      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.metrics).toBeDefined();
      expect(response.body.metrics.memoryUsage).toBeDefined();
      expect(response.body.metrics.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include memory usage metrics', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const { memoryUsage } = response.body.metrics;
      expect(memoryUsage).toHaveProperty('rss');
      expect(memoryUsage).toHaveProperty('heapTotal');
      expect(memoryUsage).toHaveProperty('heapUsed');
      expect(memoryUsage).toHaveProperty('external');

      // All memory values should be positive numbers
      Object.values(memoryUsage).forEach(value => {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
      });
    });
  });

  describe('GET /health/detailed', () => {
    it('should return detailed health status when all services are healthy', async () => {
      // Mock all services as healthy
      mockedAxios.get.mockImplementation((url: string) => {
        return Promise.resolve({
          status: 200,
          data: {
            status: 'healthy',
            version: '1.0.0',
            uptime: 3600,
          },
        });
      });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body).toMatchObject({
        serviceName: 'api-gateway',
        status: 'healthy',
        version: '1.0.0',
      });

      expect(response.body.dependencies).toHaveLength(5);
      expect(response.body.dependencies.every((dep: any) => dep.status === 'healthy')).toBe(true);

      const serviceNames = response.body.dependencies.map((dep: any) => dep.name);
      expect(serviceNames).toContain('workflow-service');
      expect(serviceNames).toContain('video-processor');
      expect(serviceNames).toContain('transcription-service');
      expect(serviceNames).toContain('file-storage');
      expect(serviceNames).toContain('llm-service');
    });

    it('should return degraded status when some services return 4xx', async () => {
      // Mock some services as degraded (4xx status)
      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('workflow-service')) {
          return Promise.resolve({
            status: 429, // Rate limited
            data: { status: 'degraded' },
          });
        }
        return Promise.resolve({
          status: 200,
          data: { status: 'healthy' },
        });
      });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.status).toBe('degraded');
      
      const workflowService = response.body.dependencies.find((dep: any) => dep.name === 'workflow-service');
      expect(workflowService.status).toBe('degraded');
      expect(workflowService.statusCode).toBe(429);
    });

    it('should return unhealthy status when services are down', async () => {
      // Mock services as down
      mockedAxios.get.mockImplementation(() => {
        return Promise.reject(new Error('Connection refused'));
      });

      const response = await request(app)
        .get('/health/detailed')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.dependencies.every((dep: any) => dep.status === 'unhealthy')).toBe(true);
    });

    it('should handle mixed service states correctly', async () => {
      // Mock mixed service states
      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('workflow-service')) {
          return Promise.resolve({
            status: 200,
            data: { status: 'healthy' },
          });
        }
        if (url.includes('video-processor')) {
          return Promise.resolve({
            status: 429,
            data: { status: 'degraded' },
          });
        }
        if (url.includes('transcription-service')) {
          return Promise.reject(new Error('Service unavailable'));
        }
        return Promise.resolve({
          status: 200,
          data: { status: 'healthy' },
        });
      });

      const response = await request(app)
        .get('/health/detailed')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');

      const workflowService = response.body.dependencies.find((dep: any) => dep.name === 'workflow-service');
      expect(workflowService.status).toBe('healthy');

      const videoProcessor = response.body.dependencies.find((dep: any) => dep.name === 'video-processor');
      expect(videoProcessor.status).toBe('degraded');

      const transcriptionService = response.body.dependencies.find((dep: any) => dep.name === 'transcription-service');
      expect(transcriptionService.status).toBe('unhealthy');
    });

    it('should include response times for all services', async () => {
      mockedAxios.get.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              status: 200,
              data: { status: 'healthy' },
            });
          }, 100);
        });
      });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      response.body.dependencies.forEach((dep: any) => {
        expect(dep.responseTime).toBeGreaterThan(0);
        expect(typeof dep.responseTime).toBe('number');
      });
    });

    it('should include health check duration in metrics', async () => {
      mockedAxios.get.mockImplementation(() => {
        return Promise.resolve({
          status: 200,
          data: { status: 'healthy' },
        });
      });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.metrics.healthCheckDuration).toBeGreaterThan(0);
      expect(typeof response.body.metrics.healthCheckDuration).toBe('number');
    });

    it('should handle service timeout correctly', async () => {
      mockedAxios.get.mockImplementation(() => {
        return Promise.reject({
          code: 'ECONNABORTED',
          message: 'timeout of 5000ms exceeded',
        });
      });

      const response = await request(app)
        .get('/health/detailed')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      response.body.dependencies.forEach((dep: any) => {
        expect(dep.status).toBe('unhealthy');
        expect(dep.error).toContain('timeout');
      });
    });

    it('should include service versions when available', async () => {
      mockedAxios.get.mockImplementation(() => {
        return Promise.resolve({
          status: 200,
          data: {
            status: 'healthy',
            version: '2.1.0',
            uptime: 7200,
          },
        });
      });

      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      response.body.dependencies.forEach((dep: any) => {
        expect(dep.version).toBe('2.1.0');
        expect(dep.uptime).toBe(7200);
      });
    });

    it('should handle request with X-Request-ID header', async () => {
      mockedAxios.get.mockImplementation(() => {
        return Promise.resolve({
          status: 200,
          data: { status: 'healthy' },
        });
      });

      const requestId = 'test-request-123';
      const response = await request(app)
        .get('/health/detailed')
        .set('X-Request-ID', requestId)
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });
  });

  describe('Service Health Check Function', () => {
    it('should handle network errors gracefully', async () => {
      mockedAxios.get.mockImplementation(() => {
        return Promise.reject({
          code: 'ENOTFOUND',
          message: 'getaddrinfo ENOTFOUND test-service',
        });
      });

      const response = await request(app)
        .get('/health/detailed')
        .expect(503);

      response.body.dependencies.forEach((dep: any) => {
        expect(dep.status).toBe('unhealthy');
        expect(dep.code).toBe('ENOTFOUND');
        expect(dep.error).toContain('getaddrinfo ENOTFOUND');
      });
    });

    it('should handle connection refused errors', async () => {
      mockedAxios.get.mockImplementation(() => {
        return Promise.reject({
          code: 'ECONNREFUSED',
          message: 'connect ECONNREFUSED 127.0.0.1:8001',
        });
      });

      const response = await request(app)
        .get('/health/detailed')
        .expect(503);

      response.body.dependencies.forEach((dep: any) => {
        expect(dep.status).toBe('unhealthy');
        expect(dep.code).toBe('ECONNREFUSED');
        expect(dep.error).toContain('ECONNREFUSED');
      });
    });
  });
});
