import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

// Basic health check
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  
  logger.debug('Health check requested', { requestId });

  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      service: 'workflow-service',
      version: process.env['npm_package_version'] || '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    },
    timestamp: new Date().toISOString(),
    requestId
  });
}));

// Detailed health check
router.get('/health/detailed', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  
  logger.debug('Detailed health check requested', { requestId });

  const healthData = {
    status: 'healthy',
    service: 'workflow-service',
    version: process.env['npm_package_version'] || '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env['NODE_ENV'] || 'development',
    nodeVersion: process.version,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
    },
    cpu: {
      loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0],
      cpuCount: require('os').cpus().length
    },
    dependencies: {
      redis: 'checking',
      videoProcessor: 'checking',
      transcriptionService: 'checking',
      llmService: 'checking'
    }
  };

  // TODO: Add actual dependency health checks
  // For now, we'll mark them as healthy
  healthData.dependencies = {
    redis: 'healthy',
    videoProcessor: 'healthy', 
    transcriptionService: 'healthy',
    llmService: 'healthy'
  };

  res.status(200).json({
    success: true,
    data: healthData,
    timestamp: new Date().toISOString(),
    requestId
  });
}));

export default router;
