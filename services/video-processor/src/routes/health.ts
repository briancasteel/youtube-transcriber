import { Router, Request, Response } from 'express';
import { redisClient } from '../server';
import { logger } from '../utils/logger';

const router = Router();

// Basic health check
router.get('/', (_req: Request, res: Response) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  res.json({
    success: true,
    data: {
      status: 'healthy',
      service: 'video-processor',
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
    await redisClient.ping();
    redisStatus = 'connected';
  } catch (error) {
    redisStatus = 'disconnected';
    logger.warn('Redis health check failed', { error: (error as Error).message });
  }
  
  // Check disk space (basic check)
  const diskUsage = {
    available: 'unknown',
    used: 'unknown'
  };
  
  // Overall health status
  const isHealthy = redisStatus === 'connected';
  const status = isHealthy ? 'healthy' : 'degraded';
  const httpStatus = isHealthy ? 200 : 503;
  
  res.status(httpStatus).json({
    success: isHealthy,
    data: {
      status,
      service: 'video-processor',
      version: '1.0.0',
      uptime: `${Math.floor(uptime)}s`,
      memory: {
        used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`
      },
      disk: diskUsage,
      dependencies: {
        redis: {
          status: redisStatus,
          url: process.env['REDIS_URL'] || 'redis://localhost:6379'
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
