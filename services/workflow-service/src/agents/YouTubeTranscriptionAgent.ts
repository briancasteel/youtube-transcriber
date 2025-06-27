import { ChatOllama } from "@langchain/ollama";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import logger from '../utils/logger';

// YouTube transcript tool using external service (similar to wxflows pattern)
const youtubeTranscriptTool = tool(
  async ({ videoUrl, langCode = "en" }: { videoUrl: string; langCode?: string }) => {
    const toolCallId = Math.random().toString(36).substr(2, 9);
    logger.info('Tool called: youtube_transcript', { toolCallId, videoUrl, langCode });
    
    try {
      // Use the same external service as the reference implementation
      const response = await axios.post('https://tactiq-apps-prod.tactiq.io/transcript', {
        videoUrl,
        langCode
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = {
        title: response.data.title || 'Unknown Title',
        captions: response.data.captions || []
      };

      logger.info('Tool completed: youtube_transcript', { 
        toolCallId, 
        title: result.title,
        captionCount: result.captions.length 
      });
      
      return result;
    } catch (error) {
      logger.error('YouTube transcript tool failed', {
        toolCallId,
        error: error instanceof Error ? error.message : 'Unknown error',
        videoUrl
      });
      throw new Error(`Failed to get transcript: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
  {
    name: "youtube_transcript",
    description: "Get YouTube video transcript and metadata",
    schema: z.object({
      videoUrl: z.string().describe("The YouTube URL to get transcript for"),
      langCode: z.string().optional().describe("Language code (default: en)")
    })
  }
);

// Simple URL validator tool
const urlValidatorTool = tool(
  async ({ videoUrl }: { videoUrl: string }) => {
    const toolCallId = Math.random().toString(36).substr(2, 9);
    logger.info('Tool called: url_validator', { toolCallId, videoUrl });
    
    // Extract video ID from URL
    let videoId = '';
    const match = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    
    if (match && match[1]) {
      videoId = match[1];
    }
    
    const result = {
      valid: !!videoId,
      videoId: videoId || '',
      error: videoId ? null : 'Invalid YouTube URL format'
    };
    
    logger.info('Tool completed: url_validator', { toolCallId, result });
    return result;
  },
  {
    name: "url_validator",
    description: "Validate YouTube URL and extract video ID",
    schema: z.object({
      videoUrl: z.string().describe("The YouTube URL to validate")
    })
  }
);

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

export class YouTubeTranscriptionAgent {
  private agent: any;
  private tools: any[];
  private ollamaUrl: string;
  private ollamaModel: string;

  constructor() {
    this.ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
    this.ollamaModel = process.env.OLLAMA_DEFAULT_MODEL || "llama3.2";
    
    logger.info('Initializing YouTubeTranscriptionAgent', {
      ollamaUrl: this.ollamaUrl,
      ollamaModel: this.ollamaModel
    });
    
    this.tools = [
      urlValidatorTool,
      youtubeTranscriptTool
    ];

    logger.info('Creating ChatOllama instance', {
      model: this.ollamaModel,
      baseUrl: this.ollamaUrl,
      temperature: 0,
      format: "json"
    });

    const chatOllama = new ChatOllama({ 
      model: this.ollamaModel, 
      temperature: 0, 
      format: "json",
      baseUrl: this.ollamaUrl
    });

    logger.info('Creating ReAct agent with ChatOllama and tools', {
      toolCount: this.tools.length,
      toolNames: this.tools.map(tool => tool.name)
    });

    this.agent = createReactAgent({
      llm: chatOllama,
      tools: this.tools,
    });

    logger.info('YouTubeTranscriptionAgent initialized successfully');
  }

  private async testOllamaConnection(): Promise<void> {
    try {
      logger.info('Testing Ollama connection', {
        url: this.ollamaUrl,
        model: this.ollamaModel
      });
      
      // Test if Ollama is running
      const healthResponse = await axios.get(`${this.ollamaUrl}/api/tags`, {
        timeout: 5000
      });

      if (healthResponse.status !== 200) {
        throw new Error(`Ollama health check failed with status: ${healthResponse.status}`);
      }

      // Check if the required model is available
      const models = healthResponse.data.models || [];
      const modelExists = models.some((model: any) => model.name === this.ollamaModel);

      if (!modelExists) {
        logger.warn('Required model not found, attempting to pull', {
          model: this.ollamaModel,
          availableModels: models.map((m: any) => m.name)
        });

        // Attempt to pull the model
        await axios.post(`${this.ollamaUrl}/api/pull`, {
          name: this.ollamaModel
        }, {
          timeout: 300000 // 5 minutes for model pull
        });

        logger.info('Model pulled successfully', { model: this.ollamaModel });
      }

      logger.info('Ollama connection test successful', {
        url: this.ollamaUrl,
        model: this.ollamaModel,
        modelsAvailable: models.length
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Ollama connection test failed', {
        url: this.ollamaUrl,
        model: this.ollamaModel,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });

      throw new Error(`Cannot connect to Ollama at ${this.ollamaUrl}: ${errorMessage}`);
    }
  }

  async transcribe(videoUrl: string, options: TranscriptionOptions = {}): Promise<TranscriptionResult> {
    const startTime = Date.now();
    const executionId = uuidv4();

    logger.info('Starting YouTube transcription', {
      executionId,
      videoUrl,
      options,
      ollamaUrl: this.ollamaUrl,
      ollamaModel: this.ollamaModel
    });

    try {
      // Test Ollama connection before processing
      await this.testOllamaConnection();
      
      logger.info('Ollama connection test passed, starting agent invocation', { executionId });
      
      const systemPrompt = `
You're a YouTube transcription agent.

You should retrieve the video id for a given YouTube url and return the title and description of the video. 
Also retrieve the transcript for the youtube video using the transcript tool.
Use all tools at your disposal.

You have the following tools:
1. url_validator: Validate YouTube URL and extract video ID
2. youtube_transcript: Get transcript and title for YouTube video
   - Parameters: { "videoUrl": "https://www.youtube.com/watch?v=VIDEO_ID", "langCode": "en" }

Generate the description by summarizing the transcript content.

Return output in the following JSON structure:
{
    "videoId": "ID of the video",
    "title": "video title from transcript service",
    "description": "AI-generated summary of the transcript content",
    "captions": [
        {
            "text": "transcript text segment",
            "start": start_time_in_seconds,
            "duration": duration_in_seconds
        }
    ],
    "summary": "concise summary of video content",
    "keywords": ["key", "words", "from", "content"],
    "metadata": {
        "duration": total_video_duration_seconds,
        "language": "${options.language || 'en'}",
        "processingTime": 0,
        "enhanced": false
    }
}

Do not return the data without populating all fields with actual data.
Always validate the URL first, then get the transcript.
`;

      logger.info('Invoking agent with messages', {
        executionId,
        systemPromptLength: systemPrompt.length,
        videoUrl
      });

      const response = await this.agent.invoke({
        messages: [
          new SystemMessage(systemPrompt),
          new HumanMessage(`Here is the YouTube URL: ${videoUrl}.`)
        ],
      });

      logger.info('Agent invocation completed', {
        executionId,
        responseMessageCount: response.messages?.length || 0,
        responseType: typeof response
      });

      const processingTime = Date.now() - startTime;
      
      // Extract the final message content
      const finalMessage = response.messages[response.messages.length - 1];
      
      logger.info('Processing agent response', {
        executionId,
        finalMessageType: typeof finalMessage?.content,
        finalMessageLength: typeof finalMessage?.content === 'string' ? finalMessage.content.length : 0
      });

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
        captionCount: result.captions?.length || 0
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
      // Test Ollama connection to determine availability
      await this.testOllamaConnection();
      
      return {
        available: true,
        model: this.ollamaModel,
        tools: this.tools.map(tool => tool.name)
      };
    } catch (error) {
      logger.warn('Agent status check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ollamaUrl: this.ollamaUrl,
        model: this.ollamaModel
      });
      
      return {
        available: false,
        model: this.ollamaModel,
        tools: this.tools.map(tool => tool.name)
      };
    }
  }
}
