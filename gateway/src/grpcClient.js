const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load proto definition
const PROTO_PATH = path.join(__dirname, '../proto/workflow.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const workflowProto = grpc.loadPackageDefinition(packageDefinition).workflow;

// Service URLs
const WORKFLOW_SERVICE_GRPC_URL = process.env.WORKFLOW_SERVICE_GRPC_URL || 'workflow-service:50051';

console.log(`Connecting to Workflow Service gRPC: ${WORKFLOW_SERVICE_GRPC_URL}`);

// Create gRPC client
const client = new workflowProto.WorkflowService(
  WORKFLOW_SERVICE_GRPC_URL,
  grpc.credentials.createInsecure()
);

// gRPC error mapping to HTTP status codes
function mapGrpcErrorToHttp(grpcError) {
  switch (grpcError.code) {
    case grpc.status.INVALID_ARGUMENT:
      return 400;
    case grpc.status.NOT_FOUND:
      return 404;
    case grpc.status.DEADLINE_EXCEEDED:
      return 408;
    case grpc.status.ALREADY_EXISTS:
      return 409;
    case grpc.status.PERMISSION_DENIED:
      return 403;
    case grpc.status.RESOURCE_EXHAUSTED:
      return 429;
    case grpc.status.FAILED_PRECONDITION:
      return 400;
    case grpc.status.ABORTED:
      return 409;
    case grpc.status.OUT_OF_RANGE:
      return 400;
    case grpc.status.UNIMPLEMENTED:
      return 501;
    case grpc.status.UNAVAILABLE:
      return 503;
    case grpc.status.DATA_LOSS:
      return 500;
    case grpc.status.UNAUTHENTICATED:
      return 401;
    default:
      return 500;
  }
}

// Promisify gRPC calls for easier async/await usage
function promisifyGrpcCall(method, request) {
  return new Promise((resolve, reject) => {
    method.call(client, request, (error, response) => {
      if (error) {
        error.httpStatus = mapGrpcErrorToHttp(error);
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
}

// Wrapper functions for each gRPC method
const grpcClient = {
  async transcribe(videoUrl, options = {}) {
    const request = {
      video_url: videoUrl,
      options: {
        language: options.language,
        include_timestamps: options.includeTimestamps,
        enhance_text: options.enhanceText,
        audio_quality: options.audioQuality,
        audio_format: options.audioFormat
      }
    };
    
    const response = await promisifyGrpcCall(client.Transcribe, request);
    
    // Convert gRPC response back to HTTP format
    return {
      success: response.success,
      data: response.data ? {
        videoId: response.data.video_id,
        title: response.data.title,
        description: response.data.description,
        duration: response.data.duration,
        channel: response.data.channel,
        captions: response.data.captions?.map(caption => ({
          text: caption.text,
          startTime: caption.start_time,
          endTime: caption.end_time
        })) || [],
        summary: response.data.summary,
        keyPoints: response.data.key_points || []
      } : undefined,
      error: response.error,
      executionId: response.execution_id
    };
  },

  async startTranscriptionJob(videoUrl, options = {}) {
    const request = {
      video_url: videoUrl,
      options: {
        language: options.language,
        include_timestamps: options.includeTimestamps,
        enhance_text: options.enhanceText,
        audio_quality: options.audioQuality,
        audio_format: options.audioFormat
      }
    };
    
    // Debug: Check if the method exists
    console.log('Checking for StartTranscriptionJob method...');
    console.log('client.StartTranscriptionJob:', typeof client.StartTranscriptionJob);
    console.log('Available client methods:', Object.getOwnPropertyNames(client));
    console.log('Available client prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
    
    if (!client.StartTranscriptionJob) {
      throw new Error('StartTranscriptionJob method not found on gRPC client');
    }
    
    const response = await promisifyGrpcCall(client.StartTranscriptionJob, request);
    
    return {
      success: response.success,
      jobId: response.job_id,
      error: response.error
    };
  },

  async getTranscriptionJob(jobId) {
    const request = { job_id: jobId };
    const response = await promisifyGrpcCall(client.GetTranscriptionJob, request);
    
    return {
      success: response.success,
      data: response.data ? {
        jobId: response.data.job_id,
        status: response.data.status,
        progress: response.data.progress,
        startTime: response.data.start_time,
        endTime: response.data.end_time,
        error: response.data.error,
        metadata: response.data.metadata
      } : undefined,
      error: response.error
    };
  },

  async cancelTranscriptionJob(jobId) {
    const request = { job_id: jobId };
    const response = await promisifyGrpcCall(client.CancelTranscriptionJob, request);
    
    return {
      success: response.success,
      error: response.error
    };
  },

  async getTranscriptionResult(jobId) {
    const request = { job_id: jobId };
    const response = await promisifyGrpcCall(client.GetTranscriptionResult, request);
    
    return {
      success: response.success,
      data: response.data ? {
        videoId: response.data.video_id,
        title: response.data.title,
        description: response.data.description,
        duration: response.data.duration,
        channel: response.data.channel,
        captions: response.data.captions?.map(caption => ({
          text: caption.text,
          startTime: caption.start_time,
          endTime: caption.end_time
        })) || [],
        summary: response.data.summary,
        keyPoints: response.data.key_points || [],
        metadata: response.data.metadata
      } : undefined,
      error: response.error
    };
  },

  async validateUrl(videoUrl) {
    const request = { video_url: videoUrl };
    const response = await promisifyGrpcCall(client.ValidateUrl, request);
    
    return {
      success: response.success,
      data: response.data ? {
        videoId: response.data.video_id,
        title: response.data.title,
        duration: response.data.duration,
        channel: response.data.channel,
        isValid: response.data.is_valid
      } : undefined,
      error: response.error
    };
  },

  async getAgentStatus() {
    const request = {};
    const response = await promisifyGrpcCall(client.GetAgentStatus, request);
    
    return {
      success: response.success,
      data: response.data ? {
        available: response.data.available,
        model: response.data.model,
        tools: response.data.tools || []
      } : undefined,
      error: response.error
    };
  },

  async getHealth(requestId) {
    const request = { request_id: requestId };
    const response = await promisifyGrpcCall(client.GetHealth, request);
    
    return {
      success: response.success,
      data: {
        status: response.data.status,
        service: response.data.service,
        version: response.data.version,
        uptime: response.data.uptime,
        timestamp: response.data.timestamp
      },
      timestamp: response.timestamp,
      requestId: response.request_id
    };
  },

  async getDetailedHealth(requestId) {
    const request = { request_id: requestId };
    const response = await promisifyGrpcCall(client.GetDetailedHealth, request);
    
    return {
      success: response.success,
      data: {
        status: response.data.status,
        service: response.data.service,
        version: response.data.version,
        uptime: response.data.uptime,
        timestamp: response.data.timestamp,
        environment: response.data.environment,
        nodeVersion: response.data.node_version,
        memory: response.data.memory ? {
          used: response.data.memory.used,
          total: response.data.memory.total,
          external: response.data.memory.external,
          rss: response.data.memory.rss
        } : undefined,
        cpu: response.data.cpu ? {
          loadAverage: response.data.cpu.load_average,
          cpuCount: response.data.cpu.cpu_count
        } : undefined,
        dependencies: response.data.dependencies ? {
          videoProcessor: response.data.dependencies.video_processor,
          transcriptionService: response.data.dependencies.transcription_service,
          llmService: response.data.dependencies.llm_service,
          ollama: response.data.dependencies.ollama
        } : undefined
      },
      timestamp: response.timestamp,
      requestId: response.request_id
    };
  }
};

// Debug: Log available methods on the client
console.log('Available gRPC client methods:', Object.getOwnPropertyNames(client));
console.log('Client prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)));

// Test connection on startup
client.waitForReady(Date.now() + 5000, (error) => {
  if (error) {
    console.error('Failed to connect to workflow service gRPC:', error.message);
  } else {
    console.log('Successfully connected to workflow service gRPC');
    console.log('Available methods after connection:', Object.getOwnPropertyNames(client));
  }
});

module.exports = { grpcClient, mapGrpcErrorToHttp };
