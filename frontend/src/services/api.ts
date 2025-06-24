import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { 
  ApiResponse, 
  ApiError, 
  VideoInfo, 
  ProcessingJob, 
  TranscriptionJob, 
  WorkflowExecution,
  WhisperOptions,
  TextEnhancementOptions,
  PaginatedResponse
} from '../types';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api',
      timeout: 30000,
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
          error: {
            message: error.message || 'Network error',
            code: 'NETWORK_ERROR',
          },
          timestamp: new Date().toISOString(),
          requestId: 'unknown',
        } as ApiError);
      }
    );
  }

  // Video Processing API
  async getVideoInfo(url: string): Promise<VideoInfo> {
    const response = await this.client.get<ApiResponse<VideoInfo>>('/video/info', {
      params: { url }
    });
    return response.data.data;
  }

  async processVideo(url: string): Promise<{ jobId: string }> {
    const response = await this.client.post<ApiResponse<{ jobId: string }>>('/video/process', {
      url
    });
    return response.data.data;
  }

  async getVideoProcessingStatus(jobId: string): Promise<ProcessingJob> {
    const response = await this.client.get<ApiResponse<ProcessingJob>>(`/video/status/${jobId}`);
    return response.data.data;
  }

  // Workflow API
  async startYouTubeTranscription(
    url: string, 
    whisperOptions?: WhisperOptions,
    enhancementOptions?: TextEnhancementOptions
  ): Promise<{ executionId: string }> {
    const response = await this.client.post<ApiResponse<{ executionId: string }>>(
      '/workflow/youtube-transcription',
      {
        url,
        whisperOptions,
        enhancementOptions
      }
    );
    return response.data.data;
  }

  async getWorkflowExecution(executionId: string): Promise<WorkflowExecution> {
    const response = await this.client.get<ApiResponse<WorkflowExecution>>(
      `/workflow/execution/${executionId}`
    );
    return response.data.data;
  }

  async cancelWorkflowExecution(executionId: string): Promise<void> {
    await this.client.post(`/workflow/execution/${executionId}/cancel`);
  }

  // Transcription API
  async getTranscriptionJobs(limit = 20, offset = 0): Promise<PaginatedResponse<TranscriptionJob>> {
    const response = await this.client.get<ApiResponse<{ jobs: TranscriptionJob[], pagination: any }>>(
      '/llm/jobs',
      { params: { limit, offset } }
    );
    return {
      items: response.data.data.jobs,
      pagination: response.data.data.pagination
    };
  }

  async getTranscriptionJob(jobId: string): Promise<TranscriptionJob> {
    const response = await this.client.get<ApiResponse<TranscriptionJob>>(`/llm/jobs/${jobId}/status`);
    return response.data.data;
  }

  async getTranscriptionResult(jobId: string): Promise<any> {
    const response = await this.client.get<ApiResponse<any>>(`/llm/jobs/${jobId}/result`);
    return response.data.data;
  }

  async cancelTranscriptionJob(jobId: string): Promise<void> {
    await this.client.delete(`/llm/jobs/${jobId}`);
  }

  // Health Check
  async checkHealth(): Promise<{ status: string; services: Record<string, boolean> }> {
    const response = await this.client.get<ApiResponse<any>>('/health/detailed');
    return response.data.data;
  }

  // File Upload
  async uploadAudioFile(
    file: File,
    whisperOptions?: WhisperOptions,
    enhancementOptions?: TextEnhancementOptions
  ): Promise<{ jobId: string }> {
    const formData = new FormData();
    formData.append('audio', file);
    
    if (whisperOptions) {
      formData.append('whisperOptions', JSON.stringify(whisperOptions));
    }
    
    if (enhancementOptions) {
      formData.append('enhancementOptions', JSON.stringify(enhancementOptions));
    }

    const response = await this.client.post<ApiResponse<{ jobId: string }>>(
      '/llm/transcribe',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 60000, // 1 minute for file upload
      }
    );
    return response.data.data;
  }
}

export const apiService = new ApiService();
