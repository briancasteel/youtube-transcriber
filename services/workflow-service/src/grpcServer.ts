import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { workflowService } from './WorkflowService';
import logger from './utils/logger';
import path from 'path';

// Load proto definition
const PROTO_PATH = path.join(__dirname, '../proto/workflow.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const workflowProto = grpc.loadPackageDefinition(packageDefinition).workflow as any;

// gRPC service implementation
export const grpcServiceImpl = {
  /**
   * Process YouTube video transcription
   */
  async Transcribe(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    const startTime = Date.now();
    const requestId = `grpc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { video_url, options } = call.request;
      
      logger.info('gRPC Transcribe request received', {
        requestId,
        video_url,
        options,
        peer: call.getPeer()
      });

      // Convert gRPC options to internal format
      const internalOptions = options ? {
        language: options.language,
        includeTimestamps: options.include_timestamps,
        enhanceText: options.enhance_text,
        audioQuality: options.audio_quality,
        audioFormat: options.audio_format
      } : {};

      const result = await workflowService.transcribe(video_url, internalOptions);
      
      // Convert internal response to gRPC format
      const grpcResponse = {
        success: result.success,
        error: result.error,
        execution_id: result.executionId,
        data: result.data ? {
          video_id: result.data.videoId,
          title: result.data.title,
          description: result.data.description || '',
          duration: result.data.duration || 0,
          channel: result.data.channel || '',
          captions: result.data.captions?.map((caption: any) => ({
            text: caption.text,
            start_time: caption.startTime,
            end_time: caption.endTime
          })) || [],
          summary: result.data.summary,
          key_points: result.data.keyPoints || []
        } : undefined
      };

      const processingTime = Date.now() - startTime;
      logger.info('gRPC Transcribe completed', {
        requestId,
        success: result.success,
        processingTime
      });

      callback(null, grpcResponse);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      logger.error('gRPC Transcribe failed', {
        requestId,
        error: errorMessage,
        processingTime,
        stack: error instanceof Error ? error.stack : undefined
      });

      const grpcError = new Error(errorMessage);
      (grpcError as any).code = grpc.status.INTERNAL;
      callback(grpcError);
    }
  },

  /**
   * Validate YouTube URL without processing
   */
  async ValidateUrl(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    const requestId = `grpc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { video_url } = call.request;
      
      logger.info('gRPC ValidateUrl request received', {
        requestId,
        video_url,
        peer: call.getPeer()
      });

      const result = await workflowService.validateUrl(video_url);
      
      // Convert internal response to gRPC format
      const grpcResponse = {
        success: result.success,
        error: result.error,
        data: result.data ? {
          video_id: result.data.videoId,
          title: result.data.title,
          duration: result.data.duration || 0,
          channel: result.data.channel || '',
          is_valid: result.data.isValid !== false
        } : undefined
      };

      logger.info('gRPC ValidateUrl completed', {
        requestId,
        success: result.success
      });

      callback(null, grpcResponse);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      logger.error('gRPC ValidateUrl failed', {
        requestId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });

      const grpcError = new Error(errorMessage);
      (grpcError as any).code = grpc.status.INTERNAL;
      callback(grpcError);
    }
  },

  /**
   * Get agent status and available tools
   */
  async GetAgentStatus(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    const requestId = `grpc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.info('gRPC GetAgentStatus request received', {
        requestId,
        peer: call.getPeer()
      });

      const result = await workflowService.getAgentStatus();
      
      // Convert internal response to gRPC format
      const grpcResponse = {
        success: result.success,
        error: result.error,
        data: result.data ? {
          available: result.data.available,
          model: result.data.model,
          tools: result.data.tools || []
        } : undefined
      };

      logger.info('gRPC GetAgentStatus completed', {
        requestId,
        success: result.success
      });

      callback(null, grpcResponse);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      logger.error('gRPC GetAgentStatus failed', {
        requestId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });

      const grpcError = new Error(errorMessage);
      (grpcError as any).code = grpc.status.INTERNAL;
      callback(grpcError);
    }
  },

  /**
   * Get basic health status
   */
  GetHealth(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    const requestId = call.request.request_id || `grpc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.debug('gRPC GetHealth request received', {
        requestId,
        peer: call.getPeer()
      });

      const result = workflowService.getHealth(requestId);
      
      // Convert internal response to gRPC format
      const grpcResponse = {
        success: result.success,
        timestamp: result.timestamp,
        request_id: result.requestId,
        data: {
          status: result.data.status,
          service: result.data.service,
          version: result.data.version,
          uptime: result.data.uptime,
          timestamp: result.data.timestamp
        }
      };

      callback(null, grpcResponse);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      logger.error('gRPC GetHealth failed', {
        requestId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });

      const grpcError = new Error(errorMessage);
      (grpcError as any).code = grpc.status.INTERNAL;
      callback(grpcError);
    }
  },

  /**
   * Get detailed health status
   */
  GetDetailedHealth(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
    const requestId = call.request.request_id || `grpc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.debug('gRPC GetDetailedHealth request received', {
        requestId,
        peer: call.getPeer()
      });

      const result = workflowService.getDetailedHealth(requestId);
      
      // Convert internal response to gRPC format
      const grpcResponse = {
        success: result.success,
        timestamp: result.timestamp,
        request_id: result.requestId,
        data: {
          status: result.data.status,
          service: result.data.service,
          version: result.data.version,
          uptime: result.data.uptime,
          timestamp: result.data.timestamp,
          environment: result.data.environment,
          node_version: result.data.nodeVersion,
          memory: result.data.memory ? {
            used: result.data.memory.used,
            total: result.data.memory.total,
            external: result.data.memory.external,
            rss: result.data.memory.rss
          } : undefined,
          cpu: result.data.cpu ? {
            load_average: result.data.cpu.loadAverage,
            cpu_count: result.data.cpu.cpuCount
          } : undefined,
          dependencies: result.data.dependencies ? {
            video_processor: result.data.dependencies.videoProcessor,
            transcription_service: result.data.dependencies.transcriptionService,
            llm_service: result.data.dependencies.llmService,
            ollama: result.data.dependencies.ollama
          } : undefined
        }
      };

      callback(null, grpcResponse);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      logger.error('gRPC GetDetailedHealth failed', {
        requestId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });

      const grpcError = new Error(errorMessage);
      (grpcError as any).code = grpc.status.INTERNAL;
      callback(grpcError);
    }
  }
};

export { workflowProto };
