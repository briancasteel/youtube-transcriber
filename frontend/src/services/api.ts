import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { TranscriptionJob } from '../types';

// New simplified interfaces based on the YouTube Transcription Agent
export interface TranscriptionOptions {
  language?: string;
  includeTimestamps?: boolean;
  enhanceText?: boolean;
  audioQuality?: string;
  audioFormat?: string;
}

export interface TranscriptionResult {
  videoId: string;
  title: string;
  description: string;
  captions: Array<{
    text: string;
    start?: number;
    duration?: number;
  }>;
  summary?: string;
  keywords?: string[];
  metadata: {
    duration: number;
    language: string;
    processingTime: number;
    enhanced: boolean;
  };
}

export interface ValidationResult {
  valid: boolean;
  videoId: string;
  error?: string;
}

export interface AgentStatus {
  available: boolean;
  model: string;
  tools: string[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  executionId?: string;
}

export interface ApiError {
  success: false;
  error: string;
  timestamp: string;
  requestId?: string;
}

// Legacy interfaces for backward compatibility
export interface VideoInfo {
  videoId: string;
  title: string;
  description: string;
  duration: number;
  thumbnail?: string;
  author?: {
    name: string;
    channelUrl: string;
  };
}

export interface ProcessingJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: any;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// Use the TranscriptionJob from types/index.ts instead

export interface WorkflowExecution {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: any;
  output?: any;
  error?: string;
  startTime: string;
  endTime?: string;
  metadata?: any;
}


export interface TextEnhancementOptions {
  addPunctuation?: boolean;
  fixGrammar?: boolean;
  improveClarity?: boolean;
  generateSummary?: boolean;
  extractKeywords?: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api',
      timeout: 600000, // 10 minutes for transcription requests
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response: AxiosResponse<ApiResponse>) => {
        console.log(`API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('API Response Error:', error);
        if (error.response?.data) {
          return Promise.reject(error.response.data as ApiError);
        }
        return Promise.reject({
          success: false,
          error: error.message || 'Network error',
          timestamp: new Date().toISOString(),
          requestId: 'unknown',
        } as ApiError);
      }
    );
  }

  // New YouTube Transcription Agent API
  async transcribeYouTubeVideo(
    videoUrl: string, 
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const response = await this.client.post<ApiResponse<TranscriptionResult>>(
      '/transcribe',
      {
        videoUrl,
        options
      }
    );
    
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Transcription failed');
    }
    
    return response.data.data;
  }

  async validateYouTubeUrl(videoUrl: string): Promise<ValidationResult> {
    const response = await this.client.post<ApiResponse<ValidationResult>>(
      '/validate',
      { videoUrl }
    );
    
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Validation failed');
    }
    
    return response.data.data;
  }

  async getAgentStatus(): Promise<AgentStatus> {
    const response = await this.client.get<ApiResponse<AgentStatus>>('/agent/status');
    
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get agent status');
    }
    
    return response.data.data;
  }

  // Legacy API methods for backward compatibility
  async getVideoInfo(url: string): Promise<VideoInfo> {
    try {
      // Try to use the validation endpoint to get basic info
      const validation = await this.validateYouTubeUrl(url);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid YouTube URL');
      }
      
      // Return basic info from validation
      return {
        videoId: validation.videoId,
        title: 'YouTube Video', // Placeholder
        description: '',
        duration: 0,
      };
    } catch (error) {
      throw error;
    }
  }

  async processVideo(url: string): Promise<{ jobId: string }> {
    // For backward compatibility, start a transcription and return a job ID
    try {
      const result = await this.transcribeYouTubeVideo(url);
      return { jobId: result.videoId };
    } catch (error) {
      throw error;
    }
  }

  async getVideoProcessingStatus(jobId: string): Promise<ProcessingJob> {
    // Mock implementation for backward compatibility
    return {
      id: jobId,
      status: 'completed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // New job-based workflow API
  async startYouTubeTranscription(
    url: string, 
    enhancementOptions?: TextEnhancementOptions
  ): Promise<{ executionId: string }> {
    const options = {
      language: 'en',
      includeTimestamps: true,
      enhanceText: enhancementOptions?.addPunctuation || 
                   enhancementOptions?.fixGrammar || 
                   enhancementOptions?.improveClarity || false,
      audioQuality: 'high',
      audioFormat: 'mp3'
    };

    const response = await this.client.post<{ success: boolean; jobId?: string; error?: string }>(
      '/transcription/jobs',
      {
        videoUrl: url,
        options
      }
    );

    if (!response.data.success || !response.data.jobId) {
      throw new Error(response.data.error || 'Failed to start transcription job');
    }

    return { executionId: response.data.jobId };
  }

  async getWorkflowExecution(executionId: string): Promise<WorkflowExecution> {
    // Mock implementation for backward compatibility
    return {
      id: executionId,
      status: 'completed',
      input: { videoUrl: `https://youtube.com/watch?v=${executionId}` },
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
    };
  }

  async cancelWorkflowExecution(executionId: string): Promise<void> {
    // Mock implementation - cannot cancel completed transcriptions
    console.warn(`Cannot cancel execution ${executionId} - transcription may already be complete`);
  }

  // New job-based transcription API
  async getTranscriptionJobs(limit = 20, offset = 0): Promise<PaginatedResponse<TranscriptionJob>> {
    // For now, return empty list since we're focusing on single-job workflow
    return {
      items: [],
      pagination: {
        total: 0,
        page: Math.floor(offset / limit) + 1,
        limit,
        hasNext: false,
        hasPrev: offset > 0
      }
    };
  }

  async getTranscriptionJob(jobId: string): Promise<TranscriptionJob> {
    const response = await this.client.get<{ success: boolean; data?: any; error?: string }>(
      `/transcription/jobs/${jobId}`
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get job status');
    }

    const job = response.data.data;
    return {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      error: job.error,
      createdAt: job.startTime,
      updatedAt: job.endTime || job.startTime,
    };
  }

  async getTranscriptionResult(jobId: string): Promise<any> {
    const response = await this.client.get<{ success: boolean; data?: any; error?: string }>(
      `/transcription/jobs/${jobId}/result`
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get job result');
    }

    return response.data.data;
  }

  async cancelTranscriptionJob(jobId: string): Promise<void> {
    const response = await this.client.post<{ success: boolean; error?: string }>(
      `/transcription/jobs/${jobId}/cancel`
    );

    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to cancel job');
    }
  }

  // Health Check
  async checkHealth(): Promise<{ status: string; services: Record<string, boolean> }> {
    try {
      const agentStatus = await this.getAgentStatus();
      return {
        status: agentStatus.available ? 'healthy' : 'unhealthy',
        services: {
          'transcription-agent': agentStatus.available,
          'ollama': agentStatus.available,
          'workflow-service': true
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        services: {
          'transcription-agent': false,
          'ollama': false,
          'workflow-service': false
        }
      };
    }
  }

  // File Upload (legacy - not supported in new system)
  async uploadAudioFile(
    _file: File,
    _enhancementOptions?: TextEnhancementOptions
  ): Promise<{ jobId: string }> {
    throw new Error('Direct audio file upload not supported in new agent system. Please use YouTube URLs.');
  }

  // Utility methods
  isYouTubeUrl(url: string): boolean {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    return youtubeRegex.test(url);
  }

  extractVideoId(url: string): string | null {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  formatProcessingTime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}

export const apiService = new ApiService();
export default apiService;
