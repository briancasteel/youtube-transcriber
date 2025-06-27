import { z } from 'zod';
import { YouTubeTranscriptionAgent, TranscriptionOptions } from './agents/YouTubeTranscriptionAgent';
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
        textLength: result.captions.reduce((total, caption) => total + caption.text.length, 0)
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

      // Use the agent's validator tool directly
      const agent = this.getTranscriptionAgent();
      const validation = await (agent as any).tools[0].func({ videoUrl });

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
