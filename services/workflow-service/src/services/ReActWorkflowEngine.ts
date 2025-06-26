import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosInstance } from 'axios';
import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import {
  WorkflowExecution,
  WorkflowEvent,
  ServiceEndpoint
} from '../types/workflow';
import { IntegratedMediaProcessor } from './IntegratedMediaProcessor';

// State interfaces
export interface ReasoningStep {
  id: string;
  timestamp: string;
  thought: string;
  reasoning: string;
  decision: string;
  confidence: number;
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

// LangGraph State using Annotation
const WorkflowState = Annotation.Root({
  executionId: Annotation<string>(),
  goal: Annotation<string>(),
  context: Annotation<Record<string, any>>(),
  reasoningTrace: Annotation<ReasoningStep[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  actionHistory: Annotation<ActionStep[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  observations: Annotation<Observation[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  currentThought: Annotation<string | undefined>(),
  nextAction: Annotation<PlannedAction | undefined>(),
  status: Annotation<'pending' | 'reasoning' | 'acting' | 'observing' | 'completed' | 'failed' | 'cancelled'>(),
  metadata: Annotation<{
    userId?: string;
    source: string;
    priority: 'low' | 'normal' | 'high';
    tags: string[];
  }>(),
  startTime: Annotation<string>(),
  endTime: Annotation<string | undefined>(),
  error: Annotation<string | undefined>(),
  finalResult: Annotation<Record<string, any> | undefined>(),
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  iteration: Annotation<number>({
    reducer: (x, y) => y ?? x + 1,
    default: () => 0
  })
});

type WorkflowStateType = typeof WorkflowState.State;

export class ReActWorkflowEngine {
  private httpClient: AxiosInstance;
  private serviceEndpoints: Map<string, ServiceEndpoint>;
  private isInitialized: boolean = false;
  private mediaProcessor: IntegratedMediaProcessor;
  private memorySaver: MemorySaver;
  private compiledGraph: any;

  constructor() {
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'react-workflow-service/1.0.0'
      }
    });

    this.serviceEndpoints = new Map();
    this.mediaProcessor = new IntegratedMediaProcessor();
    this.memorySaver = new MemorySaver();
    
    this.initializeServiceEndpoints();
    this.initializeLangGraph();
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
        timeout: 300000,
        retries: 3
      }
    ];

    endpoints.forEach(endpoint => {
      this.serviceEndpoints.set(endpoint.name, endpoint);
    });
  }

  private initializeLangGraph(): void {
    // Create the workflow graph
    const workflowGraph = new StateGraph(WorkflowState)
      .addNode('reasoning', this.reasoningNode.bind(this))
      .addNode('acting', this.actingNode.bind(this))
      .addNode('observing', this.observingNode.bind(this))
      .addNode('completed', this.completedNode.bind(this))
      .addNode('failed', this.failedNode.bind(this))
      .addEdge(START, 'reasoning')
      .addEdge('reasoning', 'acting')
      .addEdge('acting', 'observing')
      .addConditionalEdges(
        'observing',
        this.shouldContinue.bind(this),
        {
          'reasoning': 'reasoning',
          'completed': 'completed',
          'failed': 'failed'
        }
      )
      .addEdge('completed', END)
      .addEdge('failed', END);

    // Compile the graph
    this.compiledGraph = workflowGraph.compile({
      checkpointer: this.memorySaver
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('ReAct workflow engine initialized with LangGraph', {
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
    const initialState: WorkflowStateType = {
      executionId,
      goal,
      context: initialContext,
      reasoningTrace: [],
      actionHistory: [],
      observations: [],
      currentThought: undefined,
      nextAction: undefined,
      status: 'pending',
      metadata: {
        ...(metadata.userId && { userId: metadata.userId }),
        source: metadata.source,
        priority: metadata.priority || 'normal',
        tags: metadata.tags || []
      },
      startTime: new Date().toISOString(),
      endTime: undefined,
      error: undefined,
      finalResult: undefined,
      messages: [],
      iteration: 0
    };

    try {
      // Emit workflow started event
      await this.emitEvent({
        type: 'workflow.started',
        executionId,
        timestamp: new Date().toISOString(),
        data: { goal, context: initialContext }
      });

      // Start the workflow execution asynchronously
      this.executeWorkflowGraph(initialState, executionId).catch(error => {
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

  private async executeWorkflowGraph(initialState: WorkflowStateType, executionId: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const config = {
        configurable: {
          thread_id: executionId
        }
      };

      // Execute the workflow graph
      const result = await this.compiledGraph.invoke(initialState, config);

      const duration = Date.now() - startTime;

      if (result.status === 'completed') {
        await this.emitEvent({
          type: 'workflow.completed',
          executionId,
          timestamp: new Date().toISOString(),
          data: { 
            duration,
            iterations: result.iteration,
            reasoningSteps: result.reasoningTrace.length,
            actions: result.actionHistory.length,
            result: result.finalResult
          }
        });

        logger.info('ReAct workflow completed', {
          executionId,
          duration,
          iterations: result.iteration,
          reasoningSteps: result.reasoningTrace.length
        });
      } else {
        await this.emitEvent({
          type: 'workflow.failed',
          executionId,
          timestamp: new Date().toISOString(),
          data: { 
            error: result.error,
            duration,
            iterations: result.iteration
          }
        });

        logger.error('ReAct workflow failed', {
          executionId,
          error: result.error,
          iterations: result.iteration
        });
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      
      await this.emitEvent({
        type: 'workflow.failed',
        executionId,
        timestamp: new Date().toISOString(),
        data: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          duration
        }
      });

      logger.error('ReAct workflow execution failed', {
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // LangGraph Node Functions
  private async reasoningNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
    const reasoningStep = await this.performReasoning(state);
    const nextAction = await this.planAction(state, reasoningStep);

    return {
      reasoningTrace: [reasoningStep],
      currentThought: reasoningStep.thought,
      nextAction,
      status: 'acting',
      iteration: state.iteration + 1
    };
  }

  private async actingNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
    if (!state.nextAction) {
      return {
        status: 'failed',
        error: 'No action planned'
      };
    }

    const actionStep = await this.executeAction(state.nextAction, state);

    return {
      actionHistory: [actionStep],
      status: 'observing'
    };
  }

  private async observingNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
    const lastAction = state.actionHistory[state.actionHistory.length - 1];
    if (!lastAction) {
      return {
        status: 'failed',
        error: 'No action to observe'
      };
    }

    const observation = await this.processObservation(lastAction, state);

    return {
      observations: [observation]
    };
  }

  private async completedNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
    const finalResult = await this.buildFinalResult(state);

    return {
      status: 'completed',
      endTime: new Date().toISOString(),
      finalResult
    };
  }

  private async failedNode(state: WorkflowStateType): Promise<Partial<WorkflowStateType>> {
    return {
      status: 'failed',
      endTime: new Date().toISOString()
    };
  }

  private shouldContinue(state: WorkflowStateType): string {
    const maxIterations = 20;
    
    if (state.iteration >= maxIterations) {
      return 'failed';
    }

    // Check if goal is achieved
    const isGoalAchieved = this.evaluateGoalCompletion(state);
    if (isGoalAchieved) {
      return 'completed';
    }

    const lastAction = state.actionHistory[state.actionHistory.length - 1];
    if (lastAction?.status === 'failed' && !lastAction.action.fallbackActions?.length) {
      return 'failed';
    }

    return 'reasoning';
  }

  // Helper methods
  private async performReasoning(state: WorkflowStateType): Promise<ReasoningStep> {
    const reasoningId = uuidv4();
    
    const context = this.analyzeContext(state);
    const thought = this.generateThought(state, context);
    const reasoning = this.performReasoningLogic(state, thought);
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

  private analyzeContext(state: WorkflowStateType): string {
    const completedActions = state.actionHistory.filter(a => a.status === 'completed').length;
    const failedActions = state.actionHistory.filter(a => a.status === 'failed').length;
    const lastObservation = state.observations[state.observations.length - 1];

    return `Goal: ${state.goal}. Progress: ${completedActions} completed actions, ${failedActions} failed actions. ` +
           `Last observation: ${lastObservation?.observation || 'None'}`;
  }

  private generateThought(state: WorkflowStateType, context: string): string {
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

  private performReasoningLogic(state: WorkflowStateType, thought: string): string {
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

  private makeDecision(reasoning: string, state: WorkflowStateType): string {
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

  private calculateConfidence(state: WorkflowStateType, decision: string): number {
    let confidence = 0.5; // Base confidence

    const successRate = state.actionHistory.length > 0 
      ? state.actionHistory.filter(a => a.status === 'completed').length / state.actionHistory.length
      : 0.5;

    confidence += successRate * 0.3;

    if (Object.keys(state.context).length > 0) {
      confidence += 0.2;
    }

    return Math.min(confidence, 1.0);
  }

  private generateAlternatives(state: WorkflowStateType, decision: string): string[] {
    const alternatives: string[] = [];
    
    if (decision === 'process_video') {
      alternatives.push('get_video_info_first', 'validate_url_again');
    } else if (decision === 'transcribe_audio') {
      alternatives.push('enhance_audio_quality', 'use_different_model');
    }

    return alternatives;
  }

  private async planAction(state: WorkflowStateType, reasoningStep: ReasoningStep): Promise<PlannedAction> {
    const actionId = uuidv4();
    
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

  private async executeAction(action: PlannedAction, state: WorkflowStateType): Promise<ActionStep> {
    const actionStep: ActionStep = {
      id: action.id,
      timestamp: new Date().toISOString(),
      action,
      status: 'pending',
      startTime: new Date().toISOString()
    };

    try {
      actionStep.status = 'executing';
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

  private async executeIntegratedAction(action: PlannedAction, state: WorkflowStateType): Promise<any> {
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
        return { data: videoInfo };

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

  private async processObservation(actionStep: ActionStep, state: WorkflowStateType): Promise<Observation> {
    const observationId = uuidv4();
    
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

  private analyzeActionResult(actionStep: ActionStep, state: WorkflowStateType): string {
    let analysis = `Action "${actionStep.action.type}" took ${actionStep.duration}ms to complete. `;
    
    if (actionStep.status === 'completed') {
      analysis += 'The action was successful and produced the expected outcome. ';
      
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

  private suggestNextStep(actionStep: ActionStep, state: WorkflowStateType): string | undefined {
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

  private evaluateGoalCompletion(state: WorkflowStateType): boolean {
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

  private async buildFinalResult(state: WorkflowStateType): Promise<Record<string, any>> {
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

  private generateWorkflowSummary(state: WorkflowStateType): string {
    const successfulActions = state.actionHistory.filter(a => a.status === 'completed');
    const failedActions = state.actionHistory.filter(a => a.status === 'failed');
    
    return `Workflow completed with ${successfulActions.length} successful actions and ${failedActions.length} failed actions. ` +
           `Total reasoning steps: ${state.reasoningTrace.length}. Goal: ${state.goal}`;
  }

  // Missing helper methods
  private async emitEvent(event: WorkflowEvent): Promise<void> {
    // Simple event logging for now - could be extended to use event bus
    logger.info('Workflow event emitted', {
      type: event.type,
      executionId: event.executionId,
      timestamp: event.timestamp,
      data: event.data
    });
  }

  private getAudioFileFromState(state: WorkflowStateType): string {
    // Extract audio file path from previous process_video action
    const processVideoAction = state.actionHistory.find(
      a => a.action.type === 'process_video' && a.status === 'completed'
    );
    
    return processVideoAction?.result?.data?.audioFile || '';
  }

  private getTranscriptionFromState(state: WorkflowStateType): string {
    // Extract transcription text from previous transcribe_audio action
    const transcribeAction = state.actionHistory.find(
      a => a.action.type === 'transcribe_audio' && a.status === 'completed'
    );
    
    return transcribeAction?.result?.data?.transcription || '';
  }

  private extractRequirements(goal: string): string[] {
    const requirements: string[] = [];
    const lowerGoal = goal.toLowerCase();
    
    if (lowerGoal.includes('youtube')) {
      requirements.push('YouTube URL validation');
    }
    if (lowerGoal.includes('video')) {
      requirements.push('Video processing');
    }
    if (lowerGoal.includes('audio')) {
      requirements.push('Audio extraction');
    }
    if (lowerGoal.includes('transcribe') || lowerGoal.includes('transcription')) {
      requirements.push('Audio transcription');
    }
    if (lowerGoal.includes('enhance') || lowerGoal.includes('improve')) {
      requirements.push('Text enhancement');
    }
    
    return requirements;
  }

  // Public methods for workflow management
  async getWorkflowStatus(executionId: string): Promise<WorkflowExecution | null> {
    try {
      // Get state from LangGraph memory
      const config = {
        configurable: {
          thread_id: executionId
        }
      };

      const state = await this.compiledGraph.getState(config);
      
      if (!state || !state.values) {
        return null;
      }

      return {
        id: executionId,
        workflowId: state.values.goal, // Use goal as workflowId for now
        status: state.values.status as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
        input: state.values.context,
        output: state.values.finalResult,
        currentStep: state.values.currentThought,
        completedSteps: state.values.actionHistory.filter((a: ActionStep) => a.status === 'completed').map((a: ActionStep) => a.action.type),
        failedSteps: state.values.actionHistory.filter((a: ActionStep) => a.status === 'failed').map((a: ActionStep) => a.action.type),
        stepResults: state.values.actionHistory.reduce((acc: Record<string, any>, action: ActionStep) => {
          if (action.result) {
            acc[action.action.type] = action.result;
          }
          return acc;
        }, {} as Record<string, any>),
        error: state.values.error,
        startTime: state.values.startTime,
        endTime: state.values.endTime,
        metadata: state.values.metadata
      };
    } catch (error) {
      logger.error('Failed to get workflow status', {
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  async cancelWorkflow(executionId: string): Promise<boolean> {
    try {
      // For now, just log the cancellation
      // In a full implementation, you'd interrupt the running workflow
      logger.info('Workflow cancellation requested', { executionId });
      
      await this.emitEvent({
        type: 'workflow.failed',
        executionId,
        timestamp: new Date().toISOString(),
        data: { reason: 'User requested cancellation' }
      });

      return true;
    } catch (error) {
      logger.error('Failed to cancel workflow', {
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async listActiveWorkflows(): Promise<string[]> {
    // This would require maintaining a registry of active workflows
    // For now, return empty array
    return [];
  }

  async cleanup(): Promise<void> {
    try {
      // Cleanup resources
      this.isInitialized = false;
      logger.info('ReAct workflow engine cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup workflow engine', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
