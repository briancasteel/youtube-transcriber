import { Router, Request, Response } from 'express';
import { z } from 'zod';
import ytdl from 'ytdl-core';
import { v4 as uuidv4 } from 'uuid';
import { redisClient } from '../server';
import { logger } from '../utils/logger';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { VideoProcessor } from '../services/VideoProcessor';

const router = Router();

// Validation schemas
const videoInfoSchema = z.object({
  url: z.string().url().refine((url) => {
    return ytdl.validateURL(url);
  }, {
    message: 'Invalid YouTube URL'
  })
});

const processVideoSchema = z.object({
  url: z.string().url().refine((url) => {
    return ytdl.validateURL(url);
  }, {
    message: 'Invalid YouTube URL'
  }),
  quality: z.enum(['highest', 'lowest', 'highestaudio', 'lowestaudio']).optional().default('highestaudio'),
  format: z.enum(['mp4', 'webm', 'mp3', 'wav']).optional().default('mp3')
});

// Get video information
router.get('/info', asyncHandler(async (req: Request, res: Response) => {
  const { url } = videoInfoSchema.parse(req.query);
  
  try {
    const info = await ytdl.getInfo(url);
    const videoDetails = info.videoDetails;
    
    res.json({
      success: true,
      data: {
        videoId: videoDetails.videoId,
        title: videoDetails.title,
        description: videoDetails.description,
        lengthSeconds: parseInt(videoDetails.lengthSeconds),
        author: {
          name: videoDetails.author.name,
          channelUrl: videoDetails.author.channel_url
        },
        thumbnails: videoDetails.thumbnails,
        publishDate: videoDetails.publishDate,
        viewCount: videoDetails.viewCount,
        keywords: videoDetails.keywords,
        category: videoDetails.category,
        isLiveContent: videoDetails.isLiveContent,
        formats: info.formats.map(format => ({
          itag: format.itag,
          mimeType: format.mimeType,
          quality: format.quality,
          hasAudio: format.hasAudio,
          hasVideo: format.hasVideo,
          container: format.container,
          codecs: format.codecs,
          audioCodec: format.audioCodec,
          videoCodec: format.videoCodec
        }))
      },
      timestamp: new Date().toISOString(),
      requestId: res.locals['requestId']
    });
  } catch (error) {
    logger.error('Failed to get video info', {
      error: (error as Error).message,
      url,
      requestId: res.locals['requestId']
    });
    
    throw createError('Failed to retrieve video information', 400, 'VIDEO_INFO_ERROR');
  }
}));

// Process video (download and convert)
router.post('/process', asyncHandler(async (req: Request, res: Response) => {
  const { url, quality, format } = processVideoSchema.parse(req.body);
  
  const jobId = uuidv4();
  const processor = new VideoProcessor();
  
  try {
    // Get basic video info first
    const info = await ytdl.getInfo(url);
    const videoDetails = info.videoDetails;
    
    // Create job record in Redis
    const jobData = {
      jobId,
      url,
      quality,
      format,
      status: 'queued',
      videoInfo: {
        videoId: videoDetails.videoId,
        title: videoDetails.title,
        lengthSeconds: parseInt(videoDetails.lengthSeconds),
        author: videoDetails.author.name
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await redisClient.setEx(`video_job:${jobId}`, 3600, JSON.stringify(jobData)); // 1 hour TTL
    
    // Start processing asynchronously
    processor.processVideo(jobId, url, quality, format).catch((error) => {
      logger.error('Video processing failed', {
        error: (error as Error).message,
        jobId,
        url,
        requestId: res.locals['requestId']
      });
    });
    
    res.status(202).json({
      success: true,
      data: {
        jobId,
        status: 'queued',
        message: 'Video processing started',
        estimatedTime: `${Math.ceil(parseInt(videoDetails.lengthSeconds) / 60)} minutes`,
        statusUrl: `/api/video/status/${jobId}`
      },
      timestamp: new Date().toISOString(),
      requestId: res.locals['requestId']
    });
    
  } catch (error) {
    logger.error('Failed to start video processing', {
      error: (error as Error).message,
      url,
      requestId: res.locals['requestId']
    });
    
    throw createError('Failed to start video processing', 400, 'VIDEO_PROCESSING_ERROR');
  }
}));

// Get processing status
router.get('/status/:jobId', asyncHandler(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  
  if (!jobId || typeof jobId !== 'string') {
    throw createError('Invalid job ID', 400, 'INVALID_JOB_ID');
  }
  
  try {
    const jobDataStr = await redisClient.get(`video_job:${jobId}`);
    
    if (!jobDataStr) {
      throw createError('Job not found', 404, 'JOB_NOT_FOUND');
    }
    
    const jobData = JSON.parse(jobDataStr);
    
    res.json({
      success: true,
      data: jobData,
      timestamp: new Date().toISOString(),
      requestId: res.locals['requestId']
    });
    
  } catch (error) {
    if ((error as any).code === 'JOB_NOT_FOUND') {
      throw error;
    }
    
    logger.error('Failed to get job status', {
      error: (error as Error).message,
      jobId,
      requestId: res.locals['requestId']
    });
    
    throw createError('Failed to retrieve job status', 500, 'STATUS_RETRIEVAL_ERROR');
  }
}));

export { router as videoRouter };
