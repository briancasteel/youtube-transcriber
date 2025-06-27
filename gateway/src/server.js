const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { grpcClient, mapGrpcErrorToHttp } = require('./grpcClient');

const app = express();
const port = process.env.PORT || 8080;

console.log(`Starting API Gateway on port ${port}`);
console.log(`Using gRPC for workflow service communication`);

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


// API routes with rate limiting and gRPC calls
app.post('/api/transcribe', transcriptionLimiter, async (req, res) => {
  try {
    console.log(`gRPC call: Transcribe for ${req.body.videoUrl}`);
    const result = await grpcClient.transcribe(req.body.videoUrl, req.body.options);
    res.json(result);
  } catch (error) {
    console.error('gRPC Transcribe error:', error.message);
    const statusCode = error.httpStatus || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  }
});

app.post('/api/validate', transcriptionLimiter, async (req, res) => {
  try {
    console.log(`gRPC call: ValidateUrl for ${req.body.videoUrl}`);
    const result = await grpcClient.validateUrl(req.body.videoUrl);
    res.json(result);
  } catch (error) {
    console.error('gRPC ValidateUrl error:', error.message);
    const statusCode = error.httpStatus || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  }
});

app.get('/api/agent/status', async (req, res) => {
  try {
    console.log('gRPC call: GetAgentStatus');
    const result = await grpcClient.getAgentStatus();
    res.json(result);
  } catch (error) {
    console.error('gRPC GetAgentStatus error:', error.message);
    const statusCode = error.httpStatus || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  }
});

// Workflow service health check via gRPC
app.get('/api/workflow/health', async (req, res) => {
  try {
    console.log('gRPC call: GetHealth');
    const result = await grpcClient.getHealth(req.requestId);
    res.json(result);
  } catch (error) {
    console.error('gRPC GetHealth error:', error.message);
    const statusCode = error.httpStatus || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  }
});

app.get('/api/workflow/health/detailed', async (req, res) => {
  try {
    console.log('gRPC call: GetDetailedHealth');
    const result = await grpcClient.getDetailedHealth(req.requestId);
    res.json(result);
  } catch (error) {
    console.error('gRPC GetDetailedHealth error:', error.message);
    const statusCode = error.httpStatus || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  }
});

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
  console.log(`Using gRPC for internal communication`);
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
