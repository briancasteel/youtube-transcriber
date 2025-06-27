import { IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import { workflowService } from './WorkflowService';
import logger from './utils/logger';

/**
 * Simple HTTP handler that exposes WorkflowService methods
 * No Express middleware - just pure HTTP handling
 */
export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Set CORS headers (though gateway should handle this)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Request-ID', requestId);

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    const parsedUrl = parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '';
    const method = req.method || 'GET';

    logger.info('HTTP request received', {
      method,
      pathname,
      requestId,
      userAgent: req.headers['user-agent'],
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
    });

    // Route handling
    if (pathname === '/health' && method === 'GET') {
      const result = workflowService.getHealth(requestId);
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/health/detailed' && method === 'GET') {
      const result = workflowService.getDetailedHealth(requestId);
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/transcribe' && method === 'POST') {
      const body = await getRequestBody(req);
      const { videoUrl, options } = JSON.parse(body);
      
      const result = await workflowService.transcribe(videoUrl, options);
      
      // Determine status code based on result
      const statusCode = result.success ? 200 : getErrorStatusCode(result.error || '');
      res.writeHead(statusCode);
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/agent/status' && method === 'GET') {
      const result = await workflowService.getAgentStatus();
      const statusCode = result.success ? 200 : 500;
      res.writeHead(statusCode);
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/validate' && method === 'POST') {
      const body = await getRequestBody(req);
      const { videoUrl } = JSON.parse(body);
      
      const result = await workflowService.validateUrl(videoUrl);
      const statusCode = result.success ? 200 : getErrorStatusCode(result.error || '');
      res.writeHead(statusCode);
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/' && method === 'GET') {
      const result = {
        success: true,
        data: {
          service: 'workflow-service',
          version: process.env['npm_package_version'] || '1.0.0',
          description: 'Workflow orchestration service for YouTube transcription pipeline',
          endpoints: {
            health: '/health',
            healthDetailed: '/health/detailed',
            transcribe: 'POST /api/transcribe',
            validate: 'POST /api/validate',
            agentStatus: 'GET /api/agent/status'
          },
          documentation: 'https://github.com/your-org/youtube-transcriber/blob/main/services/workflow-service/README.md'
        },
        timestamp: new Date().toISOString(),
        requestId
      };
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    // 404 handler
    logger.warn('Route not found', {
      requestId,
      method,
      pathname,
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent']
    });

    const notFoundResult = {
      success: false,
      error: 'Route not found',
      message: `The requested endpoint ${method} ${pathname} does not exist`,
      timestamp: new Date().toISOString(),
      requestId
    };

    res.writeHead(404);
    res.end(JSON.stringify(notFoundResult));

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    logger.error('HTTP request failed', {
      error: errorMessage,
      requestId,
      method: req.method,
      pathname: parse(req.url || '').pathname,
      processingTime,
      stack: error instanceof Error ? error.stack : undefined
    });

    const errorResult = {
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
      requestId
    };

    if (!res.headersSent) {
      res.writeHead(500);
      res.end(JSON.stringify(errorResult));
    }
  }
}

/**
 * Get request body as string
 */
function getRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      resolve(body);
    });
    
    req.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Determine HTTP status code based on error message
 */
function getErrorStatusCode(errorMessage: string): number {
  if (errorMessage.includes('Invalid URL') || errorMessage.includes('validation')) {
    return 400;
  } else if (errorMessage.includes('not found') || errorMessage.includes('unavailable')) {
    return 404;
  } else if (errorMessage.includes('timeout') || errorMessage.includes('rate limit') || errorMessage.includes('Rate limit')) {
    return 429;
  }
  return 500;
}
