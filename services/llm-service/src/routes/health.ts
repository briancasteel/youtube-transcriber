import { Router, Request, Response } from 'express';
import { createClient } from 'redis';
import axios from 'axios';
import logger from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Basic health check
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  
  logger.debug('Health check requested', { requestId });

  const healthData = {
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'llm-service',
    version: '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    requestId
  };

  res.status(200).json(healthData);
}));

// Detailed health check with dependencies
router.get('/health/detailed', asyncHandler(async (req: Request, res: Response) => {
  const requestId = res.locals['requestId'];
  
  logger.debug('Detailed health check requested', { requestId });

  const healthData = {
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'llm-service',
    version: '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    dependencies: {
      redis: 'unknown',
      ollama: 'unknown',
      whisper: 'unknown'
    },
    requestId
  };

  // Check Redis connection
  try {
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
    const redis = createClient({ url: redisUrl });
    
    await redis.connect();
    await redis.ping();
    await redis.disconnect();
    
    healthData.dependencies.redis = 'healthy';
    logger.debug('Redis health check passed', { requestId });
  } catch (error) {
    healthData.dependencies.redis = 'unhealthy';
    logger.warn('Redis health check failed', { 
      requestId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }

  // Check Ollama connection
  try {
    const ollamaUrl = process.env['OLLAMA_URL'] || 'http://localhost:11434';
    const response = await axios.get(`${ollamaUrl}/api/tags`, { timeout: 5000 });
    
    if (response.status === 200) {
      healthData.dependencies.ollama = 'healthy';
      logger.debug('Ollama health check passed', { requestId });
    } else {
      healthData.dependencies.ollama = 'unhealthy';
    }
  } catch (error) {
    healthData.dependencies.ollama = 'unhealthy';
    logger.warn('Ollama health check failed', { 
      requestId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }

  // Check Whisper availability (check if models directory exists or can be created)
  try {
    const fs = require('fs');
    const path = require('path');
    const modelsDir = process.env['WHISPER_MODELS_DIR'] || '/app/models';
    
    // Try to access or create models directory
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }
    
    healthData.dependencies.whisper = 'healthy';
    logger.debug('Whisper health check passed', { requestId });
  } catch (error) {
    healthData.dependencies.whisper = 'unhealthy';
    logger.warn('Whisper health check failed', { 
      requestId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }

  // Determine overall health status
  const dependencyStatuses = Object.values(healthData.dependencies);
  const hasUnhealthyDependencies = dependencyStatuses.includes('unhealthy');
  
  if (hasUnhealthyDependencies) {
    healthData.status = 'degraded';
    res.status(503);
  } else {
    healthData.status = 'healthy';
    res.status(200);
  }

  res.json(healthData);
}));

export default router;
