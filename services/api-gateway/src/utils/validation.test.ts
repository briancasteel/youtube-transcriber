import {
  isValidYouTubeUrl,
  isValidJobId,
  validateStartTranscriptionRequest,
  validateGetVideoInfoRequest,
  createApiResponse,
  createErrorResponse,
} from './validation';

describe('Validation Utils', () => {
  describe('isValidYouTubeUrl', () => {
    it('should validate standard YouTube URLs', () => {
      const validUrls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'http://youtube.com/watch?v=dQw4w9WgXcQ',
      ];

      validUrls.forEach(url => {
        expect(isValidYouTubeUrl(url)).toBe(true);
      });
    });

    it('should validate YouTube embed URLs', () => {
      const validUrls = [
        'https://www.youtube.com/embed/dQw4w9WgXcQ',
        'http://www.youtube.com/embed/dQw4w9WgXcQ',
        'https://youtube.com/embed/dQw4w9WgXcQ',
      ];

      validUrls.forEach(url => {
        expect(isValidYouTubeUrl(url)).toBe(true);
      });
    });

    it('should validate YouTube short URLs', () => {
      const validUrls = [
        'https://youtu.be/dQw4w9WgXcQ',
        'http://youtu.be/dQw4w9WgXcQ',
      ];

      validUrls.forEach(url => {
        expect(isValidYouTubeUrl(url)).toBe(true);
      });
    });

    it('should validate YouTube v/ URLs', () => {
      const validUrls = [
        'https://www.youtube.com/v/dQw4w9WgXcQ',
        'http://www.youtube.com/v/dQw4w9WgXcQ',
        'https://youtube.com/v/dQw4w9WgXcQ',
      ];

      validUrls.forEach(url => {
        expect(isValidYouTubeUrl(url)).toBe(true);
      });
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = [
        '',
        null,
        undefined,
        'not-a-url',
        'https://google.com',
        'https://vimeo.com/123456',
        'https://youtube.com/watch?v=invalid',
        'https://youtube.com/watch?v=',
        'https://youtube.com/watch',
        'ftp://youtube.com/watch?v=dQw4w9WgXcQ',
      ];

      invalidUrls.forEach(url => {
        expect(isValidYouTubeUrl(url as any)).toBe(false);
      });
    });

    it('should handle non-string inputs', () => {
      const invalidInputs = [123, {}, [], true, false];

      invalidInputs.forEach(input => {
        expect(isValidYouTubeUrl(input as any)).toBe(false);
      });
    });
  });

  describe('isValidJobId', () => {
    it('should validate correct job IDs', () => {
      const validJobIds = [
        'abc12345',
        'job-123-456',
        'JOB123ABC',
        'a1b2c3d4-e5f6-7890',
        '123456789012345678901234567890123456', // 36 chars
      ];

      validJobIds.forEach(jobId => {
        expect(isValidJobId(jobId)).toBe(true);
      });
    });

    it('should reject invalid job IDs', () => {
      const invalidJobIds = [
        '',
        null,
        undefined,
        'short', // too short
        'a'.repeat(37), // too long
        'job_id_with_underscores',
        'job id with spaces',
        'job@id#with$special%chars',
        'job.id.with.dots',
      ];

      invalidJobIds.forEach(jobId => {
        expect(isValidJobId(jobId as any)).toBe(false);
      });
    });

    it('should handle non-string inputs', () => {
      const invalidInputs = [123, {}, [], true, false];

      invalidInputs.forEach(input => {
        expect(isValidJobId(input as any)).toBe(false);
      });
    });
  });

  describe('validateStartTranscriptionRequest', () => {
    it('should validate correct transcription request', () => {
      const validRequest = {
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        options: {
          language: 'en',
          model: 'whisper-1',
        },
      };

      const result = validateStartTranscriptionRequest(validRequest);
      expect(result).toEqual({
        youtubeUrl: validRequest.youtubeUrl,
        options: validRequest.options,
      });
    });

    it('should validate request without options', () => {
      const validRequest = {
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      };

      const result = validateStartTranscriptionRequest(validRequest);
      expect(result).toEqual({
        youtubeUrl: validRequest.youtubeUrl,
        options: {},
      });
    });

    it('should throw error for missing youtubeUrl', () => {
      const invalidRequest = {
        options: {},
      };

      expect(() => validateStartTranscriptionRequest(invalidRequest))
        .toThrow('youtubeUrl is required and must be a string');
    });

    it('should throw error for invalid youtubeUrl type', () => {
      const invalidRequest = {
        youtubeUrl: 123,
      };

      expect(() => validateStartTranscriptionRequest(invalidRequest))
        .toThrow('youtubeUrl is required and must be a string');
    });

    it('should throw error for invalid YouTube URL', () => {
      const invalidRequest = {
        youtubeUrl: 'https://google.com',
      };

      expect(() => validateStartTranscriptionRequest(invalidRequest))
        .toThrow('youtubeUrl must be a valid YouTube URL');
    });

    it('should throw error for non-object input', () => {
      expect(() => validateStartTranscriptionRequest(null))
        .toThrow('Request body must be an object');

      expect(() => validateStartTranscriptionRequest('string'))
        .toThrow('Request body must be an object');

      expect(() => validateStartTranscriptionRequest(123))
        .toThrow('Request body must be an object');
    });
  });

  describe('validateGetVideoInfoRequest', () => {
    it('should validate correct video info request', () => {
      const validRequest = {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      };

      const result = validateGetVideoInfoRequest(validRequest);
      expect(result).toEqual({
        url: validRequest.url,
      });
    });

    it('should throw error for missing url', () => {
      const invalidRequest = {};

      expect(() => validateGetVideoInfoRequest(invalidRequest))
        .toThrow('url parameter is required and must be a string');
    });

    it('should throw error for invalid url type', () => {
      const invalidRequest = {
        url: 123,
      };

      expect(() => validateGetVideoInfoRequest(invalidRequest))
        .toThrow('url parameter is required and must be a string');
    });

    it('should throw error for invalid YouTube URL', () => {
      const invalidRequest = {
        url: 'https://google.com',
      };

      expect(() => validateGetVideoInfoRequest(invalidRequest))
        .toThrow('url must be a valid YouTube URL');
    });

    it('should throw error for non-object input', () => {
      expect(() => validateGetVideoInfoRequest(null))
        .toThrow('Query parameters must be provided');

      expect(() => validateGetVideoInfoRequest('string'))
        .toThrow('Query parameters must be provided');
    });
  });

  describe('createApiResponse', () => {
    it('should create successful response with data', () => {
      const data = { message: 'success' };
      const response = createApiResponse(data);

      expect(response).toMatchObject({
        success: true,
        data,
        error: undefined,
      });
      expect(response.timestamp).toBeDefined();
      expect(response.requestId).toBeDefined();
      expect(typeof response.timestamp).toBe('string');
      expect(typeof response.requestId).toBe('string');
    });

    it('should create error response', () => {
      const data = null;
      const response = createApiResponse(data, false, 'Something went wrong');

      expect(response).toMatchObject({
        success: false,
        data: undefined,
        error: 'Something went wrong',
      });
      expect(response.timestamp).toBeDefined();
      expect(response.requestId).toBeDefined();
    });

    it('should handle different data types', () => {
      const testCases = [
        { input: 'string', expected: 'string' },
        { input: 123, expected: 123 },
        { input: [], expected: [] },
        { input: {}, expected: {} },
        { input: null, expected: null },
      ];

      testCases.forEach(({ input, expected }) => {
        const response = createApiResponse(input);
        expect(response.data).toEqual(expected);
        expect(response.success).toBe(true);
      });
    });
  });

  describe('createErrorResponse', () => {
    it('should create basic error response', () => {
      const error = 'Something went wrong';
      const response = createErrorResponse(error);

      expect(response).toMatchObject({
        error,
        code: undefined,
        details: undefined,
      });
      expect(response.timestamp).toBeDefined();
      expect(response.requestId).toBeDefined();
    });

    it('should create error response with code', () => {
      const error = 'Validation failed';
      const code = 'VALIDATION_ERROR';
      const response = createErrorResponse(error, code);

      expect(response).toMatchObject({
        error,
        code,
        details: undefined,
      });
    });

    it('should create error response with details', () => {
      const error = 'Validation failed';
      const code = 'VALIDATION_ERROR';
      const details = { field: 'youtubeUrl', message: 'Invalid URL' };
      const response = createErrorResponse(error, code, details);

      expect(response).toMatchObject({
        error,
        code,
        details,
      });
    });
  });
});
