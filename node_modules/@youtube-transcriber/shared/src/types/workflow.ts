import { z } from 'zod';
import { 
  VideoMetadata, 
  TranscriptionResult, 
  EnhancedTranscription, 
  ProcessingStatus, 
  ProcessingStep 
} from './transcription';

// Processing state schema for LangGraph workflow
export const ProcessingStateSchema = z.object({
  jobId: z.string(),
  youtubeUrl: z.string().url(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  progress: z.number().min(0).max(100),
  currentStep: z.enum([
    'validating_url',
    'extracting_metadata',
    'downloading_audio',
    'transcribing_audio',
    'enhancing_text',
    'generating_summary',
    'extracting_keywords',
    'cleaning_up',
    'completed'
  ]),
  videoMetadata: z.object({
    title: z.string(),
    duration: z.number(),
    thumbnail: z.string().url(),
    description: z.string().optional(),
    uploadDate: z.string().optional(),
    channelName: z.string().optional(),
  }).optional(),
  audioFileId: z.string().optional(),
  rawTranscription: z.object({
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
  }).optional(),
  enhancedTranscription: z.string().optional(),
  summary: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  topics: z.array(z.string()).optional(),
  error: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().optional(),
  processingTimeMs: z.number().optional(),
});

export type ProcessingState = z.infer<typeof ProcessingStateSchema>;

// Workflow node result schema
export const NodeResultSchema = z.object({
  success: z.boolean(),
  data: z.record(z.any()).optional(),
  error: z.string().optional(),
  nextStep: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
});

export type NodeResult = z.infer<typeof NodeResultSchema>;

// Workflow configuration schema
export const WorkflowConfigSchema = z.object({
  maxRetries: z.number().default(3),
  timeoutMs: z.number().default(300000), // 5 minutes
  enableParallelProcessing: z.boolean().default(false),
  cleanupOnFailure: z.boolean().default(true),
  saveIntermediateResults: z.boolean().default(true),
});

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

// Job priority enum
export const JobPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export type JobPriority = z.infer<typeof JobPrioritySchema>;

// Job queue item schema
export const JobQueueItemSchema = z.object({
  jobId: z.string(),
  priority: JobPrioritySchema.default('normal'),
  youtubeUrl: z.string().url(),
  options: z.object({
    language: z.string().optional(),
    model: z.string().optional(),
    enhanceText: z.boolean().default(true),
    generateSummary: z.boolean().default(true),
    extractKeywords: z.boolean().default(true),
    maxDuration: z.number().max(3600).optional(),
  }).optional(),
  createdAt: z.date(),
  scheduledAt: z.date().optional(),
  attempts: z.number().default(0),
  maxAttempts: z.number().default(3),
});

export type JobQueueItem = z.infer<typeof JobQueueItemSchema>;

// Service health status schema
export const ServiceHealthSchema = z.object({
  serviceName: z.string(),
  status: z.enum(['healthy', 'unhealthy', 'degraded']),
  version: z.string(),
  uptime: z.number(),
  lastCheck: z.date(),
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

export type ServiceHealth = z.infer<typeof ServiceHealthSchema>;

// Export validation functions
export const validateProcessingState = (data: unknown): ProcessingState => {
  return ProcessingStateSchema.parse(data);
};

export const validateNodeResult = (data: unknown): NodeResult => {
  return NodeResultSchema.parse(data);
};

export const validateJobQueueItem = (data: unknown): JobQueueItem => {
  return JobQueueItemSchema.parse(data);
};

export const validateServiceHealth = (data: unknown): ServiceHealth => {
  return ServiceHealthSchema.parse(data);
};
