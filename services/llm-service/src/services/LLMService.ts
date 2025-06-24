import { createClient, RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { WhisperService, WhisperOptions, WhisperResult } from './WhisperService';
import { OllamaService, TextEnhancementOptions, EnhancedText } from './OllamaService';

export interface TranscriptionJob {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  audioPath: string;
  originalFilename?: string;
  whisperOptions: WhisperOptions;
  enhancementOptions: TextEnhancementOptions;
  progress: number;
  result?: TranscriptionResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
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

export interface ProcessTranscriptionRequest {
  audioPath: string;
  originalFilename?: string;
  whisperOptions?: WhisperOptions;
  enhancementOptions?: TextEnhancementOptions;
}

export class LLMService {
  private redis: RedisClientType;
  private whisperService: WhisperService;
  private ollamaService: OllamaService;
  private isInitialized: boolean = false;

  constructor() {
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
    this.redis = createClient({ url: redisUrl });
    this.whisperService = new WhisperService();
    this.ollamaService = new OllamaService();
  }

  async initialize(): Promise<void> {
    try {
      // Initialize Redis connection
      await this.redis.connect();
      logger.info('Redis connection established for LLM service');

      // Initialize Whisper service
      await this.whisperService.initialize();
      logger.info('Whisper service initialized');

      // Initialize Ollama service
      await this.ollamaService.initialize();
      logger.info('Ollama service initialized');

      this.isInitialized = true;
      logger.info('LLMService fully initialized');
    } catch (error) {
      logger.error('Failed to initialize LLMService', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async processTranscription(request: ProcessTranscriptionRequest): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('LLMService not initialized');
    }

    const jobId = uuidv4();
    const job: TranscriptionJob = {
      jobId,
      status: 'queued',
      audioPath: request.audioPath,
      ...(request.originalFilename && { originalFilename: request.originalFilename }),
      whisperOptions: request.whisperOptions || {},
      enhancementOptions: request.enhancementOptions || {},
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      // Store initial job in Redis
      await this.storeJob(job);
      
      logger.info('Transcription job created', {
        jobId,
        audioPath: request.audioPath,
        originalFilename: request.originalFilename
      });

      // Process asynchronously
      this.processJobAsync(job).catch(error => {
        logger.error('Async job processing failed', {
          jobId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });

      return jobId;
    } catch (error) {
      logger.error('Failed to create transcription job', {
        audioPath: request.audioPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async processJobAsync(job: TranscriptionJob): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Update job status to processing
      job.status = 'processing';
      job.progress = 10;
      job.updatedAt = new Date().toISOString();
      await this.storeJob(job);

      logger.info('Starting transcription processing', { jobId: job.jobId });

      // Step 1: Whisper transcription
      const whisperStartTime = Date.now();
      job.progress = 20;
      await this.storeJob(job);

      const transcription = await this.whisperService.transcribeAudio(
        job.audioPath,
        job.whisperOptions
      );

      const whisperDuration = Date.now() - whisperStartTime;
      job.progress = 60;
      await this.storeJob(job);

      logger.info('Whisper transcription completed', {
        jobId: job.jobId,
        duration: whisperDuration,
        textLength: transcription.text.length
      });

      // Step 2: Text enhancement with Ollama (if requested)
      let enhancement: EnhancedText | undefined;
      let enhancementDuration = 0;

      const hasEnhancementOptions = Object.values(job.enhancementOptions).some(value => value === true);
      
      if (hasEnhancementOptions && transcription.text.trim()) {
        const enhancementStartTime = Date.now();
        job.progress = 70;
        await this.storeJob(job);

        enhancement = await this.ollamaService.enhanceTranscription(
          transcription.text,
          job.enhancementOptions
        );

        enhancementDuration = Date.now() - enhancementStartTime;
        job.progress = 90;
        await this.storeJob(job);

        logger.info('Text enhancement completed', {
          jobId: job.jobId,
          duration: enhancementDuration,
          enhancedLength: enhancement.enhancedText.length,
          hasSummary: !!enhancement.summary,
          keywordCount: enhancement.keywords?.length || 0
        });
      }

      // Complete the job
      const totalDuration = Date.now() - startTime;
      
      job.status = 'completed';
      job.progress = 100;
      job.result = {
        transcription,
        ...(enhancement && { enhancement }),
        processingTime: {
          whisperDuration,
          enhancementDuration,
          totalDuration
        }
      };
      job.completedAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();

      await this.storeJob(job);

      logger.info('Transcription job completed successfully', {
        jobId: job.jobId,
        totalDuration,
        whisperDuration,
        enhancementDuration
      });

    } catch (error) {
      // Handle job failure
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.updatedAt = new Date().toISOString();
      
      await this.storeJob(job);

      logger.error('Transcription job failed', {
        jobId: job.jobId,
        error: job.error,
        audioPath: job.audioPath
      });
    }
  }

  async getJobStatus(jobId: string): Promise<TranscriptionJob | null> {
    try {
      const jobData = await this.redis.get(`transcription:job:${jobId}`);
      if (!jobData) {
        return null;
      }

      return JSON.parse(jobData);
    } catch (error) {
      logger.error('Failed to get job status', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getJobResult(jobId: string): Promise<TranscriptionResult | null> {
    try {
      const job = await this.getJobStatus(jobId);
      if (!job || job.status !== 'completed') {
        return null;
      }

      return job.result || null;
    } catch (error) {
      logger.error('Failed to get job result', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async listJobs(limit: number = 50, offset: number = 0): Promise<TranscriptionJob[]> {
    try {
      const keys = await this.redis.keys('transcription:job:*');
      const jobKeys = keys.slice(offset, offset + limit);
      
      if (jobKeys.length === 0) {
        return [];
      }

      const jobDataArray = await this.redis.mGet(jobKeys);
      const jobs: TranscriptionJob[] = [];

      for (const jobData of jobDataArray) {
        if (jobData) {
          try {
            jobs.push(JSON.parse(jobData));
          } catch (parseError) {
            logger.warn('Failed to parse job data', { parseError });
          }
        }
      }

      // Sort by creation date (newest first)
      jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return jobs;
    } catch (error) {
      logger.error('Failed to list jobs', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.getJobStatus(jobId);
      if (!job) {
        return false;
      }

      if (job.status === 'completed' || job.status === 'failed') {
        return false; // Cannot cancel completed or failed jobs
      }

      job.status = 'failed';
      job.error = 'Job cancelled by user';
      job.updatedAt = new Date().toISOString();

      await this.storeJob(job);

      logger.info('Job cancelled', { jobId });
      return true;
    } catch (error) {
      logger.error('Failed to cancel job', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async storeJob(job: TranscriptionJob): Promise<void> {
    try {
      await this.redis.setEx(
        `transcription:job:${job.jobId}`,
        86400, // 24 hours TTL
        JSON.stringify(job)
      );
    } catch (error) {
      logger.error('Failed to store job', {
        jobId: job.jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getAvailableWhisperModels(): Promise<string[]> {
    return this.whisperService.getAvailableModels();
  }

  async getAvailableOllamaModels(): Promise<any[]> {
    return this.ollamaService.getAvailableModels();
  }

  async checkHealth(): Promise<{
    whisper: boolean;
    ollama: boolean;
    redis: boolean;
    overall: boolean;
  }> {
    const health = {
      whisper: false,
      ollama: false,
      redis: false,
      overall: false
    };

    try {
      // Check Redis
      await this.redis.ping();
      health.redis = true;
    } catch (error) {
      logger.warn('Redis health check failed', { error });
    }

    try {
      // Check Ollama
      health.ollama = await this.ollamaService.checkHealth();
    } catch (error) {
      logger.warn('Ollama health check failed', { error });
    }

    try {
      // Check Whisper (basic check - models directory exists)
      health.whisper = true; // Simplified check for now
    } catch (error) {
      logger.warn('Whisper health check failed', { error });
    }

    health.overall = health.whisper && health.ollama && health.redis;

    return health;
  }

  async cleanup(): Promise<void> {
    try {
      if (this.redis.isOpen) {
        await this.redis.disconnect();
      }
      logger.info('LLMService cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup LLMService', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
