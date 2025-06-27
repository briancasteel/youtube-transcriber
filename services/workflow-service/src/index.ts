import * as grpc from '@grpc/grpc-js';
import { grpcServiceImpl, workflowProto } from './grpcServer';
import logger from './utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const GRPC_PORT = process.env['GRPC_PORT'] || 50051;
const HTTP_PORT = process.env['HTTP_PORT'] || 8004; // Keep HTTP for backward compatibility

// Create gRPC server
const grpcServer = new grpc.Server();
grpcServer.addService(workflowProto.WorkflowService.service, grpcServiceImpl);

// Start gRPC server
grpcServer.bindAsync(`0.0.0.0:${GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    logger.error('Failed to start gRPC server', {
      error: err.message,
      port: GRPC_PORT
    });
    process.exit(1);
  }
  
  logger.info('Workflow service started', {
    grpcPort: port,
    httpPort: HTTP_PORT,
    environment: process.env['NODE_ENV'] || 'development',
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
    architecture: 'gRPC server with HTTP fallback'
  });
  
  grpcServer.start();
});

// Keep HTTP server for backward compatibility during transition
import { createServer } from 'http';
import { handleRequest } from './httpHandler';

const httpServer = createServer(handleRequest);
httpServer.listen(HTTP_PORT, () => {
  logger.info('HTTP fallback server started', {
    port: HTTP_PORT,
    note: 'For backward compatibility during gRPC transition'
  });
});

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  // Close gRPC server
  grpcServer.tryShutdown((err) => {
    if (err) {
      logger.error('Error during gRPC server shutdown', {
        error: err.message,
        signal
      });
      grpcServer.forceShutdown();
    } else {
      logger.info('gRPC server closed successfully', { signal });
    }
  });

  // Close HTTP server
  httpServer.close((err) => {
    if (err) {
      logger.error('Error during HTTP server shutdown', {
        error: err.message,
        signal
      });
    } else {
      logger.info('HTTP server closed successfully', { signal });
    }
    
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout', { signal });
    grpcServer.forceShutdown();
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise.toString()
  });
  process.exit(1);
});

export { grpcServer, httpServer };
