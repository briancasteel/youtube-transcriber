export interface VideoInfo {
  title: string;
  description: string;
  duration: number;
  thumbnail: string;
  uploader: string;
  uploadDate: string;
  viewCount: number;
  url: string;
}

export interface ProcessingJob {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
  audioPath?: string;
  originalFilename?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface TranscriptionJob {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  originalFilename?: string;
  whisperOptions?: WhisperOptions;
  enhancementOptions?: TextEnhancementOptions;
  result?: TranscriptionResult;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface WhisperOptions {
  model?: 'tiny' | 'base' | 'small' | 'medium' | 'large';
  language?: string;
  outputFormat?: 'txt' | 'srt' | 'vtt' | 'json';
  includeTimestamps?: boolean;
  includeWordTimestamps?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface TextEnhancementOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  addPunctuation?: boolean;
  fixGrammar?: boolean;
  improveClarity?: boolean;
  generateSummary?: boolean;
  extractKeywords?: boolean;
}

export interface WhisperResult {
  text: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
    words?: Array<{
      start: number;
      end: number;
      word: string;
      probability: number;
    }>;
  }>;
  language?: string;
  duration?: number;
}

export interface EnhancedText {
  originalText: string;
  enhancedText: string;
  summary?: string;
  keywords?: string[];
  improvements: {
    punctuationAdded: boolean;
    grammarFixed: boolean;
    clarityImproved: boolean;
  };
}

export interface TranscriptionResult {
  transcription: WhisperResult;
  enhancement?: EnhancedText;
  processingTime: {
    whisperDuration: number;
    enhancementDuration: number;
    totalDuration: number;
  };
}

export interface WorkflowExecution {
  executionId: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentStep?: string;
  input: Record<string, any>;
  output?: Record<string, any>;
  steps: WorkflowStepExecution[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface WorkflowStepExecution {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  timestamp: string;
  requestId: string;
}

export interface ApiError {
  success: false;
  error: {
    message: string;
    code: string;
    details?: any;
  };
  timestamp: string;
  requestId: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}
