import { z } from 'zod';

// Video metadata schema
export const VideoMetadataSchema = z.object({
  title: z.string(),
  duration: z.number(),
  thumbnail: z.string().url(),
  description: z.string().optional(),
  uploadDate: z.string().optional(),
  channelName: z.string().optional(),
});

export type VideoMetadata = z.infer<typeof VideoMetadataSchema>;

// Transcription segment schema
export const TranscriptionSegmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

export type TranscriptionSegment = z.infer<typeof TranscriptionSegmentSchema>;

// Transcription result schema
export const TranscriptionResultSchema = z.object({
  text: z.string(),
  segments: z.array(TranscriptionSegmentSchema),
  language: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  processingTime: z.number().optional(),
});

export type TranscriptionResult = z.infer<typeof TranscriptionResultSchema>;

// Enhanced transcription schema
export const EnhancedTranscriptionSchema = z.object({
  originalTranscription: TranscriptionResultSchema,
  enhancedText: z.string(),
  summary: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  topics: z.array(z.string()).optional(),
  sentiment: z.enum(['positive', 'negative', 'neutral']).optional(),
});

export type EnhancedTranscription = z.infer<typeof EnhancedTranscriptionSchema>;

// Processing status enum
export const ProcessingStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled'
]);

export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>;

// Processing step enum
export const ProcessingStepSchema = z.enum([
  'validating_url',
  'extracting_metadata',
  'downloading_audio',
  'transcribing_audio',
  'enhancing_text',
  'generating_summary',
  'extracting_keywords',
  'cleaning_up',
  'completed'
]);

export type ProcessingStep = z.infer<typeof ProcessingStepSchema>;

// Job configuration schema
export const JobConfigSchema = z.object({
  youtubeUrl: z.string().url(),
  options: z.object({
    language: z.string().optional(),
    model: z.string().optional(),
    enhanceText: z.boolean().default(true),
    generateSummary: z.boolean().default(true),
    extractKeywords: z.boolean().default(true),
    maxDuration: z.number().max(3600).optional(), // 1 hour max
  }).optional(),
});

export type JobConfig = z.infer<typeof JobConfigSchema>;

// Export validation functions
export const validateVideoMetadata = (data: unknown): VideoMetadata => {
  return VideoMetadataSchema.parse(data);
};

export const validateTranscriptionResult = (data: unknown): TranscriptionResult => {
  return TranscriptionResultSchema.parse(data);
};

export const validateJobConfig = (data: unknown): JobConfig => {
  return JobConfigSchema.parse(data);
};
