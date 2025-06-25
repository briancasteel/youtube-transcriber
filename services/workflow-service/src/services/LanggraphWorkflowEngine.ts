import { createClient, RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';
import {
  WorkflowExecution,
  WorkflowEvent,
  ServiceEndpoint
} from '../types/workflow';

// Define the state interface for our workflow
export interface WorkflowState {
  executionId: string;
  youtubeUrl: string;
  options: {
    language?: string;
    enhanceText?: boolean;
    generateSummary?: boolean;
    extractKeywords?: boolean;
    quality?: string;
    format?: string;
  };
  videoInfo?: {
    videoId: string;
    title: string;
    description: string;
    lengthSeconds: number;
    author: {
      name: string;
      channelUrl: string;
    };
    thumbnails: any[];
  };
  audioFile?: string;
  transcription?: string;
  enhancedText?: string;
  summary?: string;
  keywords?: string[];
  error?: string;
  currentStep?: string;
  stepResults: Record<string, any>;
  metadata: {
    userId?: string;
    source: string;
    priority: 'low' | 'normal' | 'high';
    tags: string[];
  };
  startTime: string;
  endTime?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
}

// Workflow node definition inspired by Langgraph concepts
interface WorkflowNode {
  id: string;
  name: string;
  execute: (state: WorkflowState) => Promise<Partial<WorkflowState>>;
  shouldContinue: (state: WorkflowState) => string;
  nextNodes: Record<string, string>;
}

export class LanggraphWorkflowEngine {
  private redis: RedisClientType;
  private httpClient: AxiosInstance;
  private serviceEndpoints: Map<string, ServiceEndpoint>;
  private isInitialized: boolean = false;
  private nodes: Map<string, WorkflowNode>;

  constructor() {
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
    this.redis = createClient({ url: redisUrl });
    
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'langgraph-workflow-service/1.0.0'
      }
    });

    this.serviceEndpoints = new Map();
    this.nodes = new Map();
    this.initializeServiceEndpoints();
    this.initializeWorkflowNodes();
  }

  private initializeServiceEndpoints(): void {
    const endpoints: ServiceEndpoint[] = [
      {
        name: 'video-processor',
        baseUrl: process.env['VIDEO_PROCESSOR_URL'] || 'http://video-processor:8002',
        healthEndpoint: '/health',
        timeout: 60000,
        retries: 3
      },
      {
        name: 'transcription-service',
        baseUrl: process.env['TRANSCRIPTION_SERVICE_URL'] || 'http://transcription-service:8003',
        healthEndpoint: '/health',
        timeout: 30000,
        retries: 3
      },
      {
        name: 'llm-service',
        baseUrl: process.env['LLM_SERVICE_URL'] || 'http://llm-service:8005',
        healthEndpoint: '/health',
        timeout: 300000, // 5 minutes for LLM operations
        retries: 2
      }
    ];

    endpoints.forEach(endpoint => {
      this.serviceEndpoints.set(endpoint.name, endpoint);
    });
  }

  private initializeWorkflowNodes(): void {
    // Define workflow nodes using Langgraph-inspired state machine pattern
    const nodes: WorkflowNode[] = [
      {
        id: 'validate_input',
        name: 'Validate Input',
        execute: this.validateInputNode.bind(this),
        shouldContinue: (state) => state.error ? 'error' : 'continue',
        nextNodes: {
          continue: 'get_video_info',
          error: 'handle_error'
        }
      },
      {
        id: 'get_video_info',
        name: 'Get Video Info',
        execute: this.getVideoInfoNode.bind(this),
        shouldContinue: (state) => state.error ? 'error' : 'continue',
        nextNodes: {
          continue: 'process_video',
          error: 'handle_error'
        }
      },
      {
        id: 'process_video',
        name: 'Process Video',
        execute: this.processVideoNode.bind(this),
        shouldContinue: (state) => state.error ? 'error' : 'continue',
        nextNodes: {
          continue: 'transcribe_audio',
          error: 'handle_error'
        }
      },
      {
        id: 'transcribe_audio',
        name: 'Transcribe Audio',
        execute: this.transcribeAudioNode.bind(this),
        shouldContinue: (state) => {
          if (state.error) return 'error';
          const needsEnhancement = state.options.enhanceText || 
                                 state.options.generateSummary || 
                                 state.options.extractKeywords;
          return needsEnhancement ? 'continue' : 'end';
        },
        nextNodes: {
          continue: 'enhance_text',
          end: 'END',
          error: 'handle_error'
        }
      },
      {
        id: 'enhance_text',
        name: 'Enhance Text',
        execute: this.enhanceTextNode.bind(this),
        shouldContinue: () => 'end',
        nextNodes: {
          end: 'END'
        }
      },
      {
        id: 'handle_error',
        name: 'Handle Error',
        execute: this.handleErrorNode.bind(this),
        shouldContinue: () => 'end',
        nextNodes: {
          end: 'END'
        }
      }
    ];

    nodes.forEach(node => {
      this.nodes.set(node.id, node);
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info('Langgraph-inspired workflow engine initialized', {
        redisConnected: true,
        serviceEndpoints: Array.from(this.serviceEndpoints.keys()),
        workflowNodes: Array.from(this.nodes.keys())
      });
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize Langgraph workflow engine', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async executeWorkflow(
    youtubeUrl: string,
    options: WorkflowState['options'] = {},
    metadata: {
      userId?: string;
      source: string;
      priority?: 'low' | 'normal' | 'high';
      tags?: string[];
    }
  ): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Workflow engine not initialized');
    }

    const executionId = uuidv4();
    const initialState: WorkflowState = {
      executionId,
      youtubeUrl,
      options,
      stepResults: {},
      metadata: {
        ...(metadata.userId && { userId: metadata.userId }),
        source: metadata.source,
        priority: metadata.priority || 'normal',
        tags: metadata.tags || []
      },
      startTime: new Date().toISOString(),
      status: 'pending'
    };

    try {
      // Store initial execution state
      await this.storeExecution(this.stateToExecution(initialState));

      // Emit workflow started event
      await this.emitEvent({
        type: 'workflow.started',
        executionId,
        timestamp: new Date().toISOString(),
        data: { youtubeUrl, options }
      });

      // Execute workflow asynchronously using Langgraph-inspired state transitions
      this.executeWorkflowAsync(initialState).catch(error => {
        logger.error('Async workflow execution failed', {
          executionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });

      logger.info('Langgraph-inspired workflow execution started', {
        executionId,
        youtubeUrl
      });

      return executionId;
    } catch (error) {
      logger.error('Failed to start Langgraph workflow execution', {
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async executeWorkflowAsync(state: WorkflowState): Promise<void> {
    const startTime = Date.now();

    try {
      state.status = 'running';
      await this.storeExecution(this.stateToExecution(state));

      // Execute workflow using Langgraph-inspired state machine pattern
      let currentNodeId = 'validate_input';
      
      while (currentNodeId !== 'END') {
        const node = this.nodes.get(currentNodeId);
        if (!node) {
          throw new Error(`Node not found: ${currentNodeId}`);
        }

        logger.info('Executing workflow node (Langgraph-inspired)', {
          executionId: state.executionId,
          nodeId: currentNodeId,
          nodeName: node.name
        });

        // Execute the node
        const nodeResult = await node.execute(state);
        
        // Update state with node results (state transition)
        Object.assign(state, nodeResult);
        
        // Store updated state
        await this.storeExecution(this.stateToExecution(state));

        // Emit step event
        await this.emitEvent({
          type: nodeResult.error ? 'step.failed' : 'step.completed',
          executionId: state.executionId,
          stepId: currentNodeId,
          timestamp: new Date().toISOString(),
          data: { 
            stepName: node.name,
            result: nodeResult,
            error: nodeResult.error
          }
        });

        // Determine next node using conditional logic
        const decision = node.shouldContinue(state);
        currentNodeId = node.nextNodes[decision] || 'END';

        logger.info('Node execution completed (Langgraph-inspired)', {
          executionId: state.executionId,
          nodeId: node.id,
          decision,
          nextNode: currentNodeId,
          hasError: !!state.error
        });
      }

      // Complete workflow
      state.status = 'completed';
      state.endTime = new Date().toISOString();
      const duration = Date.now() - startTime;

      await this.storeExecution(this.stateToExecution(state, duration));

      await this.emitEvent({
        type: 'workflow.completed',
        executionId: state.executionId,
        timestamp: new Date().toISOString(),
        data: { 
          duration,
          transcription: state.transcription,
          summary: state.summary,
          keywords: state.keywords
        }
      });

      logger.info('Langgraph-inspired workflow execution completed', {
        executionId: state.executionId,
        duration,
        completedSteps: Object.keys(state.stepResults).length
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      state.status = 'failed';
      state.endTime = new Date().toISOString();
      state.error = error instanceof Error ? error.message : 'Unknown error';

      await this.storeExecution(this.stateToExecution(state, duration));

      await this.emitEvent({
        type: 'workflow.failed',
        executionId: state.executionId,
        timestamp: new Date().toISOString(),
        data: { 
          error: state.error,
          duration
        }
      });

      logger.error('Langgraph-inspired workflow execution failed', {
        executionId: state.executionId,
        error: state.error
      });
    }
  }

  // Node implementations (Langgraph-inspired state processors)
  private async validateInputNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    logger.info('Validating input (Langgraph node)', { executionId: state.executionId });
    
    try {
      // Basic URL validation
      const url = new URL(state.youtubeUrl);
      if (!url.hostname.includes('youtube.com') && !url.hostname.includes('youtu.be')) {
        throw new Error('Invalid YouTube URL');
      }

      return {
        currentStep: 'validate_input',
        stepResults: {
          ...state.stepResults,
          validate_input: { valid: true, url: state.youtubeUrl }
        }
      };
    } catch (error) {
      return {
        error: `Input validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        currentStep: 'validate_input'
      };
    }
  }

  private async getVideoInfoNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    logger.info('Getting video info (Langgraph node)', { executionId: state.executionId });
    
    try {
      const endpoint = this.serviceEndpoints.get('video-processor');
      if (!endpoint) {
        throw new Error('Video processor service not configured');
      }

      const response = await this.httpClient.get(`${endpoint.baseUrl}/api/video/info`, {
        params: { url: state.youtubeUrl },
        timeout: endpoint.timeout
      });

      const videoInfo = response.data.data;

      return {
        videoInfo,
        currentStep: 'get_video_info',
        stepResults: {
          ...state.stepResults,
          get_video_info: videoInfo
        }
      };
    } catch (error) {
      return {
        error: `Failed to get video info: ${error instanceof Error ? error.message : 'Unknown error'}`,
        currentStep: 'get_video_info'
      };
    }
  }

  private async processVideoNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    logger.info('Processing video (Langgraph node)', { executionId: state.executionId });
    
    try {
      const endpoint = this.serviceEndpoints.get('video-processor');
      if (!endpoint) {
        throw new Error('Video processor service not configured');
      }

      const response = await this.httpClient.post(`${endpoint.baseUrl}/api/video/process`, {
        url: state.youtubeUrl,
        quality: state.options.quality || 'highestaudio',
        format: state.options.format || 'mp3'
      }, {
        timeout: endpoint.timeout
      });

      const jobId = response.data.data.jobId;

      // Poll for completion
      const audioFile = await this.pollVideoProcessing(endpoint.baseUrl, jobId);

      return {
        audioFile,
        currentStep: 'process_video',
        stepResults: {
          ...state.stepResults,
          process_video: { jobId, audioFile }
        }
      };
    } catch (error) {
      return {
        error: `Failed to process video: ${error instanceof Error ? error.message : 'Unknown error'}`,
        currentStep: 'process_video'
      };
    }
  }

  private async transcribeAudioNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    logger.info('Transcribing audio (Langgraph node)', { executionId: state.executionId });
    
    try {
      const endpoint = this.serviceEndpoints.get('transcription-service');
      if (!endpoint) {
        throw new Error('Transcription service not configured');
      }

      const response = await this.httpClient.post(`${endpoint.baseUrl}/api/transcription/transcribe`, {
        audioFile: state.audioFile,
        language: state.options.language || 'en'
      }, {
        timeout: endpoint.timeout
      });

      const transcription = response.data.data.transcription;

      return {
        transcription,
        currentStep: 'transcribe_audio',
        stepResults: {
          ...state.stepResults,
          transcribe_audio: { transcription }
        }
      };
    } catch (error) {
      return {
        error: `Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`,
        currentStep: 'transcribe_audio'
      };
    }
  }

  private async enhanceTextNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    logger.info('Enhancing text (Langgraph node)', { executionId: state.executionId });
    
    try {
      const endpoint = this.serviceEndpoints.get('llm-service');
      if (!endpoint) {
        throw new Error('LLM service not configured');
      }

      const enhancementTasks = [];
      
      // Enhanced text
      if (state.options.enhanceText) {
        enhancementTasks.push(
          this.httpClient.post(`${endpoint.baseUrl}/api/llm/enhance`, {
            text: state.transcription
          }, { timeout: endpoint.timeout })
        );
      }

      // Summary
      if (state.options.generateSummary) {
        enhancementTasks.push(
          this.httpClient.post(`${endpoint.baseUrl}/api/llm/summarize`, {
            text: state.transcription
          }, { timeout: endpoint.timeout })
        );
      }

      // Keywords
      if (state.options.extractKeywords) {
        enhancementTasks.push(
          this.httpClient.post(`${endpoint.baseUrl}/api/llm/keywords`, {
            text: state.transcription
          }, { timeout: endpoint.timeout })
        );
      }

      const results = await Promise.allSettled(enhancementTasks);
      
      let enhancedText = state.transcription || '';
      let summary = '';
      let keywords: string[] = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (index === 0 && state.options.enhanceText) {
            enhancedText = result.value.data.data.enhancedText;
          } else if ((index === 1 && state.options.enhanceText) || (index === 0 && !state.options.enhanceText)) {
            if (state.options.generateSummary) {
              summary = result.value.data.data.summary;
            }
          } else if (state.options.extractKeywords) {
            keywords = result.value.data.data.keywords;
          }
        }
      });

      return {
        enhancedText,
        summary,
        keywords,
        currentStep: 'enhance_text',
        stepResults: {
          ...state.stepResults,
          enhance_text: { enhancedText, summary, keywords }
        }
      };
    } catch (error) {
      return {
        error: `Failed to enhance text: ${error instanceof Error ? error.message : 'Unknown error'}`,
        currentStep: 'enhance_text'
      };
    }
  }

  private async handleErrorNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    logger.error('Handling workflow error (Langgraph node)', { 
      executionId: state.executionId, 
      error: state.error 
    });

    return {
      status: 'failed',
      endTime: new Date().toISOString()
    };
  }

  // Helper methods
  private async pollVideoProcessing(baseUrl: string, jobId: string): Promise<string> {
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await this.httpClient.get(`${baseUrl}/api/video/status/${jobId}`);
        const status = response.data.data.status;

        if (status === 'completed') {
          return response.data.data.audioFile;
        } else if (status === 'failed') {
          throw new Error('Video processing failed');
        }

        // Wait 5 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      } catch (error) {
        if (attempts >= maxAttempts - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      }
    }

    throw new Error('Video processing timeout');
  }

  private stateToExecution(state: WorkflowState, duration?: number): WorkflowExecution {
    const execution: WorkflowExecution = {
      id: state.executionId,
      workflowId: 'youtube-transcription-langgraph',
      status: state.status,
      input: {
        youtubeUrl: state.youtubeUrl,
        options: state.options
      },
      completedSteps: Object.keys(state.stepResults),
      failedSteps: state.error ? [state.currentStep || 'unknown'] : [],
      stepResults: state.stepResults,
      startTime: state.startTime,
      metadata: state.metadata
    };

    // Add optional fields only if they exist
    if (state.currentStep) {
      execution.currentStep = state.currentStep;
    }

    if (state.error) {
      execution.error = state.error;
    }

    if (state.endTime) {
      execution.endTime = state.endTime;
    }

    if (duration !== undefined) {
      execution.duration = duration;
    }

    // Only add output if workflow is completed and has results
    if (state.status === 'completed') {
      execution.output = {
        videoInfo: state.videoInfo,
        transcription: state.transcription,
        enhancedText: state.enhancedText,
        summary: state.summary,
        keywords: state.keywords
      };
    }

    return execution;
  }

  private async storeExecution(execution: WorkflowExecution): Promise<void> {
    try {
      await this.redis.setEx(
        `workflow:execution:${execution.id}`,
        86400, // 24 hours TTL
        JSON.stringify(execution)
      );
    } catch (error) {
      logger.error('Failed to store workflow execution', {
        executionId: execution.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async emitEvent(event: WorkflowEvent): Promise<void> {
    try {
      await this.redis.publish('workflow:events', JSON.stringify(event));
    } catch (error) {
      logger.warn('Failed to emit workflow event', {
        eventType: event.type,
        executionId: event.executionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getExecution(executionId: string): Promise<WorkflowExecution | null> {
    try {
      const data = await this.redis.get(`workflow:execution:${executionId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to get workflow execution', {
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async cancelExecution(executionId: string): Promise<boolean> {
    try {
      const execution = await this.getExecution(executionId);
      if (!execution) {
        return false;
      }

      if (execution.status === 'completed' || execution.status === 'failed') {
        return false; // Cannot cancel completed or failed workflows
      }

      execution.status = 'cancelled';
      execution.endTime = new Date().toISOString();
      execution.error = 'Workflow cancelled by user';

      await this.storeExecution(execution);

      logger.info('Langgraph workflow execution cancelled', { executionId });
      return true;
    } catch (error) {
      logger.error('Failed to cancel Langgraph workflow execution', {
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.redis.isOpen) {
        await this.redis.disconnect();
      }
      logger.info('Langgraph-inspired workflow engine cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup Langgraph workflow engine', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
