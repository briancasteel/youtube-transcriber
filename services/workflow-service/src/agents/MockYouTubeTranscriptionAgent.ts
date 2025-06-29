import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import logger from '../utils/logger';

export interface TranscriptionOptions {
  language?: string;
  includeTimestamps?: boolean;
  enhanceText?: boolean;
}

export interface TranscriptionResult {
  videoId: string;
  title: string;
  description: string;
  captions: Array<{
    text: string;
    start?: number;
    duration?: number;
  }>;
  summary?: string;
  keywords?: string[];
  metadata: {
    duration: number;
    language: string;
    processingTime: number;
    enhanced: boolean;
  };
}

export class MockYouTubeTranscriptionAgent {
  constructor() {
    logger.info('Initializing MockYouTubeTranscriptionAgent (no Ollama required)');
  }

  private extractVideoId(videoUrl: string): string {
    const match = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    return match && match[1] ? match[1] : '';
  }

  private async getYouTubeTranscript(videoUrl: string): Promise<{ title: string; captions: any[] }> {
    try {
      logger.info('Fetching YouTube transcript', { videoUrl });
      
      // Use the same external service as the original implementation
      const response = await axios.post('https://tactiq-apps-prod.tactiq.io/transcript', {
        videoUrl,
        langCode: 'en'
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        title: response.data.title || 'Unknown Title',
        captions: response.data.captions || []
      };
    } catch (error) {
      logger.error('Failed to fetch YouTube transcript', {
        error: error instanceof Error ? error.message : 'Unknown error',
        videoUrl
      });
      
      // Return mock data if external service fails
      const videoId = this.extractVideoId(videoUrl);
      return {
        title: `Mock Video Title (${videoId})`,
        captions: [
          {
            text: "This is a mock transcription for testing purposes. The actual transcription service is not available.",
            start: 0,
            duration: 5
          },
          {
            text: "In a real implementation, this would contain the actual video transcript.",
            start: 5,
            duration: 5
          },
          {
            text: "The system is working correctly, but using mock data instead of real transcription.",
            start: 10,
            duration: 5
          }
        ]
      };
    }
  }

  async transcribe(videoUrl: string, options: TranscriptionOptions = {}): Promise<TranscriptionResult> {
    const startTime = Date.now();
    const executionId = uuidv4();

    logger.info('Starting mock YouTube transcription', {
      executionId,
      videoUrl,
      options
    });

    try {
      // Validate URL
      const videoId = this.extractVideoId(videoUrl);
      if (!videoId) {
        throw new Error('Invalid YouTube URL format');
      }

      // Get transcript
      const { title, captions } = await this.getYouTubeTranscript(videoUrl);

      // Generate description and summary from captions
      const fullText = captions.map((caption: any) => caption.text).join(' ');
      const description = fullText.length > 200 
        ? fullText.substring(0, 200) + '...'
        : fullText;
      
      const summary = fullText.length > 100
        ? fullText.substring(0, 100) + '...'
        : fullText;

      // Extract keywords (simple implementation)
      const words = fullText.toLowerCase().split(/\s+/);
      const wordCount: { [key: string]: number } = {};
      words.forEach(word => {
        const cleanWord = word.replace(/[^\w]/g, '');
        if (cleanWord.length > 3) {
          wordCount[cleanWord] = (wordCount[cleanWord] || 0) + 1;
        }
      });
      
      const keywords = Object.entries(wordCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([word]) => word);

      const processingTime = Date.now() - startTime;

      const result: TranscriptionResult = {
        videoId,
        title,
        description,
        captions: captions.map((caption: any) => ({
          text: caption.text || '',
          start: caption.start || 0,
          duration: caption.duration || 0
        })),
        summary,
        keywords,
        metadata: {
          duration: captions.length * 5, // Rough estimate
          language: options.language || 'en',
          processingTime,
          enhanced: options.enhanceText || false
        }
      };

      logger.info('Mock YouTube transcription completed', {
        executionId,
        videoId: result.videoId,
        title: result.title,
        processingTime,
        captionCount: result.captions.length
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Mock YouTube transcription failed', {
        executionId,
        videoUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      });

      throw error;
    }
  }

  async getAgentStatus(): Promise<{ available: boolean; model: string; tools: string[] }> {
    return {
      available: true,
      model: 'mock-agent',
      tools: ['url_validator', 'youtube_transcript', 'mock_processor']
    };
  }
}
