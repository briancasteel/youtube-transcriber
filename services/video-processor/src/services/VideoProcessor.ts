import ytdl from '@distube/ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { redisClient } from '../server';
import { logger } from '../utils/logger';

export interface ProcessingJob {
  jobId: string;
  url: string;
  quality: string;
  format: string;
  status: 'queued' | 'downloading' | 'converting' | 'completed' | 'failed';
  progress?: number;
  filePath?: string;
  error?: string;
  videoInfo: {
    videoId: string;
    title: string;
    lengthSeconds: number;
    author: string;
  };
  createdAt: string;
  updatedAt: string;
}

export class VideoProcessor {
  private readonly downloadDir: string;
  private readonly outputDir: string;

  constructor() {
    this.downloadDir = process.env['DOWNLOAD_DIR'] || './downloads';
    this.outputDir = process.env['OUTPUT_DIR'] || './output';
    
    // Ensure directories exist
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private async updateJobStatus(jobId: string, updates: Partial<ProcessingJob>): Promise<void> {
    try {
      const jobDataStr = await redisClient.get(`video_job:${jobId}`);
      if (!jobDataStr) {
        throw new Error('Job not found');
      }

      const jobData = JSON.parse(jobDataStr) as ProcessingJob;
      const updatedJob = {
        ...jobData,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await redisClient.setEx(`video_job:${jobId}`, 3600, JSON.stringify(updatedJob));
      
      logger.info('Job status updated', {
        jobId,
        status: updatedJob.status,
        progress: updatedJob.progress
      });
    } catch (error) {
      logger.error('Failed to update job status', {
        jobId,
        error: (error as Error).message
      });
    }
  }

  public async processVideo(
    jobId: string,
    url: string,
    quality: string,
    format: string
  ): Promise<void> {
    try {
      await this.updateJobStatus(jobId, { status: 'downloading', progress: 0 });

      // Get video info
      const info = await ytdl.getInfo(url);
      const videoDetails = info.videoDetails;
      const sanitizedTitle = this.sanitizeFilename(videoDetails.title);
      
      // Determine file paths
      const tempVideoPath = path.join(this.downloadDir, `${jobId}_temp.${this.getContainerFormat(quality)}`);
      const outputPath = path.join(this.outputDir, `${sanitizedTitle}_${jobId}.${format}`);

      // Download video/audio
      await this.downloadMedia(url, tempVideoPath, quality, jobId);

      // Convert if necessary
      if (this.needsConversion(quality, format)) {
        await this.updateJobStatus(jobId, { status: 'converting', progress: 50 });
        await this.convertMedia(tempVideoPath, outputPath, format, jobId);
        
        // Clean up temp file
        if (fs.existsSync(tempVideoPath)) {
          fs.unlinkSync(tempVideoPath);
        }
      } else {
        // Just move the file
        fs.renameSync(tempVideoPath, outputPath);
      }

      await this.updateJobStatus(jobId, {
        status: 'completed',
        progress: 100,
        filePath: outputPath
      });

      logger.info('Video processing completed', {
        jobId,
        outputPath,
        title: videoDetails.title
      });

    } catch (error) {
      await this.updateJobStatus(jobId, {
        status: 'failed',
        error: (error as Error).message
      });

      logger.error('Video processing failed', {
        jobId,
        error: (error as Error).message,
        stack: (error as Error).stack
      });

      throw error;
    }
  }

  private async downloadMedia(
    url: string,
    outputPath: string,
    quality: string,
    jobId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = ytdl(url, {
        quality: quality as any,
        filter: this.getFilterType(quality)
      });

      const writeStream = fs.createWriteStream(outputPath);
      let downloadedBytes = 0;
      let totalBytes = 0;

      stream.on('info', (info, format) => {
        totalBytes = parseInt(format.contentLength || '0');
        logger.info('Starting download', {
          jobId,
          title: info.videoDetails.title,
          format: format.mimeType,
          size: `${Math.round(totalBytes / 1024 / 1024)}MB`
        });
      });

      stream.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0) {
          const progress = Math.round((downloadedBytes / totalBytes) * 40); // 40% for download
          this.updateJobStatus(jobId, { progress }).catch(() => {});
        }
      });

      stream.on('error', (error) => {
        logger.error('Download stream error', {
          jobId,
          error: error.message
        });
        reject(error);
      });

      writeStream.on('error', (error) => {
        logger.error('Write stream error', {
          jobId,
          error: error.message
        });
        reject(error);
      });

      writeStream.on('finish', () => {
        logger.info('Download completed', {
          jobId,
          outputPath,
          size: `${Math.round(downloadedBytes / 1024 / 1024)}MB`
        });
        resolve();
      });

      stream.pipe(writeStream);
    });
  }

  private async convertMedia(
    inputPath: string,
    outputPath: string,
    format: string,
    jobId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath);

      // Configure output based on format
      switch (format) {
        case 'mp3':
          command = command
            .audioCodec('libmp3lame')
            .audioBitrate(128)
            .format('mp3');
          break;
        case 'wav':
          command = command
            .audioCodec('pcm_s16le')
            .format('wav');
          break;
        case 'mp4':
          command = command
            .videoCodec('libx264')
            .audioCodec('aac')
            .format('mp4');
          break;
        case 'webm':
          command = command
            .videoCodec('libvpx')
            .audioCodec('libvorbis')
            .format('webm');
          break;
        default:
          reject(new Error(`Unsupported format: ${format}`));
          return;
      }

      command
        .on('start', (commandLine) => {
          logger.info('FFmpeg conversion started', {
            jobId,
            command: commandLine
          });
        })
        .on('progress', (progress) => {
          const percent = Math.round(50 + (progress.percent || 0) * 0.5); // 50-100% for conversion
          this.updateJobStatus(jobId, { progress: percent }).catch(() => {});
        })
        .on('error', (error) => {
          logger.error('FFmpeg conversion error', {
            jobId,
            error: error.message
          });
          reject(error);
        })
        .on('end', () => {
          logger.info('FFmpeg conversion completed', {
            jobId,
            outputPath
          });
          resolve();
        })
        .save(outputPath);
    });
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 50); // Limit length
  }

  private getContainerFormat(quality: string): string {
    if (quality.includes('audio')) {
      return 'webm'; // Audio-only formats are typically webm
    }
    return 'mp4'; // Video formats are typically mp4
  }

  private getFilterType(quality: string): 'video' | 'audio' | 'audioandvideo' {
    if (quality.includes('audio')) {
      return 'audio';
    }
    return 'audioandvideo';
  }

  private needsConversion(quality: string, format: string): boolean {
    // If downloading audio-only and want mp3/wav, need conversion
    if (quality.includes('audio') && (format === 'mp3' || format === 'wav')) {
      return true;
    }
    
    // If downloading video and want different format, need conversion
    if (!quality.includes('audio') && (format === 'mp3' || format === 'wav')) {
      return true;
    }

    return false;
  }
}
