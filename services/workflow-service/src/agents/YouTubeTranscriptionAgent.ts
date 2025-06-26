import { ChatOllama } from "@langchain/ollama";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { IntegratedMediaProcessor } from '../services/IntegratedMediaProcessor';

// Tool definitions
const youtubeValidatorTool = tool(
  async ({ videoUrl }: { videoUrl: string }) => {
    const mediaProcessor = new IntegratedMediaProcessor();
    const validation = await mediaProcessor.validateYouTubeUrl(videoUrl);
    
    // Extract video ID from URL if valid
    let videoId = '';
    if (validation.valid) {
      const match = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
      videoId = match?.[1] || '';
    }
    
    return {
      valid: validation.valid,
      videoId,
      error: validation.error
    };
  },
  {
    name: "youtube_validator",
    description: "Validate YouTube URL format and extract video ID",
    schema: z.object({
      videoUrl: z.string().describe("The YouTube URL to validate")
    })
  }
);

const videoInfoTool = tool(
  async ({ videoUrl }: { videoUrl: string }) => {
    const mediaProcessor = new IntegratedMediaProcessor();
    const videoInfo = await mediaProcessor.getVideoInfo(videoUrl);
    return {
      title: videoInfo.title,
      duration: videoInfo.lengthSeconds,
      description: videoInfo.description,
      thumbnail: videoInfo.thumbnails?.[0]?.url || '',
      videoId: videoInfo.videoId
    };
  },
  {
    name: "video_info",
    description: "Get video metadata including title, duration, and description",
    schema: z.object({
      videoUrl: z.string().describe("The YouTube URL to get info for")
    })
  }
);

const audioExtractorTool = tool(
  async ({ videoUrl, quality = "highestaudio", format = "mp3" }: { 
    videoUrl: string; 
    quality?: string; 
    format?: string; 
  }) => {
    const mediaProcessor = new IntegratedMediaProcessor();
    const result = await mediaProcessor.processVideo(videoUrl, quality, format);
    return {
      audioFile: result.audioFile,
      duration: result.duration,
      videoInfo: result.videoInfo
    };
  },
  {
    name: "audio_extractor",
    description: "Extract audio from YouTube video for transcription",
    schema: z.object({
      videoUrl: z.string().describe("The YouTube URL to extract audio from"),
      quality: z.string().optional().describe("Audio quality (default: highestaudio)"),
      format: z.string().optional().describe("Audio format (default: mp3)")
    })
  }
);

const transcriptionTool = tool(
  async ({ audioFile, language = "en", includeTimestamps = true }: { 
    audioFile: string; 
    language?: string; 
    includeTimestamps?: boolean; 
  }) => {
    const mediaProcessor = new IntegratedMediaProcessor();
    const result = await mediaProcessor.transcribeAudio(audioFile, {
      language,
      includeTimestamps
    });
    return {
      text: result.text,
      segments: result.segments,
      language: result.language,
      duration: result.duration
    };
  },
  {
    name: "transcription",
    description: "Transcribe audio file to text using Whisper",
    schema: z.object({
      audioFile: z.string().describe("Path to the audio file to transcribe"),
      language: z.string().optional().describe("Language code (default: en)"),
      includeTimestamps: z.boolean().optional().describe("Include timestamps in transcription")
    })
  }
);

const textEnhancerTool = tool(
  async ({ text, options = {} }: { 
    text: string; 
    options?: {
      addPunctuation?: boolean;
      fixGrammar?: boolean;
      improveClarity?: boolean;
    };
  }) => {
    const mediaProcessor = new IntegratedMediaProcessor();
    const enhancementOptions = {
      addPunctuation: options.addPunctuation ?? true,
      fixGrammar: options.fixGrammar ?? true,
      improveClarity: options.improveClarity ?? true
    };
    
    const result = await mediaProcessor.enhanceText(text, enhancementOptions);
    return {
      enhancedText: result.enhancedText,
      summary: result.summary,
      keywords: result.keywords,
      improvements: result.improvements
    };
  },
  {
    name: "text_enhancer",
    description: "Enhance transcribed text with AI improvements including punctuation, grammar, and clarity",
    schema: z.object({
      text: z.string().describe("The text to enhance"),
      options: z.object({
        addPunctuation: z.boolean().optional(),
        fixGrammar: z.boolean().optional(),
        improveClarity: z.boolean().optional()
      }).optional()
    })
  }
);

export interface TranscriptionOptions {
  language?: string;
  includeTimestamps?: boolean;
  enhanceText?: boolean;
  audioQuality?: string;
  audioFormat?: string;
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

export class YouTubeTranscriptionAgent {
  private agent: any;
  private tools: any[];

  constructor() {
    this.tools = [
      youtubeValidatorTool,
      videoInfoTool,
      audioExtractorTool,
      transcriptionTool,
      textEnhancerTool
    ];

    this.agent = createReactAgent({
      llm: new ChatOllama({ 
        model: "llama3.2", 
        temperature: 0, 
        format: "json",
        baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434"
      }),
      tools: this.tools,
    });
  }

  async transcribe(videoUrl: string, options: TranscriptionOptions = {}): Promise<TranscriptionResult> {
    const startTime = Date.now();
    const executionId = uuidv4();

    logger.info('Starting YouTube transcription', {
      executionId,
      videoUrl,
      options
    });

    try {
      const systemPrompt = `
You're a YouTube transcription agent specialized in processing YouTube videos into high-quality transcriptions.

Your workflow should be:
1. Validate the YouTube URL and extract video ID
2. Get video information (title, duration, description)
3. Extract audio from the video
4. Transcribe the audio to text
5. Enhance the text if requested
6. Generate a summary and extract keywords
7. Return structured results

Available tools:
- youtube_validator: Validate YouTube URL and extract video ID
- video_info: Get video metadata (title, duration, description, thumbnail)
- audio_extractor: Extract audio from YouTube video
- transcription: Transcribe audio to text using Whisper
- text_enhancer: Enhance text with AI improvements

Options provided:
- Language: ${options.language || 'en'}
- Include timestamps: ${options.includeTimestamps ?? true}
- Enhance text: ${options.enhanceText ?? true}
- Audio quality: ${options.audioQuality || 'highestaudio'}
- Audio format: ${options.audioFormat || 'mp3'}

Return the final result in this exact JSON structure:
{
  "videoId": "extracted_video_id",
  "title": "video_title_from_metadata",
  "description": "ai_generated_summary_of_content",
  "captions": [
    {
      "text": "transcribed_text_segment",
      "start": timestamp_in_seconds,
      "duration": segment_duration
    }
  ],
  "summary": "concise_summary_of_video_content",
  "keywords": ["key", "words", "from", "content"],
  "metadata": {
    "duration": video_duration_seconds,
    "language": "detected_or_specified_language",
    "processingTime": processing_time_ms,
    "enhanced": true_if_text_was_enhanced
  }
}

Important: 
- Always validate the URL first
- Get video info before processing
- Use appropriate audio quality for transcription
- Enhance text only if requested
- Generate meaningful summaries and keywords
- Handle errors gracefully and provide helpful error messages
- Ensure all fields are populated with actual data
`;

      const response = await this.agent.invoke({
        messages: [
          new SystemMessage(systemPrompt),
          new HumanMessage(`Please transcribe this YouTube video: ${videoUrl}`)
        ],
      });

      const processingTime = Date.now() - startTime;
      
      // Extract the final message content
      const finalMessage = response.messages[response.messages.length - 1];
      let result: TranscriptionResult;

      try {
        // Parse the JSON response from the agent
        const parsedResult = typeof finalMessage.content === 'string' 
          ? JSON.parse(finalMessage.content)
          : finalMessage.content;

        result = {
          ...parsedResult,
          metadata: {
            ...parsedResult.metadata,
            processingTime
          }
        };
      } catch (parseError) {
        logger.error('Failed to parse agent response', {
          executionId,
          error: parseError instanceof Error ? parseError.message : 'Unknown error',
          response: finalMessage.content
        });
        
        throw new Error('Agent returned invalid response format');
      }

      logger.info('YouTube transcription completed', {
        executionId,
        videoId: result.videoId,
        title: result.title,
        processingTime,
        enhanced: result.metadata.enhanced
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('YouTube transcription failed', {
        executionId,
        videoUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      });

      throw error;
    }
  }

  async getAgentStatus(): Promise<{ available: boolean; model: string; tools: string[] }> {
    try {
      return {
        available: true,
        model: "llama3.2",
        tools: this.tools.map(tool => tool.name)
      };
    } catch (error) {
      return {
        available: false,
        model: "llama3.2",
        tools: []
      };
    }
  }
}
