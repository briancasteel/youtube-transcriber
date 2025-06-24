/**
 * Simple validation utilities for API Gateway
 */

// YouTube URL patterns
const YOUTUBE_URL_PATTERNS = [
  /^https?:\/\/(www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  /^https?:\/\/(www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{11})/,
  /^https?:\/\/(www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
];

/**
 * Validates if a URL is a valid YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  return YOUTUBE_URL_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Validates job ID format
 */
export function isValidJobId(jobId: string): boolean {
  if (!jobId || typeof jobId !== 'string') {
    return false;
  }

  // Job ID should be alphanumeric with hyphens, 8-36 characters
  const jobIdPattern = /^[a-zA-Z0-9-]{8,36}$/;
  return jobIdPattern.test(jobId);
}

/**
 * Simple request validation using Zod-like interface
 */
export function validateStartTranscriptionRequest(data: any) {
  if (!data || typeof data !== 'object') {
    throw new Error('Request body must be an object');
  }

  if (!data.youtubeUrl || typeof data.youtubeUrl !== 'string') {
    throw new Error('youtubeUrl is required and must be a string');
  }

  if (!isValidYouTubeUrl(data.youtubeUrl)) {
    throw new Error('youtubeUrl must be a valid YouTube URL');
  }

  return {
    youtubeUrl: data.youtubeUrl,
    options: data.options || {}
  };
}

/**
 * Validate video info request
 */
export function validateGetVideoInfoRequest(data: any) {
  if (!data || typeof data !== 'object') {
    throw new Error('Query parameters must be provided');
  }

  if (!data.url || typeof data.url !== 'string') {
    throw new Error('url parameter is required and must be a string');
  }

  if (!isValidYouTubeUrl(data.url)) {
    throw new Error('url must be a valid YouTube URL');
  }

  return {
    url: data.url
  };
}

/**
 * Create API response wrapper
 */
export function createApiResponse<T>(data: T, success: boolean = true, error?: string) {
  return {
    success,
    data: success ? data : undefined,
    error: error,
    timestamp: new Date().toISOString(),
    requestId: Math.random().toString(36).substring(2, 15),
  };
}

/**
 * Create error response
 */
export function createErrorResponse(error: string, code?: string, details?: Record<string, any>) {
  return {
    error,
    code,
    details,
    timestamp: new Date().toISOString(),
    requestId: Math.random().toString(36).substring(2, 15),
  };
}
