import { EventEmitter } from 'events';
import logger from './utils/logger';

export interface JobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startTime: Date;
  endTime?: Date;
  error?: string;
  result?: any;
  metadata?: {
    videoUrl?: string;
    fileName?: string;
    estimatedDuration?: number;
  };
}

export class JobManager extends EventEmitter {
  private jobs: Map<string, JobStatus> = new Map();
  private activeJobs: Set<string> = new Set();

  constructor() {
    super();
    logger.info('JobManager initialized');
  }

  /**
   * Create a new job
   */
  createJob(metadata?: any): string {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const job: JobStatus = {
      jobId,
      status: 'pending',
      progress: 0,
      startTime: new Date(),
      metadata
    };

    this.jobs.set(jobId, job);
    logger.info('Job created', { jobId, metadata });
    
    return jobId;
  }

  /**
   * Start processing a job
   */
  startJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      logger.error('Job not found', { jobId });
      return false;
    }

    if (job.status !== 'pending') {
      logger.error('Job not in pending state', { jobId, status: job.status });
      return false;
    }

    job.status = 'processing';
    job.startTime = new Date();
    this.activeJobs.add(jobId);
    
    this.emit('jobStarted', job);
    logger.info('Job started', { jobId });
    
    return true;
  }

  /**
   * Update job progress
   */
  updateProgress(jobId: string, progress: number, message?: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      logger.error('Job not found for progress update', { jobId });
      return false;
    }

    if (job.status !== 'processing') {
      logger.warn('Attempted to update progress for non-processing job', { jobId, status: job.status });
      return false;
    }

    job.progress = Math.max(0, Math.min(100, progress));
    
    this.emit('jobProgress', { ...job, message });
    logger.debug('Job progress updated', { jobId, progress, message });
    
    return true;
  }

  /**
   * Complete a job successfully
   */
  completeJob(jobId: string, result: any): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      logger.error('Job not found for completion', { jobId });
      return false;
    }

    job.status = 'completed';
    job.progress = 100;
    job.endTime = new Date();
    job.result = result;
    
    this.activeJobs.delete(jobId);
    this.emit('jobCompleted', job);
    logger.info('Job completed', { jobId, duration: job.endTime.getTime() - job.startTime.getTime() });
    
    return true;
  }

  /**
   * Fail a job
   */
  failJob(jobId: string, error: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      logger.error('Job not found for failure', { jobId });
      return false;
    }

    job.status = 'failed';
    job.endTime = new Date();
    job.error = error;
    
    this.activeJobs.delete(jobId);
    this.emit('jobFailed', job);
    logger.error('Job failed', { jobId, error });
    
    return true;
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      logger.error('Job not found for cancellation', { jobId });
      return false;
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      logger.warn('Cannot cancel job in final state', { jobId, status: job.status });
      return false;
    }

    job.status = 'cancelled';
    job.endTime = new Date();
    
    this.activeJobs.delete(jobId);
    this.emit('jobCancelled', job);
    logger.info('Job cancelled', { jobId });
    
    return true;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): JobStatus | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all jobs (for debugging/admin)
   */
  getAllJobs(): JobStatus[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get active jobs
   */
  getActiveJobs(): JobStatus[] {
    return Array.from(this.activeJobs).map(jobId => this.jobs.get(jobId)!).filter(Boolean);
  }

  /**
   * Check if job exists
   */
  hasJob(jobId: string): boolean {
    return this.jobs.has(jobId);
  }

  /**
   * Check if job is cancellable
   */
  isCancellable(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    return job ? (job.status === 'pending' || job.status === 'processing') : false;
  }

  /**
   * Clean up old jobs (optional - for memory management)
   */
  cleanupOldJobs(maxAge: number = 24 * 60 * 60 * 1000): number {
    const cutoff = new Date(Date.now() - maxAge);
    let cleaned = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        if (job.endTime && job.endTime < cutoff) {
          this.jobs.delete(jobId);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up old jobs', { count: cleaned });
    }

    return cleaned;
  }
}

// Export singleton instance
export const jobManager = new JobManager();
