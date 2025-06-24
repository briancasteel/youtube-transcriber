import { createClient, RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import logger from '../utils/logger';
import {
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowStep,
  StepExecution,
  WorkflowEvent,
  ServiceEndpoint
} from '../types/workflow';

export class WorkflowEngine {
  private redis: RedisClientType;
  private httpClient: AxiosInstance;
  private serviceEndpoints: Map<string, ServiceEndpoint>;
  private isInitialized: boolean = false;

  constructor() {
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
    this.redis = createClient({ url: redisUrl });
    
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'workflow-service/1.0.0'
      }
    });

    this.serviceEndpoints = new Map();
    this.initializeServiceEndpoints();
  }

  private initializeServiceEndpoints(): void {
    // Define service endpoints
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

  async initialize(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info('Workflow engine initialized', {
        redisConnected: true,
        serviceEndpoints: Array.from(this.serviceEndpoints.keys())
      });
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize workflow engine', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async executeWorkflow(
    workflowDefinition: WorkflowDefinition,
    input: Record<string, any>,
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
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId: workflowDefinition.id,
      status: 'pending',
      input,
      completedSteps: [],
      failedSteps: [],
      stepResults: {},
      startTime: new Date().toISOString(),
      metadata: {
        ...(metadata.userId && { userId: metadata.userId }),
        source: metadata.source,
        priority: metadata.priority || 'normal',
        tags: metadata.tags || []
      }
    };

    try {
      // Store execution in Redis
      await this.storeExecution(execution);

      // Emit workflow started event
      await this.emitEvent({
        type: 'workflow.started',
        executionId,
        timestamp: new Date().toISOString(),
        data: { workflowId: workflowDefinition.id, input }
      });

      // Start execution asynchronously
      this.executeWorkflowAsync(workflowDefinition, execution).catch(error => {
        logger.error('Async workflow execution failed', {
          executionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });

      logger.info('Workflow execution started', {
        executionId,
        workflowId: workflowDefinition.id,
        stepCount: workflowDefinition.steps.length
      });

      return executionId;
    } catch (error) {
      logger.error('Failed to start workflow execution', {
        executionId,
        workflowId: workflowDefinition.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async executeWorkflowAsync(
    workflowDefinition: WorkflowDefinition,
    execution: WorkflowExecution
  ): Promise<void> {
    const startTime = Date.now();

    try {
      execution.status = 'running';
      await this.storeExecution(execution);

      // Build dependency graph
      const dependencyGraph = this.buildDependencyGraph(workflowDefinition.steps);
      
      // Execute steps in dependency order
      const executedSteps = new Set<string>();
      const pendingSteps = new Set(workflowDefinition.steps.map(s => s.id));

      while (pendingSteps.size > 0) {
        const readySteps = Array.from(pendingSteps).filter(stepId => {
          const step = workflowDefinition.steps.find(s => s.id === stepId);
          return step?.dependencies.every(dep => executedSteps.has(dep)) ?? false;
        });

        if (readySteps.length === 0) {
          throw new Error('Circular dependency detected or missing dependencies');
        }

        // Execute ready steps in parallel
        const stepPromises = readySteps.map(stepId => {
          const step = workflowDefinition.steps.find(s => s.id === stepId);
          if (!step) {
            throw new Error(`Step not found: ${stepId}`);
          }
          return this.executeStep(step, execution);
        });

        const stepResults = await Promise.allSettled(stepPromises);

        // Process results
        for (let i = 0; i < readySteps.length; i++) {
          const stepId = readySteps[i];
          const result = stepResults[i];

          if (!stepId || !result) continue;

          if (result.status === 'fulfilled') {
            execution.completedSteps.push(stepId);
            execution.stepResults[stepId] = result.value.output || {};
            executedSteps.add(stepId);
          } else {
            execution.failedSteps.push(stepId);
            execution.error = `Step ${stepId} failed: ${result.reason}`;
            throw new Error(execution.error);
          }

          pendingSteps.delete(stepId);
        }

        // Update execution
        await this.storeExecution(execution);
      }

      // Complete workflow
      execution.status = 'completed';
      execution.endTime = new Date().toISOString();
      execution.duration = Date.now() - startTime;
      execution.output = this.buildWorkflowOutput(execution.stepResults);

      await this.storeExecution(execution);

      await this.emitEvent({
        type: 'workflow.completed',
        executionId: execution.id,
        timestamp: new Date().toISOString(),
        data: { 
          duration: execution.duration,
          stepCount: execution.completedSteps.length,
          output: execution.output
        }
      });

      logger.info('Workflow execution completed', {
        executionId: execution.id,
        workflowId: execution.workflowId,
        duration: execution.duration,
        completedSteps: execution.completedSteps.length
      });

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date().toISOString();
      execution.duration = Date.now() - startTime;
      execution.error = error instanceof Error ? error.message : 'Unknown error';

      await this.storeExecution(execution);

      await this.emitEvent({
        type: 'workflow.failed',
        executionId: execution.id,
        timestamp: new Date().toISOString(),
        data: { 
          error: execution.error,
          duration: execution.duration,
          completedSteps: execution.completedSteps.length,
          failedSteps: execution.failedSteps.length
        }
      });

      logger.error('Workflow execution failed', {
        executionId: execution.id,
        workflowId: execution.workflowId,
        error: execution.error,
        completedSteps: execution.completedSteps.length,
        failedSteps: execution.failedSteps.length
      });
    }
  }

  private async executeStep(
    step: WorkflowStep,
    execution: WorkflowExecution
  ): Promise<StepExecution> {
    const stepExecution: StepExecution = {
      stepId: step.id,
      executionId: execution.id,
      status: 'running',
      input: this.buildStepInput(step, execution),
      startTime: new Date().toISOString(),
      retryCount: 0,
      logs: []
    };

    await this.emitEvent({
      type: 'step.started',
      executionId: execution.id,
      stepId: step.id,
      timestamp: new Date().toISOString(),
      data: { stepName: step.name, service: step.service }
    });

    try {
      execution.currentStep = step.id;
      await this.storeExecution(execution);

      const serviceEndpoint = this.serviceEndpoints.get(step.service);
      if (!serviceEndpoint) {
        throw new Error(`Service endpoint not found: ${step.service}`);
      }

      const url = `${serviceEndpoint.baseUrl}${step.endpoint}`;
      const startTime = Date.now();

      logger.info('Executing step', {
        executionId: execution.id,
        stepId: step.id,
        stepName: step.name,
        service: step.service,
        url,
        method: step.method
      });

      const requestConfig: any = {
        method: step.method,
        url,
        data: step.method !== 'GET' ? stepExecution.input : undefined,
        params: step.method === 'GET' ? stepExecution.input : undefined,
        timeout: step.timeout || serviceEndpoint.timeout
      };

      if (serviceEndpoint.headers) {
        requestConfig.headers = serviceEndpoint.headers;
      }

      const response = await this.httpClient.request(requestConfig);

      stepExecution.status = 'completed';
      stepExecution.output = this.mapStepOutput(step, response.data);
      stepExecution.endTime = new Date().toISOString();
      stepExecution.duration = Date.now() - startTime;

      await this.emitEvent({
        type: 'step.completed',
        executionId: execution.id,
        stepId: step.id,
        timestamp: new Date().toISOString(),
        data: { 
          duration: stepExecution.duration,
          outputSize: JSON.stringify(stepExecution.output).length
        }
      });

      logger.info('Step execution completed', {
        executionId: execution.id,
        stepId: step.id,
        duration: stepExecution.duration,
        statusCode: response.status
      });

      return stepExecution;

    } catch (error) {
      stepExecution.status = 'failed';
      stepExecution.error = error instanceof Error ? error.message : 'Unknown error';
      stepExecution.endTime = new Date().toISOString();
      stepExecution.duration = Date.now() - Date.parse(stepExecution.startTime);

      await this.emitEvent({
        type: 'step.failed',
        executionId: execution.id,
        stepId: step.id,
        timestamp: new Date().toISOString(),
        data: { 
          error: stepExecution.error,
          duration: stepExecution.duration
        }
      });

      logger.error('Step execution failed', {
        executionId: execution.id,
        stepId: step.id,
        error: stepExecution.error,
        retryCount: stepExecution.retryCount
      });

      throw error;
    }
  }

  private buildDependencyGraph(steps: WorkflowStep[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    steps.forEach(step => {
      graph.set(step.id, step.dependencies);
    });
    return graph;
  }

  private buildStepInput(step: WorkflowStep, execution: WorkflowExecution): Record<string, any> {
    let input = { ...execution.input };

    // Apply input mapping
    if (step.inputMapping) {
      const mappedInput: Record<string, any> = {};
      Object.entries(step.inputMapping).forEach(([targetKey, sourceKey]) => {
        if (sourceKey.includes('.')) {
          // Handle nested property access
          const parts = sourceKey.split('.');
          const stepId = parts[0];
          const property = parts[1];
          if (stepId && property && execution.stepResults[stepId] && execution.stepResults[stepId][property]) {
            mappedInput[targetKey] = execution.stepResults[stepId][property];
          }
        } else if (execution.stepResults[sourceKey]) {
          mappedInput[targetKey] = execution.stepResults[sourceKey];
        } else if (input[sourceKey]) {
          mappedInput[targetKey] = input[sourceKey];
        }
      });
      input = { ...input, ...mappedInput };
    }

    return input;
  }

  private mapStepOutput(step: WorkflowStep, rawOutput: any): Record<string, any> {
    if (!step.outputMapping) {
      return rawOutput;
    }

    const mappedOutput: Record<string, any> = {};
    Object.entries(step.outputMapping).forEach(([targetKey, sourceKey]) => {
      if (sourceKey.includes('.')) {
        // Handle nested property access
        const keys = sourceKey.split('.');
        let value = rawOutput;
        for (const key of keys) {
          value = value?.[key];
        }
        if (value !== undefined) {
          mappedOutput[targetKey] = value;
        }
      } else if (rawOutput[sourceKey] !== undefined) {
        mappedOutput[targetKey] = rawOutput[sourceKey];
      }
    });

    return { ...rawOutput, ...mappedOutput };
  }

  private buildWorkflowOutput(stepResults: Record<string, any>): Record<string, any> {
    // Combine all step results into final workflow output
    return {
      steps: stepResults,
      summary: {
        totalSteps: Object.keys(stepResults).length,
        completedAt: new Date().toISOString()
      }
    };
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

      logger.info('Workflow execution cancelled', { executionId });
      return true;
    } catch (error) {
      logger.error('Failed to cancel workflow execution', {
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
      logger.info('Workflow engine cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup workflow engine', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
