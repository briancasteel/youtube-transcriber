import { Router, Request, Response } from 'express';
import { createClient } from 'redis';
import { logger } from '../utils/logger';

const router = Router();

// Redis client for health checks
const redisClient = createClient({
  url: process.env['REDIS_URL'] || 'redis://localhost:6379'
});

// Basic health check
router.get('/', (_req: Request, res: Response) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  res.json({
    success: true,
    data: {
      status: 'healthy',
      service: 'transcription-service',
      uptime: `${Math.floor(uptime)}s`,
      memory: {
        used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
      },
      timestamp: new Date().toISOString()
    },
    timestamp: new Date().toISOString(),
    requestId: res.locals['requestId']
  });
});

// Detailed health check with dependencies
router.get('/detailed', async (_req: Request, res: Response) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  // Check Redis connection
  let redisStatus = 'unknown';
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    await redisClient.ping();
    redisStatus = 'connected';
  } catch (error) {
    redisStatus = 'disconnected';
    logger.warn('Redis health check failed', { error: (error as Error).message });
  }
  
  // Check LLM Service connection
  let llmServiceStatus = 'unknown';
  try {
    // This will be implemented when we create the LLM service
    llmServiceStatus = 'not_implemented';
  } catch (error) {
    llmServiceStatus = 'disconnected';
    logger.warn('LLM Service health check failed', { error: (error as Error).message });
  }
  
  // Overall health status
  const isHealthy = redisStatus === 'connected';
  const status = isHealthy ? 'healthy' : 'degraded';
  const httpStatus = isHealthy ? 200 : 503;
  
  res.status(httpStatus).json({
    success: isHealthy,
    data: {
      status,
      service: 'transcription-service',
      version: '1.0.0',
      uptime: `${Math.floor(uptime)}s`,
      memory: {
        used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`
      },
      dependencies: {
        redis: {
          status: redisStatus,
          url: process.env['REDIS_URL'] || 'redis://localhost:6379'
        },
        llmService: {
          status: llmServiceStatus,
          url: process.env['LLM_SERVICE_URL'] || 'http://llm-service:8005'
        }
      },
      environment: process.env['NODE_ENV'] || 'development',
      timestamp: new Date().toISOString()
    },
    timestamp: new Date().toISOString(),
    requestId: res.locals['requestId']
  });
});

export { router as healthRouter };
