import ytdl from '@distube/ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import { OpenAI } from 'openai';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

export interface VideoInfo {
  videoId: string;
  title: string;
  description: string;
  lengthSeconds: number;
  author: {
    name: string;
    channelUrl: string;
  };
  thumbnails: any[];
  publishDate: string;
  viewCount: string;
  keywords: string[] | undefined;
  category: string;
}

export interface ProcessingResult {
  audioFile: string;
  videoInfo: VideoInfo;
  duration: number;
}

export interface TranscriptionOptions {
  language?: string;
  model?: 'tiny' | 'base' | 'small' | 'medium' | 'large';
  includeTimestamps?: boolean;
  temperature?: number;
}

export interface TranscriptionResult {
  text: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language: string;
  duration: number;
}

export interface EnhancementOptions {
  addPunctuation?: boolean;
  fixGrammar?: boolean;
  improveClarity?: boolean;
  generateSummary?: boolean;
  extractKeywords?: boolean;
}

export interface EnhancementResult {
  enhancedText: string;
  summary?: string;
  keywords?: string[];
  improvements: string[];
}

export class IntegratedMediaProcessor {
  private downloadDir: string;
  private outputDir: string;
  private ollamaUrl: string;
  private openaiClient?: OpenAI;

  constructor() {
    this.downloadDir = process.env['DOWNLOAD_DIR'] || '/tmp/downloads';
    this.outputDir = process.env['OUTPUT_DIR'] || '/tmp/output';
    this.ollamaUrl = process.env['OLLAMA_URL'] || 'http://ollama:11434';
    
    // Initialize OpenAI client if API key is provided
    if (process.env['OPENAI_API_KEY']) {
      this.openaiClient = new OpenAI({
        apiKey: process.env['OPENAI_API_KEY']
      });
    }

    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.downloadDir, { recursive: true });
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create directories', {
        error: error instanceof Error ? error.message : 'Unknown error',
        downloadDir: this.downloadDir,
        outputDir: this.outputDir
      });
    }
  }

  // Video Processing Methods
  async validateYouTubeUrl(url: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const isValid = ytdl.validateURL(url);
      return { valid: isValid };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid URL'
      };
    }
  }

  async getVideoInfo(url: string): Promise<VideoInfo> {
    try {
      const info = await ytdl.getInfo(url);
      const videoDetails = info.videoDetails;

      return {
        videoId: videoDetails.videoId,
        title: videoDetails.title,
        description: videoDetails.description || '',
        lengthSeconds: parseInt(videoDetails.lengthSeconds),
        author: {
          name: videoDetails.author.name,
          channelUrl: videoDetails.author.channel_url || ''
        },
        thumbnails: videoDetails.thumbnails,
        publishDate: videoDetails.publishDate || '',
        viewCount: videoDetails.viewCount || '0',
        keywords: videoDetails.keywords,
        category: videoDetails.category || 'Unknown'
      };
    } catch (error) {
      logger.error('Failed to get video info', {
        error: error instanceof Error ? error.message : 'Unknown error',
        url
      });
      throw new Error(`Failed to get video information: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async processVideo(url: string, quality: string = 'highestaudio', format: string = 'mp3'): Promise<ProcessingResult> {
    const startTime = Date.now();
    const jobId = uuidv4();
    const outputFile = path.join(this.outputDir, `${jobId}.${format}`);

    try {
      // Get video info first
      const videoInfo = await this.getVideoInfo(url);
      
      logger.info('Starting video processing', {
        jobId,
        url,
        quality,
        format,
        title: videoInfo.title,
        duration: videoInfo.lengthSeconds
      });

      // Download and convert audio
      await this.downloadAudio(url, outputFile, quality, format);

      const duration = Date.now() - startTime;

      logger.info('Video processing completed', {
        jobId,
        outputFile,
        duration,
        title: videoInfo.title
      });

      return {
        audioFile: outputFile,
        videoInfo,
        duration
      };
    } catch (error) {
      logger.error('Video processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        jobId,
        url
      });
      throw new Error(`Video processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async downloadAudio(url: string, outputFile: string, quality: string, format: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = ytdl(url, {
        quality: quality as any,
        filter: 'audioonly'
      });

      const command = ffmpeg(stream)
        .audioBitrate(128)
        .audioCodec('libmp3lame')
        .format(format)
        .on('end', () => {
          logger.info('Audio download completed', { outputFile });
          resolve();
        })
        .on('error', (error) => {
          logger.error('Audio download failed', {
            error: error.message,
            outputFile
          });
          reject(error);
        })
        .save(outputFile);
    });
  }

  // Transcription Methods
  async transcribeAudio(audioFile: string, options: TranscriptionOptions = {}): Promise<TranscriptionResult> {
    const startTime = Date.now();

    try {
      logger.info('Starting audio transcription', {
        audioFile,
        options
      });

      let result: TranscriptionResult;

      if (this.openaiClient) {
        // Use OpenAI Whisper API
        result = await this.transcribeWithOpenAI(audioFile, options);
      } else {
        // Use local Whisper (would need to implement or use a local service)
        throw new Error('Local Whisper transcription not implemented. Please provide OPENAI_API_KEY.');
      }

      const duration = Date.now() - startTime;
      result.duration = duration;

      logger.info('Audio transcription completed', {
        audioFile,
        textLength: result.text.length,
        duration,
        language: result.language
      });

      return result;
    } catch (error) {
      logger.error('Audio transcription failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        audioFile
      });
      throw new Error(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async transcribeWithOpenAI(audioFile: string, options: TranscriptionOptions): Promise<TranscriptionResult> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      const audioBuffer = await fs.readFile(audioFile);
      const file = new File([audioBuffer], path.basename(audioFile), {
        type: 'audio/mpeg'
      });

      const requestParams: any = {
        file: file,
        model: 'whisper-1',
        temperature: options.temperature || 0,
        response_format: options.includeTimestamps ? 'verbose_json' : 'json'
      };

      if (options.language) {
        requestParams.language = options.language;
      }

      const response = await this.openaiClient.audio.transcriptions.create(requestParams);

      if (typeof response === 'string') {
        return {
          text: response,
          language: options.language || 'auto',
          duration: 0
        };
      }

      // Handle the response based on format
      if (options.includeTimestamps && 'segments' in response) {
        return {
          text: (response as any).text,
          segments: (response as any).segments?.map((segment: any) => ({
            start: segment.start,
            end: segment.end,
            text: segment.text
          })),
          language: (response as any).language || options.language || 'auto',
          duration: 0
        };
      } else {
        return {
          text: (response as any).text,
          language: (response as any).language || options.language || 'auto',
          duration: 0
        };
      }
    } catch (error) {
      throw new Error(`OpenAI transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Text Enhancement Methods
  async enhanceText(text: string, options: EnhancementOptions = {}): Promise<EnhancementResult> {
    try {
      logger.info('Starting text enhancement', {
        textLength: text.length,
        options
      });

      const improvements: string[] = [];
      let enhancedText = text;

      // Build enhancement prompt
      const tasks: string[] = [];
      if (options.addPunctuation) tasks.push('add proper punctuation');
      if (options.fixGrammar) tasks.push('fix grammar errors');
      if (options.improveClarity) tasks.push('improve clarity and readability');

      if (tasks.length > 0) {
        const prompt = `Please ${tasks.join(', ')} in the following text. Return only the improved text without any additional commentary:\n\n${text}`;
        enhancedText = await this.callOllama(prompt);
        improvements.push(`Applied: ${tasks.join(', ')}`);
      }

      const result: EnhancementResult = {
        enhancedText,
        improvements
      };

      // Generate summary if requested
      if (options.generateSummary) {
        const summaryPrompt = `Please provide a concise summary of the following text:\n\n${enhancedText}`;
        result.summary = await this.callOllama(summaryPrompt);
        improvements.push('Generated summary');
      }

      // Extract keywords if requested
      if (options.extractKeywords) {
        const keywordsPrompt = `Please extract the main keywords and key phrases from the following text. Return them as a comma-separated list:\n\n${enhancedText}`;
        const keywordsText = await this.callOllama(keywordsPrompt);
        result.keywords = keywordsText.split(',').map(k => k.trim()).filter(k => k.length > 0);
        improvements.push('Extracted keywords');
      }

      logger.info('Text enhancement completed', {
        originalLength: text.length,
        enhancedLength: result.enhancedText.length,
        improvements: improvements.length
      });

      return result;
    } catch (error) {
      logger.error('Text enhancement failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        textLength: text.length
      });
      throw new Error(`Text enhancement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async callOllama(prompt: string, model: string = 'llama2:7b'): Promise<string> {
    try {
      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model,
        prompt,
        stream: false
      }, {
        timeout: 60000 // 60 second timeout
      });

      return response.data.response || '';
    } catch (error) {
      logger.error('Ollama API call failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        model,
        promptLength: prompt.length
      });
      throw new Error(`Ollama API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Utility Methods
  async cleanup(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      logger.info('File cleaned up', { filePath });
    } catch (error) {
      logger.warn('Failed to cleanup file', {
        error: error instanceof Error ? error.message : 'Unknown error',
        filePath
      });
    }
  }

  async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
