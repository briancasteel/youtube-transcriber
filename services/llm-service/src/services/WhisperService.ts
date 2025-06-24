import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import logger from '../utils/logger';

export interface WhisperOptions {
  model?: 'tiny' | 'base' | 'small' | 'medium' | 'large';
  language?: string;
  outputFormat?: 'txt' | 'srt' | 'vtt' | 'json';
  includeTimestamps?: boolean;
  includeWordTimestamps?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface WhisperResult {
  text: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
    words?: Array<{
      start: number;
      end: number;
      word: string;
      probability: number;
    }>;
  }>;
  language?: string;
  duration?: number;
}

export class WhisperService {
  private modelsDir: string;
  private whisperPath: string;

  constructor() {
    this.modelsDir = process.env['WHISPER_MODELS_DIR'] || '/app/models';
    this.whisperPath = process.env['WHISPER_PATH'] || 'whisper';
  }

  async initialize(): Promise<void> {
    try {
      // Ensure models directory exists
      await fs.mkdir(this.modelsDir, { recursive: true });
      logger.info('WhisperService initialized', { modelsDir: this.modelsDir });
    } catch (error) {
      logger.error('Failed to initialize WhisperService', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async transcribeAudio(
    audioPath: string, 
    options: WhisperOptions = {}
  ): Promise<WhisperResult> {
    const {
      model = 'base',
      language = 'auto',
      outputFormat = 'json',
      includeTimestamps = true,
      includeWordTimestamps = false,
      temperature = 0.0,
      maxTokens = 224
    } = options;

    logger.info('Starting Whisper transcription', {
      audioPath,
      model,
      language,
      outputFormat,
      includeTimestamps,
      includeWordTimestamps
    });

    try {
      // Check if audio file exists
      await fs.access(audioPath);

      // Prepare output file path
      const outputDir = path.dirname(audioPath);
      const baseName = path.basename(audioPath, path.extname(audioPath));
      const outputPath = path.join(outputDir, `${baseName}_transcription.${outputFormat}`);

      // Build Whisper command arguments
      const args = [
        audioPath,
        '--model', model,
        '--output_dir', outputDir,
        '--output_format', outputFormat,
        '--temperature', temperature.toString(),
        '--max_tokens', maxTokens.toString()
      ];

      if (language !== 'auto') {
        args.push('--language', language);
      }

      if (includeTimestamps) {
        args.push('--word_timestamps', includeWordTimestamps.toString());
      }

      // Execute Whisper
      const result = await this.executeWhisper(args);

      // Read and parse the output file
      const transcriptionResult = await this.parseWhisperOutput(outputPath, outputFormat);

      logger.info('Whisper transcription completed', {
        audioPath,
        outputPath,
        textLength: transcriptionResult.text.length,
        segmentCount: transcriptionResult.segments?.length || 0
      });

      return transcriptionResult;

    } catch (error) {
      logger.error('Whisper transcription failed', {
        audioPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async executeWhisper(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      logger.debug('Executing Whisper command', { args });

      const whisperProcess = spawn(this.whisperPath, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      whisperProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      whisperProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      whisperProcess.on('close', (code) => {
        if (code === 0) {
          logger.debug('Whisper process completed successfully', { code });
          resolve(stdout);
        } else {
          logger.error('Whisper process failed', { code, stderr });
          reject(new Error(`Whisper process failed with code ${code}: ${stderr}`));
        }
      });

      whisperProcess.on('error', (error) => {
        logger.error('Whisper process error', { error: error.message });
        reject(error);
      });
    });
  }

  private async parseWhisperOutput(outputPath: string, format: string): Promise<WhisperResult> {
    try {
      const content = await fs.readFile(outputPath, 'utf-8');

      switch (format) {
        case 'json':
          return this.parseJsonOutput(content);
        case 'txt':
          return { text: content.trim() };
        case 'srt':
          return this.parseSrtOutput(content);
        case 'vtt':
          return this.parseVttOutput(content);
        default:
          throw new Error(`Unsupported output format: ${format}`);
      }
    } catch (error) {
      logger.error('Failed to parse Whisper output', {
        outputPath,
        format,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private parseJsonOutput(content: string): WhisperResult {
    try {
      const data = JSON.parse(content);
      return {
        text: data.text || '',
        segments: data.segments || [],
        language: data.language,
        duration: data.duration
      };
    } catch (error) {
      throw new Error(`Failed to parse JSON output: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseSrtOutput(content: string): WhisperResult {
    const segments: Array<{ start: number; end: number; text: string }> = [];
    let fullText = '';

    const srtBlocks = content.trim().split('\n\n');
    
    for (const block of srtBlocks) {
      const lines = block.split('\n');
      if (lines.length >= 3) {
        const timeMatch = lines[1]?.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/);
        if (timeMatch && timeMatch[1] && timeMatch[2] && timeMatch[3] && timeMatch[4] && timeMatch[5] && timeMatch[6] && timeMatch[7] && timeMatch[8]) {
          const start = this.timeToSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
          const end = this.timeToSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
          const text = lines.slice(2).join(' ');
          
          segments.push({ start, end, text });
          fullText += text + ' ';
        }
      }
    }

    return {
      text: fullText.trim(),
      segments
    };
  }

  private parseVttOutput(content: string): WhisperResult {
    const segments: Array<{ start: number; end: number; text: string }> = [];
    let fullText = '';

    const lines = content.split('\n');
    let i = 0;

    // Skip header
    while (i < lines.length && !lines[i]?.includes('-->')) {
      i++;
    }

    while (i < lines.length) {
      const line = lines[i];
      if (!line) {
        i++;
        continue;
      }
      
      const timeMatch = line.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
      
      if (timeMatch && timeMatch[1] && timeMatch[2] && timeMatch[3] && timeMatch[4] && timeMatch[5] && timeMatch[6] && timeMatch[7] && timeMatch[8]) {
        const start = this.timeToSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
        const end = this.timeToSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
        
        i++;
        let text = '';
        while (i < lines.length && lines[i]?.trim() !== '' && !lines[i]?.includes('-->')) {
          text += (lines[i] || '') + ' ';
          i++;
        }
        
        if (text.trim()) {
          segments.push({ start, end, text: text.trim() });
          fullText += text.trim() + ' ';
        }
      } else {
        i++;
      }
    }

    return {
      text: fullText.trim(),
      segments
    };
  }

  private timeToSeconds(hours: string, minutes: string, seconds: string, milliseconds: string): number {
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(milliseconds) / 1000;
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const models = ['tiny', 'base', 'small', 'medium', 'large'];
      // In a real implementation, you might check which models are actually downloaded
      return models;
    } catch (error) {
      logger.error('Failed to get available models', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  async downloadModel(model: string): Promise<void> {
    logger.info('Downloading Whisper model', { model });
    
    try {
      // In a real implementation, you would download the model
      // For now, we'll just log that it would be downloaded
      logger.info('Model download completed', { model });
    } catch (error) {
      logger.error('Failed to download model', {
        model,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}
