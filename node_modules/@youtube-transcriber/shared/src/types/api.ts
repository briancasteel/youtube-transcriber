import { z } from 'zod';
import { ProcessingState, JobQueueItem, ServiceHealth } from './workflow';
import { VideoMetadata, TranscriptionResult, EnhancedTranscription } from './transcription';

// API Response wrapper schema
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  timestamp: z.string(),
  requestId: z.string().optional(),
});

export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  requestId?: string;
};

// Transcription API schemas
export const StartTranscriptionRequestSchema = z.object({
  youtubeUrl: z.string().url(),
  options: z.object({
    language: z.string().optional(),
    model: z.string().optional(),
    enhanceText: z.boolean().default(true),
    generateSummary: z.boolean().default(true),
    extractKeywords: z.boolean().default(true),
    maxDuration: z.number().max(3600).optional(),
  }).optional(),
});

export type StartTranscriptionRequest = z.infer<typeof StartTranscriptionRequestSchema>;

export const StartTranscriptionResponseSchema = z.object({
  jobId: z.string(),
  status: z.enum(['pending', 'processing']),
  estimatedDuration: z.number().optional(),
});

export type StartTranscriptionResponse = z.infer<typeof StartTranscriptionResponseSchema>;

export const GetJobStatusResponseSchema = z.object({
  jobId: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  progress: z.number().min(0).max(100),
  currentStep: z.string(),
  videoMetadata: z.object({
    title: z.string(),
    duration: z.number(),
    thumbnail: z.string().url(),
    description: z.string().optional(),
    uploadDate: z.string().optional(),
    channelName: z.string().optional(),
  }).optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  estimatedCompletion: z.string().optional(),
});

export type GetJobStatusResponse = z.infer<typeof GetJobStatusResponseSchema>;

export const GetTranscriptionResultResponseSchema = z.object({
  jobId: z.string(),
  videoMetadata: z.object({
    title: z.string(),
    duration: z.number(),
    thumbnail: z.string().url(),
    description: z.string().optional(),
    uploadDate: z.string().optional(),
    channelName: z.string().optional(),
  }),
  transcription: z.object({
    text: z.string(),
    segments: z.array(z.object({
      start: z.number(),
      end: z.number(),
      text: z.string(),
      confidence: z.number().min(0).max(1).optional(),
    })),
    language: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    processingTime: z.number().optional(),
  }),
  enhancedText: z.string().optional(),
  summary: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  topics: z.array(z.string()).optional(),
  processingTimeMs: z.number(),
  completedAt: z.string(),
});

export type GetTranscriptionResultResponse = z.infer<typeof GetTranscriptionResultResponseSchema>;

// Video info API schemas
export const GetVideoInfoRequestSchema = z.object({
  url: z.string().url(),
});

export type GetVideoInfoRequest = z.infer<typeof GetVideoInfoRequestSchema>;

export const GetVideoInfoResponseSchema = z.object({
  title: z.string(),
  duration: z.number(),
  thumbnail: z.string().url(),
  description: z.string().optional(),
  uploadDate: z.string().optional(),
  channelName: z.string().optional(),
  isAccessible: z.boolean(),
  estimatedProcessingTime: z.number().optional(),
});

export type GetVideoInfoResponse = z.infer<typeof GetVideoInfoResponseSchema>;

// Health check API schemas
export const HealthCheckResponseSchema = z.object({
  serviceName: z.string(),
  status: z.enum(['healthy', 'unhealthy', 'degraded']),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
  dependencies: z.array(z.object({
    name: z.string(),
    status: z.enum(['healthy', 'unhealthy', 'unknown']),
    responseTime: z.number().optional(),
  })).optional(),
  metrics: z.object({
    memoryUsage: z.number().optional(),
    cpuUsage: z.number().optional(),
    activeJobs: z.number().optional(),
    queueSize: z.number().optional(),
  }).optional(),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

// Error response schema
export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.record(z.any()).optional(),
  timestamp: z.string(),
  requestId: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// Pagination schema
export const PaginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
  total: z.number().optional(),
  totalPages: z.number().optional(),
});

export type Pagination = z.infer<typeof PaginationSchema>;

// List jobs response schema
export const ListJobsResponseSchema = z.object({
  jobs: z.array(z.object({
    jobId: z.string(),
    youtubeUrl: z.string().url(),
    status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
    progress: z.number().min(0).max(100),
    videoTitle: z.string().optional(),
    createdAt: z.string(),
    completedAt: z.string().optional(),
  })),
  pagination: PaginationSchema,
});

export type ListJobsResponse = z.infer<typeof ListJobsResponseSchema>;

// Export validation functions
export const validateStartTranscriptionRequest = (data: unknown): StartTranscriptionRequest => {
  return StartTranscriptionRequestSchema.parse(data);
};

export const validateGetVideoInfoRequest = (data: unknown): GetVideoInfoRequest => {
  return GetVideoInfoRequestSchema.parse(data);
};

export const createApiResponse = <T>(data: T, success: boolean = true, error?: string): ApiResponse<T> => {
  return {
    success,
    data: success ? data : undefined,
    error: error,
    timestamp: new Date().toISOString(),
    requestId: Math.random().toString(36).substring(2, 15),
  };
};

export const createErrorResponse = (error: string, code?: string, details?: Record<string, any>): ErrorResponse => {
  return {
    error,
    code,
    details,
    timestamp: new Date().toISOString(),
    requestId: Math.random().toString(36).substring(2, 15),
  };
};
