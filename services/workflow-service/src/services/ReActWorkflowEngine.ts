import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosInstance } from 'axios';
import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger';
import {
  WorkflowExecution,
  WorkflowEvent,
  ServiceEndpoint
} from '../types/workflow';
import { IntegratedMediaProcessor } from './IntegratedMediaProcessor';

// ReAct-specific types
export interface ReActState {
  executionId: string;
  goal: string;
  context: Record<string, any>;
  reasoningTrace: ReasoningStep[];
  actionHistory: ActionStep[];
  observations: Observation[];
  currentThought?: string;
  nextAction?: PlannedAction;
  status: 'pending' | 'reasoning' | 'acting' | 'observing' | 'completed' | 'failed' | 'cancelled';
  metadata: {
    userId?: string;
    source: string;
    priority: 'low' | 'normal' | 'high';
    tags: string[];
  };
  startTime: string;
  endTime?: string;
  error?: string;
  finalResult?: Record<string, any>;
}

export interface ReasoningStep {
  id: string;
  timestamp: string;
  thought: string;
  reasoning: string;
  decision: string;
  confidence: number; // 0-1 scale
  alternatives?: string[];
}

export interface PlannedAction {
  id: string;
  type: string;
  description: string;
  service: string;
  endpoint: string;
  method: string;
  payload: Record<string, any>;
  expectedOutcome: string;
  fallbackActions?: PlannedAction[];
}

export interface ActionStep {
  id: string;
  timestamp: string;
  action: PlannedAction;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  duration?: number;
  result?: any;
  error?: string;
}

export interface Observation {
  id: string;
  timestamp: string;
  actionId: string;
  observation: string;
  analysis: string;
  impact: 'positive' | 'negative' | 'neutral';
  nextStepSuggestion?: string;
  data?: Record<string, any>;
}

export class ReActWorkflowEngine {
  private redis: RedisClientType;
  private httpClient: AxiosInstance;
  private serviceEndpoints: Map<string, ServiceEndpoint>;
  private isInitialized: boolean = false;
  private reasoningEngine: ReasoningEngine;
  private actionExecutor: ActionExecutor;
  private observationProcessor: ObservationProcessor;
  private mediaProcessor: IntegratedMediaProcessor;

  constructor() {
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
    this.redis = createClient({ url: redisUrl });
    
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'react-workflow-service/1.0.0'
      }
    });

    this.serviceEndpoints = new Map();
    this.mediaProcessor = new IntegratedMediaProcessor();
    this.reasoningEngine = new ReasoningEngine();
    this.actionExecutor = new ActionExecutor(this.httpClient, this.serviceEndpoints, this.mediaProcessor);
    this.observationProcessor = new ObservationProcessor();
    
    this.initializeServiceEndpoints();
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
        timeout: 300000, // Increased timeout for transcription
        retries: 3
      }
    ];

    endpoints.forEach(endpoint => {
      this.serviceEndpoints.set(endpoint.name, endpoint);
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info('ReAct workflow engine initialized', {
        redisConnected: true,
        serviceEndpoints: Array.from(this.serviceEndpoints.keys())
      });
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize ReAct workflow engine', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async executeWorkflow(
    goal: string,
    initialContext: Record<string, any>,
    metadata: {
      userId?: string;
      source: string;
      priority?: 'low' | 'normal' | 'high';
      tags?: string[];
    }
  ): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('ReAct workflow engine not initialized');
    }

    const executionId = uuidv4();
    const initialState: ReActState = {
      executionId,
      goal,
      context: initialContext,
      reasoningTrace: [],
      actionHistory: [],
      observations: [],
      status: 'pending',
      metadata: {
        ...(metadata.userId && { userId: metadata.userId }),
        source: metadata.source,
        priority: metadata.priority || 'normal',
        tags: metadata.tags || []
      },
      startTime: new Date().toISOString()
    };

    try {
      // Store initial state
      await this.storeState(initialState);

      // Emit workflow started event
      await this.emitEvent({
        type: 'workflow.started',
        executionId,
        timestamp: new Date().toISOString(),
        data: { goal, context: initialContext }
      });

      // Start ReAct loop asynchronously
      this.executeReActLoop(initialState).catch(error => {
        logger.error('ReAct workflow execution failed', {
          executionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });

      logger.info('ReAct workflow execution started', {
        executionId,
        goal
      });

      return executionId;
    } catch (error) {
      logger.error('Failed to start ReAct workflow execution', {
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async executeReActLoop(state: ReActState): Promise<void> {
    const startTime = Date.now();
    const maxIterations = 20; // Prevent infinite loops
    let iteration = 0;

    try {
      state.status = 'reasoning';
      await this.storeState(state);

      while (iteration < maxIterations && state.status !== 'completed' && state.status !== 'failed') {
        iteration++;
        
        logger.info('ReAct iteration starting', {
          executionId: state.executionId,
          iteration,
          status: state.status
        });

        // REASONING PHASE
        if (state.status === 'reasoning') {
          const reasoningStep = await this.reasoningEngine.reason(state);
          state.reasoningTrace.push(reasoningStep);
          state.currentThought = reasoningStep.thought;
          
          // Determine next action based on reasoning
          state.nextAction = await this.reasoningEngine.planAction(state, reasoningStep);
          state.status = 'acting';

          await this.storeState(state);
          
          logger.info('Reasoning completed', {
            executionId: state.executionId,
            thought: reasoningStep.thought,
            decision: reasoningStep.decision,
            confidence: reasoningStep.confidence
          });
        }

        // ACTING PHASE
        if (state.status === 'acting' && state.nextAction) {
          const actionStep = await this.actionExecutor.executeAction(state.nextAction, state);
          state.actionHistory.push(actionStep);
          state.status = 'observing';

          await this.storeState(state);

          logger.info('Action executed', {
            executionId: state.executionId,
            actionType: actionStep.action.type,
            status: actionStep.status,
            duration: actionStep.duration
          });
        }

        // OBSERVATION PHASE
        if (state.status === 'observing') {
          const lastAction = state.actionHistory[state.actionHistory.length - 1];
          if (lastAction) {
            const observation = await this.observationProcessor.processObservation(lastAction, state);
            state.observations.push(observation);

            // Determine if goal is achieved or if we need to continue reasoning
            const isGoalAchieved = await this.reasoningEngine.evaluateGoalCompletion(state);
            
            if (isGoalAchieved) {
              state.status = 'completed';
              state.finalResult = await this.buildFinalResult(state);
            } else if (lastAction.status === 'failed' && !lastAction.action.fallbackActions?.length) {
              // No fallback actions available, workflow failed
              state.status = 'failed';
              state.error = `Action failed: ${lastAction.error}`;
            } else {
              // Continue reasoning for next step
              state.status = 'reasoning';
            }

            await this.storeState(state);

            logger.info('Observation processed', {
              executionId: state.executionId,
              observation: observation.observation,
              impact: observation.impact,
              goalAchieved: isGoalAchieved
            });
          }
        }
      }

      // Complete workflow
      if (state.status === 'completed') {
        state.endTime = new Date().toISOString();
        const duration = Date.now() - startTime;

        await this.storeState(state);
        await this.storeExecution(this.stateToExecution(state, duration));

        await this.emitEvent({
          type: 'workflow.completed',
          executionId: state.executionId,
          timestamp: new Date().toISOString(),
          data: { 
            duration,
            iterations: iteration,
            reasoningSteps: state.reasoningTrace.length,
            actions: state.actionHistory.length,
            result: state.finalResult
          }
        });

        logger.info('ReAct workflow completed', {
          executionId: state.executionId,
          duration,
          iterations: iteration,
          reasoningSteps: state.reasoningTrace.length
        });
      } else {
        // Workflow failed or exceeded max iterations
        state.status = 'failed';
        state.endTime = new Date().toISOString();
        state.error = state.error || `Workflow exceeded maximum iterations (${maxIterations})`;
        
        const duration = Date.now() - startTime;
        await this.storeState(state);
        await this.storeExecution(this.stateToExecution(state, duration));

        await this.emitEvent({
          type: 'workflow.failed',
          executionId: state.executionId,
          timestamp: new Date().toISOString(),
          data: { 
            error: state.error,
            duration,
            iterations: iteration
          }
        });

        logger.error('ReAct workflow failed', {
          executionId: state.executionId,
          error: state.error,
          iterations: iteration
        });
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      state.status = 'failed';
      state.endTime = new Date().toISOString();
      state.error = error instanceof Error ? error.message : 'Unknown error';

      await this.storeState(state);
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

      logger.error('ReAct workflow execution failed', {
        executionId: state.executionId,
        error: state.error
      });
    }
  }

  private async buildFinalResult(state: ReActState): Promise<Record<string, any>> {
    // Extract final results from successful actions
    const results: Record<string, any> = {};
    
    state.actionHistory.forEach(action => {
      if (action.status === 'completed' && action.result) {
        results[action.action.type] = action.result;
      }
    });

    return {
      goal: state.goal,
      achieved: true,
      results,
      reasoningSteps: state.reasoningTrace.length,
      actionsExecuted: state.actionHistory.length,
      observations: state.observations.length,
      summary: this.generateWorkflowSummary(state)
    };
  }

  private generateWorkflowSummary(state: ReActState): string {
    const successfulActions = state.actionHistory.filter(a => a.status === 'completed').length;
    const failedActions = state.actionHistory.filter(a => a.status === 'failed').length;
    
    return `Completed workflow "${state.goal}" with ${state.reasoningTrace.length} reasoning steps, ` +
           `${successfulActions} successful actions, and ${failedActions} failed actions.`;
  }

  private stateToExecution(state: ReActState, duration?: number): WorkflowExecution {
    const execution: WorkflowExecution = {
      id: state.executionId,
      workflowId: 'react-workflow',
      status: state.status as any,
      input: {
        goal: state.goal,
        context: state.context
      },
      completedSteps: state.actionHistory.filter(a => a.status === 'completed').map(a => a.id),
      failedSteps: state.actionHistory.filter(a => a.status === 'failed').map(a => a.id),
      stepResults: state.actionHistory.reduce((acc, action) => {
        if (action.result) {
          acc[action.id] = action.result;
        }
        return acc;
      }, {} as Record<string, any>),
      startTime: state.startTime,
      metadata: state.metadata
    };

    if (state.error) {
      execution.error = state.error;
    }

    if (state.endTime) {
      execution.endTime = state.endTime;
    }

    if (duration !== undefined) {
      execution.duration = duration;
    }

    if (state.finalResult) {
      execution.output = state.finalResult;
    }

    return execution;
  }

  private async storeState(state: ReActState): Promise<void> {
    try {
      await this.redis.setEx(
        `react:state:${state.executionId}`,
        86400, // 24 hours TTL
        JSON.stringify(state)
      );
    } catch (error) {
      logger.error('Failed to store ReAct state', {
        executionId: state.executionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
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

  async getState(executionId: string): Promise<ReActState | null> {
    try {
      const data = await this.redis.get(`react:state:${executionId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to get ReAct state', {
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async cancelExecution(executionId: string): Promise<boolean> {
    try {
      const state = await this.getState(executionId);
      if (!state) {
        return false;
      }

      if (state.status === 'completed' || state.status === 'failed') {
        return false;
      }

      state.status = 'cancelled';
      state.endTime = new Date().toISOString();
      state.error = 'Workflow cancelled by user';

      await this.storeState(state);
      await this.storeExecution(this.stateToExecution(state));

      logger.info('ReAct workflow execution cancelled', { executionId });
      return true;
    } catch (error) {
      logger.error('Failed to cancel ReAct workflow execution', {
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
      logger.info('ReAct workflow engine cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup ReAct workflow engine', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Supporting classes for ReAct pattern
class ReasoningEngine {
  async reason(state: ReActState): Promise<ReasoningStep> {
    const reasoningId = uuidv4();
    
    // Analyze current state and determine what to think about
    const context = this.analyzeContext(state);
    const thought = this.generateThought(state, context);
    const reasoning = this.performReasoning(state, thought);
    const decision = this.makeDecision(reasoning, state);
    const confidence = this.calculateConfidence(state, decision);

    return {
      id: reasoningId,
      timestamp: new Date().toISOString(),
      thought,
      reasoning,
      decision,
      confidence,
      alternatives: this.generateAlternatives(state, decision)
    };
  }

  private analyzeContext(state: ReActState): string {
    const completedActions = state.actionHistory.filter(a => a.status === 'completed').length;
    const failedActions = state.actionHistory.filter(a => a.status === 'failed').length;
    const lastObservation = state.observations[state.observations.length - 1];

    return `Goal: ${state.goal}. Progress: ${completedActions} completed actions, ${failedActions} failed actions. ` +
           `Last observation: ${lastObservation?.observation || 'None'}`;
  }

  private generateThought(state: ReActState, context: string): string {
    // Generate contextual thought based on current state
    if (state.actionHistory.length === 0) {
      return `I need to start working towards the goal: ${state.goal}. Let me analyze what needs to be done first.`;
    }

    const lastAction = state.actionHistory[state.actionHistory.length - 1];
    const lastObservation = state.observations[state.observations.length - 1];

    if (lastAction?.status === 'failed') {
      return `The last action failed: ${lastAction.error}. I need to think of an alternative approach or recovery strategy.`;
    }

    if (lastObservation?.impact === 'positive') {
      return `The last action was successful. I should continue building on this progress towards the goal.`;
    }

    return `I need to evaluate the current progress and determine the next best step towards achieving: ${state.goal}`;
  }

  private performReasoning(state: ReActState, thought: string): string {
    // Perform structured reasoning based on the thought
    const availableServices = ['video-processor', 'transcription-service'];
    const completedActionTypes = state.actionHistory
      .filter(a => a.status === 'completed')
      .map(a => a.action.type);

    let reasoning = `Given the thought: "${thought}", I need to consider:\n`;
    reasoning += `1. Available services: ${availableServices.join(', ')}\n`;
    reasoning += `2. Completed actions: ${completedActionTypes.join(', ') || 'None'}\n`;
    reasoning += `3. Goal requirements: ${this.analyzeGoalRequirements(state.goal)}\n`;
    reasoning += `4. Current context: ${JSON.stringify(state.context, null, 2)}`;

    return reasoning;
  }

  private analyzeGoalRequirements(goal: string): string {
    if (goal.toLowerCase().includes('transcribe') && goal.toLowerCase().includes('youtube')) {
      return 'Requires: video processing, audio extraction, transcription, possibly text enhancement';
    }
    return 'General workflow execution';
  }

  private makeDecision(reasoning: string, state: ReActState): string {
    // Make decision based on reasoning and current state
    const goal = state.goal.toLowerCase();
    const completedTypes = state.actionHistory
      .filter(a => a.status === 'completed')
      .map(a => a.action.type);

    if (goal.includes('youtube') && goal.includes('transcribe')) {
      if (!completedTypes.includes('validate_url')) {
        return 'validate_youtube_url';
      } else if (!completedTypes.includes('get_video_info')) {
        return 'get_video_info';
      } else if (!completedTypes.includes('process_video')) {
        return 'process_video';
      } else if (!completedTypes.includes('transcribe_audio')) {
        return 'transcribe_audio';
      } else if (!completedTypes.includes('enhance_text') && state.context.enhanceText) {
        return 'enhance_text';
      } else {
        return 'complete_workflow';
      }
    }

    return 'analyze_requirements';
  }

  private calculateConfidence(state: ReActState, decision: string): number {
    // Calculate confidence based on available information and past success
    let confidence = 0.5; // Base confidence

    // Increase confidence based on successful actions
    const successRate = state.actionHistory.length > 0 
      ? state.actionHistory.filter(a => a.status === 'completed').length / state.actionHistory.length
      : 0.5;

    confidence += successRate * 0.3;

    // Increase confidence if we have clear context
    if (Object.keys(state.context).length > 0) {
      confidence += 0.2;
    }

    return Math.min(confidence, 1.0);
  }

  private generateAlternatives(state: ReActState, decision: string): string[] {
    // Generate alternative decisions
    const alternatives: string[] = [];
    
    if (decision === 'process_video') {
      alternatives.push('get_video_info_first', 'validate_url_again');
    } else if (decision === 'transcribe_audio') {
      alternatives.push('enhance_audio_quality', 'use_different_model');
    }

    return alternatives;
  }

  async planAction(state: ReActState, reasoningStep: ReasoningStep): Promise<PlannedAction> {
    const actionId = uuidv4();
    
    // Plan specific action based on decision
    switch (reasoningStep.decision) {
      case 'validate_youtube_url':
        return {
          id: actionId,
          type: 'validate_url',
          description: 'Validate YouTube URL format and accessibility',
          service: 'video-processor',
          endpoint: '/api/video/validate',
          method: 'POST',
          payload: { url: state.context.youtubeUrl },
          expectedOutcome: 'URL validation result'
        };

      case 'get_video_info':
        return {
          id: actionId,
          type: 'get_video_info',
          description: 'Retrieve video metadata and information',
          service: 'video-processor',
          endpoint: '/api/video/info',
          method: 'GET',
          payload: { url: state.context.youtubeUrl },
          expectedOutcome: 'Video metadata including title, duration, etc.'
        };

      case 'process_video':
        return {
          id: actionId,
          type: 'process_video',
          description: 'Extract audio from YouTube video',
          service: 'video-processor',
          endpoint: '/api/video/process',
          method: 'POST',
          payload: {
            url: state.context.youtubeUrl,
            quality: state.context.quality || 'highestaudio',
            format: state.context.format || 'mp3'
          },
          expectedOutcome: 'Audio file path or job ID'
        };

      case 'transcribe_audio':
        return {
          id: actionId,
          type: 'transcribe_audio',
          description: 'Transcribe audio to text',
          service: 'transcription-service',
          endpoint: '/api/transcription/transcribe',
          method: 'POST',
          payload: {
            audioFile: this.getAudioFileFromState(state),
            language: state.context.language || 'en'
          },
          expectedOutcome: 'Transcribed text'
        };

      case 'enhance_text':
        return {
          id: actionId,
          type: 'enhance_text',
          description: 'Enhance transcribed text with AI',
          service: 'transcription-service',
          endpoint: '/api/transcription/enhance',
          method: 'POST',
          payload: {
            text: this.getTranscriptionFromState(state),
            enhancementOptions: {
              addPunctuation: true,
              fixGrammar: true,
              improveClarity: state.context.enhanceText || false
            }
          },
          expectedOutcome: 'Enhanced and formatted text'
        };

      default:
        return {
          id: actionId,
          type: 'analyze_requirements',
          description: 'Analyze workflow requirements',
          service: 'internal',
          endpoint: '/internal/analyze',
          method: 'POST',
          payload: { goal: state.goal, context: state.context },
          expectedOutcome: 'Requirements analysis'
        };
    }
  }

  private getAudioFileFromState(state: ReActState): string {
    const processVideoAction = state.actionHistory.find(a => a.action.type === 'process_video' && a.status === 'completed');
    return processVideoAction?.result?.audioFile || '';
  }

  private getTranscriptionFromState(state: ReActState): string {
    const transcribeAction = state.actionHistory.find(a => a.action.type === 'transcribe_audio' && a.status === 'completed');
    return transcribeAction?.result?.transcription || '';
  }

  async evaluateGoalCompletion(state: ReActState): Promise<boolean> {
    const goal = state.goal.toLowerCase();
    
    if (goal.includes('transcribe') && goal.includes('youtube')) {
      // Check if we have a transcription
      const hasTranscription = state.actionHistory.some(
        a => a.action.type === 'transcribe_audio' && a.status === 'completed'
      );
      
      // If enhancement was requested, check for that too
      if (state.context.enhanceText) {
        const hasEnhancement = state.actionHistory.some(
          a => a.action.type === 'enhance_text' && a.status === 'completed'
        );
        return hasTranscription && hasEnhancement;
      }
      
      return hasTranscription;
    }

    // For other goals, check if we have any successful actions
    return state.actionHistory.some(a => a.status === 'completed');
  }
}

class ActionExecutor {
  constructor(
    private httpClient: AxiosInstance,
    private serviceEndpoints: Map<string, ServiceEndpoint>,
    private mediaProcessor: IntegratedMediaProcessor
  ) {}

  async executeAction(action: PlannedAction, state: ReActState): Promise<ActionStep> {
    const actionStep: ActionStep = {
      id: action.id,
      timestamp: new Date().toISOString(),
      action,
      status: 'pending',
      startTime: new Date().toISOString()
    };

    try {
      actionStep.status = 'executing';
      
      // Use integrated media processor for all actions
      actionStep.result = await this.executeIntegratedAction(action, state);

      actionStep.status = 'completed';
      actionStep.endTime = new Date().toISOString();
      actionStep.duration = Date.now() - Date.parse(actionStep.startTime);

      logger.info('Action executed successfully', {
        executionId: state.executionId,
        actionId: action.id,
        actionType: action.type,
        duration: actionStep.duration
      });

    } catch (error) {
      actionStep.status = 'failed';
      actionStep.error = error instanceof Error ? error.message : 'Unknown error';
      actionStep.endTime = new Date().toISOString();
      actionStep.duration = Date.now() - Date.parse(actionStep.startTime);

      logger.error('Action execution failed', {
        executionId: state.executionId,
        actionId: action.id,
        actionType: action.type,
        error: actionStep.error
      });
    }

    return actionStep;
  }

  private async executeIntegratedAction(action: PlannedAction, state: ReActState): Promise<any> {
    // Use integrated media processor for all actions
    switch (action.type) {
      case 'validate_url':
        const validation = await this.mediaProcessor.validateYouTubeUrl(action.payload.url);
        return {
          valid: validation.valid,
          url: action.payload.url,
          error: validation.error
        };

      case 'get_video_info':
        const videoInfo = await this.mediaProcessor.getVideoInfo(action.payload.url);
        return {
          data: videoInfo
        };

      case 'process_video':
        const processingResult = await this.mediaProcessor.processVideo(
          action.payload.url,
          action.payload.quality,
          action.payload.format
        );
        return {
          data: {
            audioFile: processingResult.audioFile,
            videoInfo: processingResult.videoInfo,
            duration: processingResult.duration
          }
        };

      case 'transcribe_audio':
        const audioFile = this.getAudioFileFromState(state);
        const transcriptionResult = await this.mediaProcessor.transcribeAudio(audioFile, {
          language: action.payload.language,
          includeTimestamps: action.payload.includeTimestamps || false
        });
        return {
          data: {
            transcription: transcriptionResult.text,
            segments: transcriptionResult.segments,
            language: transcriptionResult.language,
            duration: transcriptionResult.duration
          }
        };

      case 'enhance_text':
        const text = this.getTranscriptionFromState(state);
        const enhancementResult = await this.mediaProcessor.enhanceText(text, action.payload.enhancementOptions);
        return {
          data: {
            enhancedText: enhancementResult.enhancedText,
            summary: enhancementResult.summary,
            keywords: enhancementResult.keywords,
            improvements: enhancementResult.improvements
          }
        };

      case 'analyze_requirements':
        return {
          analysis: `Analyzed goal: ${state.goal}`,
          requirements: this.extractRequirements(state.goal),
          context: state.context
        };

      default:
        return { message: 'Action completed', type: action.type };
    }
  }

  private getAudioFileFromState(state: ReActState): string {
    const processVideoAction = state.actionHistory.find(a => a.action.type === 'process_video' && a.status === 'completed');
    return processVideoAction?.result?.data?.audioFile || '';
  }

  private getTranscriptionFromState(state: ReActState): string {
    const transcribeAction = state.actionHistory.find(a => a.action.type === 'transcribe_audio' && a.status === 'completed');
    return transcribeAction?.result?.data?.transcription || '';
  }

  private async executeInternalAction(action: PlannedAction, state: ReActState): Promise<any> {
    // Handle internal actions that don't require external service calls
    switch (action.type) {
      case 'analyze_requirements':
        return {
          analysis: `Analyzed goal: ${state.goal}`,
          requirements: this.extractRequirements(state.goal),
          context: state.context
        };
      
      case 'validate_url':
        try {
          const url = new URL(action.payload.url);
          const isYouTube = url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be');
          return {
            valid: isYouTube,
            url: action.payload.url,
            platform: isYouTube ? 'youtube' : 'unknown'
          };
        } catch {
          return {
            valid: false,
            url: action.payload.url,
            error: 'Invalid URL format'
          };
        }

      default:
        return { message: 'Internal action completed', type: action.type };
    }
  }

  private extractRequirements(goal: string): string[] {
    const requirements: string[] = [];
    const goalLower = goal.toLowerCase();

    if (goalLower.includes('youtube')) {
      requirements.push('YouTube URL processing');
    }
    if (goalLower.includes('transcribe')) {
      requirements.push('Audio transcription');
    }
    if (goalLower.includes('enhance')) {
      requirements.push('Text enhancement');
    }
    if (goalLower.includes('summary')) {
      requirements.push('Text summarization');
    }

    return requirements;
  }
}

class ObservationProcessor {
  async processObservation(actionStep: ActionStep, state: ReActState): Promise<Observation> {
    const observationId = uuidv4();
    
    // Analyze the action result and create an observation
    const observation = this.generateObservation(actionStep);
    const analysis = this.analyzeActionResult(actionStep, state);
    const impact = this.determineImpact(actionStep);
    const nextStepSuggestion = this.suggestNextStep(actionStep, state);

    const observationResult: Observation = {
      id: observationId,
      timestamp: new Date().toISOString(),
      actionId: actionStep.id,
      observation,
      analysis,
      impact,
      data: actionStep.result
    };

    if (nextStepSuggestion) {
      observationResult.nextStepSuggestion = nextStepSuggestion;
    }

    return observationResult;
  }

  private generateObservation(actionStep: ActionStep): string {
    if (actionStep.status === 'completed') {
      switch (actionStep.action.type) {
        case 'validate_url':
          return `URL validation completed. Result: ${actionStep.result?.valid ? 'Valid' : 'Invalid'}`;
        
        case 'get_video_info':
          return `Video information retrieved. Title: ${actionStep.result?.data?.title || 'Unknown'}`;
        
        case 'process_video':
          return `Video processing completed. Audio file: ${actionStep.result?.data?.audioFile || 'Generated'}`;
        
        case 'transcribe_audio':
          return `Audio transcription completed. Length: ${actionStep.result?.data?.transcription?.length || 0} characters`;
        
        case 'enhance_text':
          return `Text enhancement completed. Enhanced text available.`;
        
        default:
          return `Action ${actionStep.action.type} completed successfully`;
      }
    } else if (actionStep.status === 'failed') {
      return `Action ${actionStep.action.type} failed: ${actionStep.error}`;
    }

    return `Action ${actionStep.action.type} status: ${actionStep.status}`;
  }

  private analyzeActionResult(actionStep: ActionStep, state: ReActState): string {
    let analysis = `Action "${actionStep.action.type}" took ${actionStep.duration}ms to complete. `;
    
    if (actionStep.status === 'completed') {
      analysis += 'The action was successful and produced the expected outcome. ';
      
      // Add specific analysis based on action type
      switch (actionStep.action.type) {
        case 'validate_url':
          analysis += actionStep.result?.valid 
            ? 'The URL is valid and can be processed.' 
            : 'The URL is invalid and needs correction.';
          break;
        
        case 'process_video':
          analysis += 'Audio extraction was successful and the file is ready for transcription.';
          break;
        
        case 'transcribe_audio':
          const transcriptionLength = actionStep.result?.data?.transcription?.length || 0;
          analysis += `Transcription produced ${transcriptionLength} characters of text.`;
          break;
      }
    } else {
      analysis += `The action failed with error: ${actionStep.error}. This may require a different approach or retry.`;
    }

    return analysis;
  }

  private determineImpact(actionStep: ActionStep): 'positive' | 'negative' | 'neutral' {
    if (actionStep.status === 'completed') {
      return 'positive';
    } else if (actionStep.status === 'failed') {
      return 'negative';
    }
    return 'neutral';
  }

  private suggestNextStep(actionStep: ActionStep, state: ReActState): string | undefined {
    if (actionStep.status === 'failed') {
      return `Consider retrying the action or using an alternative approach for ${actionStep.action.type}`;
    }

    if (actionStep.status === 'completed') {
      const goal = state.goal.toLowerCase();
      
      if (goal.includes('transcribe') && goal.includes('youtube')) {
        switch (actionStep.action.type) {
          case 'validate_url':
            return 'Proceed to get video information';
          case 'get_video_info':
            return 'Process the video to extract audio';
          case 'process_video':
            return 'Transcribe the extracted audio';
          case 'transcribe_audio':
            return state.context.enhanceText ? 'Enhance the transcribed text' : 'Workflow complete';
          case 'enhance_text':
            return 'Workflow complete';
        }
      }
    }

    return undefined;
  }
}
