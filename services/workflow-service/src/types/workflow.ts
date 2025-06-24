export interface WorkflowStep {
  id: string;
  name: string;
  service: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  timeout: number;
  retries: number;
  dependencies: string[];
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: WorkflowStep[];
  timeout: number;
  retryPolicy: {
    maxRetries: number;
    backoffStrategy: 'linear' | 'exponential';
    baseDelay: number;
  };
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: Record<string, any>;
  output?: Record<string, any>;
  currentStep?: string;
  completedSteps: string[];
  failedSteps: string[];
  stepResults: Record<string, any>;
  error?: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  metadata: {
    userId?: string;
    source: string;
    priority: 'low' | 'normal' | 'high';
    tags: string[];
  };
}

export interface StepExecution {
  stepId: string;
  executionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  input: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  retryCount: number;
  logs: StepLog[];
}

export interface StepLog {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, any>;
}

export interface WorkflowEvent {
  type: 'workflow.started' | 'workflow.completed' | 'workflow.failed' | 'step.started' | 'step.completed' | 'step.failed';
  executionId: string;
  stepId?: string;
  timestamp: string;
  data: Record<string, any>;
}

export interface ServiceEndpoint {
  name: string;
  baseUrl: string;
  healthEndpoint: string;
  timeout: number;
  retries: number;
  headers?: Record<string, string>;
}

export interface WorkflowMetrics {
  executionId: string;
  workflowId: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  duration: number;
  throughput: number;
  errorRate: number;
  stepMetrics: Record<string, {
    duration: number;
    successRate: number;
    retryCount: number;
  }>;
}

export interface WorkflowSchedule {
  id: string;
  workflowId: string;
  name: string;
  cronExpression: string;
  enabled: boolean;
  input: Record<string, any>;
  lastRun?: string;
  nextRun: string;
  timezone: string;
}
