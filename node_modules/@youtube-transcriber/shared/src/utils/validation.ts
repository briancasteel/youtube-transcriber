/**
 * URL validation utilities
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
 * Extracts YouTube video ID from URL
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!isValidYouTubeUrl(url)) {
    return null;
  }

  for (const pattern of YOUTUBE_URL_PATTERNS) {
    const match = url.match(pattern);
    if (match && match[2]) {
      return match[2];
    }
  }

  return null;
}

/**
 * Normalizes YouTube URL to standard format
 */
export function normalizeYouTubeUrl(url: string): string | null {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    return null;
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
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
 * Validates file ID format
 */
export function isValidFileId(fileId: string): boolean {
  if (!fileId || typeof fileId !== 'string') {
    return false;
  }

  // File ID should be alphanumeric with hyphens/underscores, 8-64 characters
  const fileIdPattern = /^[a-zA-Z0-9-_]{8,64}$/;
  return fileIdPattern.test(fileId);
}

/**
 * Validates language code (ISO 639-1)
 */
export function isValidLanguageCode(code: string): boolean {
  if (!code || typeof code !== 'string') {
    return false;
  }

  // Common language codes for transcription
  const validLanguageCodes = [
    'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
    'ar', 'hi', 'tr', 'pl', 'nl', 'sv', 'da', 'no', 'fi', 'he'
  ];

  return validLanguageCodes.includes(code.toLowerCase());
}

/**
 * Validates duration (in seconds)
 */
export function isValidDuration(duration: number): boolean {
  if (typeof duration !== 'number' || isNaN(duration)) {
    return false;
  }

  // Duration should be positive and less than 4 hours (14400 seconds)
  return duration > 0 && duration <= 14400;
}

/**
 * Validates progress percentage
 */
export function isValidProgress(progress: number): boolean {
  if (typeof progress !== 'number' || isNaN(progress)) {
    return false;
  }

  return progress >= 0 && progress <= 100;
}

/**
 * Validates confidence score
 */
export function isValidConfidence(confidence: number): boolean {
  if (typeof confidence !== 'number' || isNaN(confidence)) {
    return false;
  }

  return confidence >= 0 && confidence <= 1;
}

/**
 * Validates timestamp (in seconds)
 */
export function isValidTimestamp(timestamp: number): boolean {
  if (typeof timestamp !== 'number' || isNaN(timestamp)) {
    return false;
  }

  return timestamp >= 0;
}

/**
 * Validates email format
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

/**
 * Sanitizes text input
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Remove potentially dangerous characters and normalize whitespace
  return text
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Validates and sanitizes user input
 */
export function validateAndSanitizeInput(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }

  return sanitizeText(input);
}

/**
 * Checks if a value is a valid positive integer
 */
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && 
         Number.isInteger(value) && 
         value > 0;
}

/**
 * Checks if a value is a valid non-negative integer
 */
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && 
         Number.isInteger(value) && 
         value >= 0;
}

/**
 * Validates array of strings
 */
export function isValidStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && 
         value.every(item => typeof item === 'string');
}

/**
 * Validates object with string keys
 */
export function isValidStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && 
         value !== null && 
         !Array.isArray(value);
}
