import { createClient } from 'redis';
import axios from 'axios';
import { logger } from '../utils/logger';

export interface TranscriptionJob {
  transcriptionId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  audioPath: string;
  originalFilename?: string;
  language: string;
  model: string;
  format: string;
  includeTimestamps: boolean;
  includeWordTimestamps: boolean;
  progress?: number;
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TranscriptionRequest {
  transcriptionId: string;
  audioPath: string;
  originalFilename?: string;
  language: string;
  model: string;
  format: string;
  includeTimestamps: boolean;
  includeWordTimestamps: boolean;
}

export interface TranscriptionFromJobRequest {
  jobId: string;
  audioPath: string;
  language: string;
  model: string;
  format: string;
  includeTimestamps: boolean;
  includeWordTimestamps: boolean;
}

export interface ListTranscriptionsRequest {
  page: number;
  limit: number;
  status?: string;
}

export class TranscriptionService {
  private redisClient;
  private llmServiceUrl: string;

  constructor() {
    this.redisClient = createClient({
      url: process.env['REDIS_URL'] || 'redis://localhost:6379'
    });
    
    this.llmServiceUrl = process.env['LLM_SERVICE_URL'] || 'http://llm-service:8005';
    
    // Connect to Redis
    this.connectRedis();
  }

  private async connectRedis(): Promise<void> {
    try {
      if (!this.redisClient.isOpen) {
        await this.redisClient.connect();
      }
      logger.info('Connected to Redis for transcription service');
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: (error as Error).message });
    }
  }

  private async updateJobStatus(transcriptionId: string, updates: Partial<TranscriptionJob>): Promise<void> {
    try {
      const jobDataStr = await this.redisClient.get(`transcription_job:${transcriptionId}`);
      if (!jobDataStr) {
        throw new Error('Transcription job not found');
      }

      const jobData = JSON.parse(jobDataStr) as TranscriptionJob;
      const updatedJob = {
        ...jobData,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await this.redisClient.setEx(`transcription_job:${transcriptionId}`, 3600, JSON.stringify(updatedJob));
      
      logger.info('Transcription job status updated', {
        transcriptionId,
        status: updatedJob.status,
        progress: updatedJob.progress
      });
    } catch (error) {
      logger.error('Failed to update transcription job status', {
        transcriptionId,
        error: (error as Error).message
      });
    }
  }

  public async transcribeAudio(request: TranscriptionRequest): Promise<{ message: string }> {
    try {
      // Create job record in Redis
      const jobData: TranscriptionJob = {
        transcriptionId: request.transcriptionId,
        status: 'queued',
        audioPath: request.audioPath,
        originalFilename: request.originalFilename,
        language: request.language,
        model: request.model,
        format: request.format,
        includeTimestamps: request.includeTimestamps,
        includeWordTimestamps: request.includeWordTimestamps,
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await this.redisClient.setEx(
        `transcription_job:${request.transcriptionId}`, 
        3600, 
        JSON.stringify(jobData)
      );

      // Start transcription asynchronously
      this.processTranscription(request).catch((error) => {
        logger.error('Transcription processing failed', {
          error: (error as Error).message,
          transcriptionId: request.transcriptionId
        });
      });

      return { message: 'Transcription job created successfully' };

    } catch (error) {
      logger.error('Failed to create transcription job', {
        error: (error as Error).message,
        transcriptionId: request.transcriptionId
      });
      throw error;
    }
  }

  public async transcribeFromJob(request: TranscriptionFromJobRequest): Promise<{ message: string }> {
    const transcriptionRequest: TranscriptionRequest = {
      transcriptionId: request.jobId,
      audioPath: request.audioPath,
      language: request.language,
      model: request.model,
      format: request.format,
      includeTimestamps: request.includeTimestamps,
      includeWordTimestamps: request.includeWordTimestamps
    };

    return this.transcribeAudio(transcriptionRequest);
  }

  private async processTranscription(request: TranscriptionRequest): Promise<void> {
    try {
      await this.updateJobStatus(request.transcriptionId, { 
        status: 'processing', 
        progress: 10 
      });

      // Call LLM service for transcription
      const response = await axios.post(`${this.llmServiceUrl}/api/transcribe`, {
        audioPath: request.audioPath,
        language: request.language,
        model: request.model,
        format: request.format,
        includeTimestamps: request.includeTimestamps,
        includeWordTimestamps: request.includeWordTimestamps
      }, {
        timeout: 300000, // 5 minutes timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data.success) {
        await this.updateJobStatus(request.transcriptionId, {
          status: 'completed',
          progress: 100,
          result: response.data.result,
          completedAt: new Date().toISOString()
        });

        logger.info('Transcription completed successfully', {
          transcriptionId: request.transcriptionId
        });
      } else {
        throw new Error(response.data.error || 'Transcription failed');
      }

    } catch (error) {
      await this.updateJobStatus(request.transcriptionId, {
        status: 'failed',
        error: (error as Error).message
      });

      logger.error('Transcription processing failed', {
        transcriptionId: request.transcriptionId,
        error: (error as Error).message
      });

      throw error;
    }
  }

  public async getTranscriptionStatus(transcriptionId: string): Promise<TranscriptionJob | null> {
    try {
      const jobDataStr = await this.redisClient.get(`transcription_job:${transcriptionId}`);
      
      if (!jobDataStr) {
        return null;
      }

      return JSON.parse(jobDataStr) as TranscriptionJob;

    } catch (error) {
      logger.error('Failed to get transcription status', {
        transcriptionId,
        error: (error as Error).message
      });
      throw error;
    }
  }

  public async getTranscriptionResult(transcriptionId: string, format?: string): Promise<any> {
    try {
      const job = await this.getTranscriptionStatus(transcriptionId);
      
      if (!job) {
        return null;
      }

      if (job.status !== 'completed') {
        throw new Error('Transcription not completed yet');
      }

      // If format is specified and different from job format, convert
      if (format && format !== job.format) {
        // This would involve format conversion logic
        // For now, return the original result
        logger.warn('Format conversion not implemented', {
          transcriptionId,
          requestedFormat: format,
          jobFormat: job.format
        });
      }

      return {
        transcriptionId,
        status: job.status,
        result: job.result,
        format: job.format,
        originalFilename: job.originalFilename,
        language: job.language,
        model: job.model,
        createdAt: job.createdAt,
        completedAt: job.completedAt
      };

    } catch (error) {
      logger.error('Failed to get transcription result', {
        transcriptionId,
        error: (error as Error).message
      });
      throw error;
    }
  }

  public async listTranscriptions(request: ListTranscriptionsRequest): Promise<{
    transcriptions: TranscriptionJob[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      // This is a simplified implementation
      // In a real system, you'd want to use Redis SCAN or a proper database
      const keys = await this.redisClient.keys('transcription_job:*');
      
      let transcriptions: TranscriptionJob[] = [];
      
      for (const key of keys) {
        const jobDataStr = await this.redisClient.get(key);
        if (jobDataStr) {
          const job = JSON.parse(jobDataStr) as TranscriptionJob;
          if (!request.status || job.status === request.status) {
            transcriptions.push(job);
          }
        }
      }

      // Sort by creation date (newest first)
      transcriptions.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Pagination
      const total = transcriptions.length;
      const totalPages = Math.ceil(total / request.limit);
      const startIndex = (request.page - 1) * request.limit;
      const endIndex = startIndex + request.limit;
      
      transcriptions = transcriptions.slice(startIndex, endIndex);

      return {
        transcriptions,
        pagination: {
          page: request.page,
          limit: request.limit,
          total,
          totalPages
        }
      };

    } catch (error) {
      logger.error('Failed to list transcriptions', {
        error: (error as Error).message
      });
      throw error;
    }
  }
}
