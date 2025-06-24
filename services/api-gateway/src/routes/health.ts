import { Router, Request, Response } from 'express';
import axios from 'axios';
import { createLogger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
const logger = createLogger('api-gateway');

// Service URLs from environment variables
const WORKFLOW_SERVICE_URL = process.env.WORKFLOW_SERVICE_URL || 'http://workflow-service:8001';
const VIDEO_PROCESSOR_URL = process.env.VIDEO_PROCESSOR_URL || 'http://video-processor:8002';
const TRANSCRIPTION_SERVICE_URL = process.env.TRANSCRIPTION_SERVICE_URL || 'http://transcription:8003';
const FILE_STORAGE_URL = process.env.FILE_STORAGE_URL || 'http://file-storage:8004';
const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL || 'http://llm-service:8005';

// Health check for API Gateway itself
router.get('/', (req: Request, res: Response) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  res.json({
    serviceName: 'api-gateway',
    status: 'healthy',
    version: '1.0.0',
    uptime: Math.floor(uptime),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    metrics: {
      memoryUsage: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024), // MB
      },
      uptime: Math.floor(uptime),
    }
  });
});

// Comprehensive health check including all services
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  const startTime = Date.now();
  
  logger.info('Starting detailed health check', undefined, requestId);

  // Check all services in parallel
  const serviceChecks = await Promise.allSettled([
    checkService('workflow-service', `${WORKFLOW_SERVICE_URL}/health`),
    checkService('video-processor', `${VIDEO_PROCESSOR_URL}/health`),
    checkService('transcription-service', `${TRANSCRIPTION_SERVICE_URL}/health`),
    checkService('file-storage', `${FILE_STORAGE_URL}/health`),
    checkService('llm-service', `${LLM_SERVICE_URL}/health`),
  ]);

  // Process results
  const dependencies = serviceChecks.map((result, index) => {
    const serviceNames = ['workflow-service', 'video-processor', 'transcription-service', 'file-storage', 'llm-service'];
    const serviceName = serviceNames[index];
    
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      logger.warn(`Health check failed for ${serviceName}`, undefined, requestId);
      return {
        name: serviceName,
        status: 'unhealthy' as const,
        error: result.reason?.message || 'Unknown error',
      };
    }
  });

  // Determine overall status
  const allHealthy = dependencies.every(dep => dep.status === 'healthy');
  const anyDegraded = dependencies.some(dep => dep.status === 'degraded');
  const overallStatus = allHealthy ? 'healthy' : anyDegraded ? 'degraded' : 'unhealthy';

  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  const duration = Date.now() - startTime;

  const healthResponse = {
    serviceName: 'api-gateway',
    status: overallStatus,
    version: '1.0.0',
    uptime: Math.floor(uptime),
    timestamp: new Date().toISOString(),
    dependencies,
    metrics: {
      memoryUsage: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
      },
      uptime: Math.floor(uptime),
      healthCheckDuration: duration,
    }
  };

  logger.info('Detailed health check completed', { 
    status: overallStatus, 
    duration,
    healthyServices: dependencies.filter(d => d.status === 'healthy').length,
    totalServices: dependencies.length 
  }, requestId);

  // Return appropriate status code
  const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
  res.status(statusCode).json(healthResponse);
}));

// Helper function to check individual service health
async function checkService(name: string, url: string, timeout: number = 5000) {
  const startTime = Date.now();
  
  try {
    const response = await axios.get(url, { 
      timeout,
      validateStatus: (status) => status < 500 // Accept 4xx as healthy but degraded
    });
    
    const responseTime = Date.now() - startTime;
    const status = response.status < 400 ? 'healthy' : 'degraded';
    
    return {
      name,
      status,
      responseTime,
      statusCode: response.status,
      ...(response.data?.version && { version: response.data.version }),
      ...(response.data?.uptime && { uptime: response.data.uptime }),
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    return {
      name,
      status: 'unhealthy' as const,
      responseTime,
      error: error.message,
      code: error.code,
    };
  }
}

export { router as healthRoutes };
