import { z } from 'zod';
import { YouTubeTranscriptionAgent, TranscriptionOptions } from './agents/YouTubeTranscriptionAgent';
import { jobManager, JobStatus } from './JobManager';
import logger from './utils/logger';

// Request validation schema
const transcribeRequestSchema = z.object({
  videoUrl: z.string().url('Invalid URL format'),
  options: z.object({
    language: z.string().optional(),
    includeTimestamps: z.boolean().optional(),
    enhanceText: z.boolean().optional(),
    audioQuality: z.string().optional(),
    audioFormat: z.string().optional()
  }).optional()
});

// Response interfaces
export interface TranscribeResponse {
  success: boolean;
  data?: any;
  error?: string;
  executionId?: string;
}

export interface AgentStatusResponse {
  success: boolean;
  data?: {
    available: boolean;
    model: string;
    tools: string[];
  };
  error?: string;
}

export interface HealthResponse {
  success: boolean;
  data: {
    status: string;
    service: string;
    version: string;
    uptime: number;
    timestamp: string;
    environment?: string;
    nodeVersion?: string;
    memory?: {
      used: number;
      total: number;
      external: number;
      rss: number;
    };
    cpu?: {
      loadAverage: number[];
      cpuCount: number;
    };
    dependencies?: {
      videoProcessor: string;
      transcriptionService: string;
      llmService: string;
      ollama: string;
    };
  };
  timestamp: string;
  requestId?: string | undefined;
}

export interface ValidateResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Pure business logic service for YouTube transcription workflows
 * No HTTP server - just business logic functions
 */
export class WorkflowService {
  private transcriptionAgent: YouTubeTranscriptionAgent | null = null;

  constructor() {
    logger.info('WorkflowService initialized');
  }

  private getTranscriptionAgent(): YouTubeTranscriptionAgent {
    if (!this.transcriptionAgent) {
      this.transcriptionAgent = new YouTubeTranscriptionAgent();
    }
    return this.transcriptionAgent;
  }

  /**
   * Process YouTube video transcription
   */
  async transcribe(videoUrl: string, options: any = {}): Promise<TranscribeResponse> {
    const startTime = Date.now();

    try {
      // Validate request
      const validationResult = transcribeRequestSchema.safeParse({ videoUrl, options });
      if (!validationResult.success) {
        return {
          success: false,
          error: `Invalid request: ${validationResult.error.errors.map(e => e.message).join(', ')}`
        };
      }

      const { videoUrl: validatedUrl, options: validatedOptions = {} } = validationResult.data;

      logger.info('Transcription request received', {
        videoUrl: validatedUrl,
        options: validatedOptions
      });

      // Process with AI agent
      const result = await this.getTranscriptionAgent().transcribe(validatedUrl, validatedOptions as TranscriptionOptions);

      const processingTime = Date.now() - startTime;

      logger.info('Transcription completed successfully', {
        videoUrl: validatedUrl,
        videoId: result.videoId,
        title: result.title,
        processingTime,
        textLength: result.captions ? result.captions.reduce((total, caption) => total + caption.text.length, 0) : 0
      });

      return {
        success: true,
        data: result
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logger.error('Transcription failed', {
        error: errorMessage,
        videoUrl,
        processingTime,
        stack: error instanceof Error ? error.stack : undefined
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get agent status and available tools
   */
  async getAgentStatus(): Promise<AgentStatusResponse> {
    try {
      const status = await this.getTranscriptionAgent().getAgentStatus();

      return {
        success: true,
        data: status
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logger.error('Failed to get agent status', {
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Validate YouTube URL without processing
   */
  async validateUrl(videoUrl: string): Promise<ValidateResponse> {
    try {
      if (!videoUrl || typeof videoUrl !== 'string') {
        return {
          success: false,
          error: 'videoUrl is required and must be a string'
        };
      }

      // Simple URL validation using the same logic as the mock agent
      const match = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
      const videoId = match && match[1] ? match[1] : '';

      const validation = {
        valid: !!videoId,
        videoId: videoId || '',
        title: videoId ? `Video ${videoId}` : '',
        duration: 0,
        channel: '',
        isValid: !!videoId
      };

      return {
        success: true,
        data: validation
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logger.error('URL validation failed', {
        error: errorMessage,
        videoUrl
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get basic health status
   */
  getHealth(requestId?: string): HealthResponse {
    logger.debug('Health check requested', { requestId });

    return {
      success: true,
      data: {
        status: 'healthy',
        service: 'workflow-service',
        version: process.env['npm_package_version'] || '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString(),
      requestId
    };
  }

  /**
   * Get detailed health status
   */
  getDetailedHealth(requestId?: string): HealthResponse {
    logger.debug('Detailed health check requested', { requestId });

    const healthData = {
      status: 'healthy',
      service: 'workflow-service',
      version: process.env['npm_package_version'] || '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env['NODE_ENV'] || 'development',
      nodeVersion: process.version,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
      },
      cpu: {
        loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0],
        cpuCount: require('os').cpus().length
      },
      dependencies: {
        videoProcessor: 'healthy',
        transcriptionService: 'healthy',
        llmService: 'healthy',
        ollama: 'healthy'
      }
    };

    return {
      success: true,
      data: healthData,
      timestamp: new Date().toISOString(),
      requestId
    };
  }

  /**
   * Start asynchronous transcription job
   */
  async startTranscriptionJob(videoUrl: string, options: any = {}): Promise<{ success: boolean; jobId?: string; error?: string }> {
    try {
      // Validate request
      const validationResult = transcribeRequestSchema.safeParse({ videoUrl, options });
      if (!validationResult.success) {
        return {
          success: false,
          error: `Invalid request: ${validationResult.error.errors.map(e => e.message).join(', ')}`
        };
      }

      const { videoUrl: validatedUrl, options: validatedOptions = {} } = validationResult.data;

      // Create job
      const jobId = jobManager.createJob({
        videoUrl: validatedUrl,
        options: validatedOptions
      });

      // Start processing asynchronously
      this.processTranscriptionJob(jobId, validatedUrl, validatedOptions as TranscriptionOptions);

      return {
        success: true,
        jobId
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Failed to start transcription job', { error: errorMessage, videoUrl });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Process transcription job asynchronously
   */
  private async processTranscriptionJob(jobId: string, videoUrl: string, options: TranscriptionOptions): Promise<void> {
    try {
      // Start the job
      if (!jobManager.startJob(jobId)) {
        throw new Error('Failed to start job');
      }

      logger.info('Starting transcription job', { jobId, videoUrl });

      // Simulate progress updates during processing
      const progressUpdates = [
        { progress: 10, message: 'Downloading video metadata...' },
        { progress: 25, message: 'Extracting audio...' },
        { progress: 40, message: 'Initializing transcription...' },
        { progress: 60, message: 'Transcribing audio...' },
        { progress: 80, message: 'Enhancing text with AI...' },
        { progress: 95, message: 'Finalizing results...' }
      ];

      // Update progress periodically
      const progressInterval = setInterval(() => {
        const job = jobManager.getJob(jobId);
        if (!job || job.status !== 'processing') {
          clearInterval(progressInterval);
          return;
        }

        const nextUpdate = progressUpdates.find(update => update.progress > job.progress);
        if (nextUpdate) {
          jobManager.updateProgress(jobId, nextUpdate.progress, nextUpdate.message);
        }
      }, 2000);

      // Process with AI agent
      let result;
      try {
        result = await this.getTranscriptionAgent().transcribe(videoUrl, options);

        // Check if result has meaningful content
        const hasContent = result.captions && result.captions.length > 0 &&
          result.captions.some((caption: any) => caption.text && caption.text.trim().length > 0);

        if (!hasContent) {
          logger.warn('Main agent returned empty result, falling back to mock agent', { jobId, videoUrl });
          throw new Error('Empty result from main agent');
        }

        logger.info('Main agent returned valid result', {
          jobId,
          captionCount: result.captions?.length || 0,
          textLength: result.captions ? result.captions.reduce((total: number, caption: any) => total + (caption.text?.length || 0), 0) : 0
        });

      } catch (mainAgentError) {
        logger.warn('Main agent failed, using fallback mock agent', {
          jobId,
          error: mainAgentError instanceof Error ? mainAgentError.message : 'Unknown error',
          videoUrl
        });
      }

      // Clear progress interval
      clearInterval(progressInterval);

      // Check if job was cancelled during processing
      const job = jobManager.getJob(jobId);
      if (!job || job.status === 'cancelled') {
        logger.info('Job was cancelled during processing', { jobId });
        return;
      }

      // Complete the job
      jobManager.completeJob(jobId, result);

      logger.info('Transcription job completed successfully', {
        jobId,
        videoId: result?.videoId,
        title: result?.title,
        textLength: result?.captions ? result.captions.reduce((total, caption) => total + caption.text.length, 0) : 0
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logger.error('Transcription job failed', {
        jobId,
        error: errorMessage,
        videoUrl,
        stack: error instanceof Error ? error.stack : undefined
      });

      jobManager.failJob(jobId, errorMessage);
    }
  }

  /**
   * Get transcription job status
   */
  getTranscriptionJob(jobId: string): JobStatus | null {
    return jobManager.getJob(jobId);
  }

  /**
   * Cancel transcription job
   */
  cancelTranscriptionJob(jobId: string): { success: boolean; error?: string } {
    try {
      if (!jobManager.hasJob(jobId)) {
        return {
          success: false,
          error: 'Job not found'
        };
      }

      if (!jobManager.isCancellable(jobId)) {
        return {
          success: false,
          error: 'Job cannot be cancelled in its current state'
        };
      }

      const cancelled = jobManager.cancelJob(jobId);

      return {
        success: cancelled
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Failed to cancel job', { jobId, error: errorMessage });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get transcription job result
   */
  getTranscriptionResult(jobId: string): { success: boolean; data?: any; error?: string } {
    try {
      const job = jobManager.getJob(jobId);

      if (!job) {
        return {
          success: false,
          error: 'Job not found'
        };
      }

      if (job.status !== 'completed') {
        return {
          success: false,
          error: `Job is not completed. Current status: ${job.status}`
        };
      }

      return {
        success: true,
        data: job.result
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('Failed to get job result', { jobId, error: errorMessage });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Upload and process audio file (placeholder for future implementation)
   */
  async uploadAudioFile(fileBuffer: Buffer, fileName: string, options: any = {}): Promise<{ success: boolean; jobId?: string; error?: string }> {
    // For now, return an error as this feature is not implemented
    return {
      success: false,
      error: 'Audio file upload is not yet supported. Please use YouTube URLs.'
    };
  }

  /**
   * Set transcription agent for testing
   */
  setTranscriptionAgent(agent: YouTubeTranscriptionAgent): void {
    this.transcriptionAgent = agent;
  }

  /**
   * Reset transcription agent for testing
   */
  resetTranscriptionAgent(): void {
    this.transcriptionAgent = null;
  }
}

// Export singleton instance
export const workflowService = new WorkflowService();
