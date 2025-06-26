const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 8080;

// Service URLs
const WORKFLOW_SERVICE_URL = process.env.WORKFLOW_SERVICE_URL || 'http://workflow-service:8004';

console.log(`Starting API Gateway on port ${port}`);
console.log(`Workflow Service URL: ${WORKFLOW_SERVICE_URL}`);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

// Compression and parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined'));

// Rate limiting
const createRateLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false,
});

// Different rate limits for different endpoints
const transcriptionLimiter = createRateLimiter(15 * 60 * 1000, 100, 'Too many transcription requests');
const workflowLimiter = createRateLimiter(15 * 60 * 1000, 50, 'Too many workflow requests');
const videoLimiter = createRateLimiter(15 * 60 * 1000, 30, 'Too many video requests');

// Request ID middleware
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// Proxy configuration
const proxyOptions = {
  target: WORKFLOW_SERVICE_URL,
  changeOrigin: true,
  timeout: 120000, // 2 minutes for workflow requests
  proxyTimeout: 120000, // 2 minutes for workflow requests
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('X-Request-ID', req.requestId);
    console.log(`Proxying ${req.method} ${req.url} to ${WORKFLOW_SERVICE_URL}${req.url}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`Proxy response: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
  },
  onError: (err, req, res) => {
    console.error(`Proxy error for ${req.method} ${req.url}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        error: 'Bad Gateway - Service unavailable',
        code: 'PROXY_ERROR',
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });
    }
  }
};

// Health check endpoint (direct response)
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'YouTube Transcriber API Gateway',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    },
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
});

// API Health check endpoint (direct response)
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'YouTube Transcriber API Gateway',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    },
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'YouTube Transcriber API Gateway',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      transcribe: '/api/transcribe',
      validate: '/api/validate',
      agentStatus: '/api/agent/status'
    }
  });
});


// API routes with rate limiting and proxying
// Note: Order matters - more specific routes must come first
app.use('/api/transcribe*', transcriptionLimiter, createProxyMiddleware(proxyOptions));
app.use('/api/validate*', transcriptionLimiter, createProxyMiddleware(proxyOptions));
app.use('/api/agent*', createProxyMiddleware(proxyOptions));

// Catch-all for other API routes
app.use('/api/*', createProxyMiddleware(proxyOptions));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Gateway error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
});

// Start server
const server = app.listen(port, () => {
  console.log(`API Gateway started on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Proxying to: ${WORKFLOW_SERVICE_URL}`);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`${signal} received, shutting down gracefully`);
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

module.exports = app;
