import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  context?: number[];
  stream?: boolean;
  raw?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repeat_penalty?: number;
    seed?: number;
    num_predict?: number;
    stop?: string[];
  };
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface TextEnhancementOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  addPunctuation?: boolean;
  fixGrammar?: boolean;
  improveClarity?: boolean;
  generateSummary?: boolean;
  extractKeywords?: boolean;
}

export interface EnhancedText {
  originalText: string;
  enhancedText: string;
  summary?: string;
  keywords?: string[];
  improvements: {
    punctuationAdded: boolean;
    grammarFixed: boolean;
    clarityImproved: boolean;
  };
}

export class OllamaService {
  private client: AxiosInstance;
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    this.baseUrl = process.env['OLLAMA_URL'] || 'http://localhost:11434';
    this.defaultModel = process.env['OLLAMA_DEFAULT_MODEL'] || 'llama2';
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 300000, // 5 minutes timeout for LLM operations
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async initialize(): Promise<void> {
    try {
      // Test connection to Ollama
      await this.client.get('/api/tags');
      logger.info('OllamaService initialized', { 
        baseUrl: this.baseUrl,
        defaultModel: this.defaultModel 
      });
    } catch (error) {
      logger.error('Failed to initialize OllamaService', {
        baseUrl: this.baseUrl,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getAvailableModels(): Promise<OllamaModel[]> {
    try {
      logger.debug('Fetching available Ollama models');
      
      const response = await this.client.get('/api/tags');
      const models = response.data.models || [];
      
      logger.info('Retrieved available models', { 
        modelCount: models.length,
        models: models.map((m: OllamaModel) => m.name)
      });
      
      return models;
    } catch (error) {
      logger.error('Failed to get available models', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async pullModel(modelName: string): Promise<void> {
    try {
      logger.info('Pulling Ollama model', { modelName });
      
      const response = await this.client.post('/api/pull', {
        name: modelName
      });
      
      logger.info('Model pull completed', { modelName });
    } catch (error) {
      logger.error('Failed to pull model', {
        modelName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async generateText(request: OllamaGenerateRequest): Promise<OllamaGenerateResponse> {
    try {
      logger.debug('Generating text with Ollama', {
        model: request.model,
        promptLength: request.prompt.length,
        stream: request.stream || false
      });

      const response = await this.client.post('/api/generate', {
        ...request,
        stream: false // Force non-streaming for simplicity
      });

      logger.debug('Text generation completed', {
        model: request.model,
        responseLength: response.data.response?.length || 0,
        totalDuration: response.data.total_duration
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to generate text', {
        model: request.model,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async enhanceTranscription(
    transcriptionText: string,
    options: TextEnhancementOptions = {}
  ): Promise<EnhancedText> {
    const {
      model = this.defaultModel,
      temperature = 0.3,
      maxTokens = 2048,
      addPunctuation = true,
      fixGrammar = true,
      improveClarity = true,
      generateSummary = false,
      extractKeywords = false
    } = options;

    logger.info('Enhancing transcription text', {
      model,
      textLength: transcriptionText.length,
      addPunctuation,
      fixGrammar,
      improveClarity,
      generateSummary,
      extractKeywords
    });

    try {
      const result: EnhancedText = {
        originalText: transcriptionText,
        enhancedText: transcriptionText,
        improvements: {
          punctuationAdded: false,
          grammarFixed: false,
          clarityImproved: false
        }
      };

      // Step 1: Enhance the text (punctuation, grammar, clarity)
      if (addPunctuation || fixGrammar || improveClarity) {
        const enhancementPrompt = this.buildEnhancementPrompt(
          transcriptionText,
          { addPunctuation, fixGrammar, improveClarity }
        );

        const enhancementResponse = await this.generateText({
          model,
          prompt: enhancementPrompt,
          options: {
            temperature,
            num_predict: maxTokens
          }
        });

        result.enhancedText = enhancementResponse.response.trim();
        result.improvements = {
          punctuationAdded: addPunctuation,
          grammarFixed: fixGrammar,
          clarityImproved: improveClarity
        };
      }

      // Step 2: Generate summary if requested
      if (generateSummary) {
        const summaryPrompt = this.buildSummaryPrompt(result.enhancedText);
        
        const summaryResponse = await this.generateText({
          model,
          prompt: summaryPrompt,
          options: {
            temperature: 0.5,
            num_predict: 500
          }
        });

        result.summary = summaryResponse.response.trim();
      }

      // Step 3: Extract keywords if requested
      if (extractKeywords) {
        const keywordsPrompt = this.buildKeywordsPrompt(result.enhancedText);
        
        const keywordsResponse = await this.generateText({
          model,
          prompt: keywordsPrompt,
          options: {
            temperature: 0.3,
            num_predict: 200
          }
        });

        // Parse keywords from response
        result.keywords = this.parseKeywords(keywordsResponse.response);
      }

      logger.info('Transcription enhancement completed', {
        originalLength: result.originalText.length,
        enhancedLength: result.enhancedText.length,
        hasSummary: !!result.summary,
        keywordCount: result.keywords?.length || 0
      });

      return result;

    } catch (error) {
      logger.error('Failed to enhance transcription', {
        textLength: transcriptionText.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private buildEnhancementPrompt(
    text: string,
    options: { addPunctuation: boolean; fixGrammar: boolean; improveClarity: boolean }
  ): string {
    const tasks: string[] = [];
    
    if (options.addPunctuation) {
      tasks.push('add proper punctuation');
    }
    if (options.fixGrammar) {
      tasks.push('fix grammar errors');
    }
    if (options.improveClarity) {
      tasks.push('improve clarity and readability');
    }

    const taskList = tasks.join(', ');

    return `Please improve the following transcribed text by ${taskList}. Keep the original meaning and content intact, but make it more readable and professional. Only return the improved text without any additional commentary.

Original text:
${text}

Improved text:`;
  }

  private buildSummaryPrompt(text: string): string {
    return `Please provide a concise summary of the following text. Focus on the main points and key information. Keep the summary to 2-3 sentences.

Text:
${text}

Summary:`;
  }

  private buildKeywordsPrompt(text: string): string {
    return `Please extract the most important keywords and key phrases from the following text. Return them as a comma-separated list. Focus on the main topics, concepts, and important terms.

Text:
${text}

Keywords:`;
  }

  private parseKeywords(keywordsResponse: string): string[] {
    try {
      // Clean up the response and split by commas
      const keywords = keywordsResponse
        .replace(/^(Keywords?:?\s*)/i, '') // Remove "Keywords:" prefix
        .split(',')
        .map(keyword => keyword.trim())
        .filter(keyword => keyword.length > 0)
        .slice(0, 20); // Limit to 20 keywords

      return keywords;
    } catch (error) {
      logger.warn('Failed to parse keywords', {
        response: keywordsResponse,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/tags');
      return response.status === 200;
    } catch (error) {
      logger.warn('Ollama health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async getModelInfo(modelName: string): Promise<any> {
    try {
      const response = await this.client.post('/api/show', {
        name: modelName
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to get model info', {
        modelName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}
