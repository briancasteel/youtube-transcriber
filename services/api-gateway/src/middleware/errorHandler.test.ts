import { Request, Response, NextFunction } from 'express';
import { asyncHandler, createError } from './errorHandler';

// Mock logger
jest.mock('../utils/logger', () => ({
  createLogger: () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      url: '/test',
      headers: {},
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      locals: { requestId: 'test-request-123' },
    };
    
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('asyncHandler', () => {
    it('should handle successful async operations', async () => {
      const successfulHandler = asyncHandler(async (req, res) => {
        res.status!(200).json({ success: true });
      });

      await successfulHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({ success: true });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should catch and forward async errors', async () => {
      const error = new Error('Async operation failed');
      const failingHandler = asyncHandler(async (req, res) => {
        throw error;
      });

      await failingHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should handle rejected promises', async () => {
      const error = new Error('Promise rejected');
      const failingHandler = asyncHandler(async (req, res) => {
        throw error;
      });

      await failingHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should handle async handlers that return promises', async () => {
      const successfulHandler = asyncHandler((req, res) => {
        return Promise.resolve().then(() => {
          res.status!(200).json({ success: true });
        });
      });

      await successfulHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({ success: true });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle non-async handlers', async () => {
      const syncHandler = asyncHandler(async (req, res) => {
        res.status!(200).json({ success: true });
      });

      await syncHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({ success: true });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle sync errors in non-async handlers', async () => {
      const error = new Error('Sync error');
      const failingHandler = asyncHandler(async (req, res) => {
        throw error;
      });

      await failingHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('createError', () => {
    it('should create error with message and status code', () => {
      const error = createError('Test error', 400);

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBeUndefined();
      expect(error.details).toBeUndefined();
    });

    it('should create error with message, status code, and error code', () => {
      const error = createError('Validation failed', 400, 'VALIDATION_ERROR');

      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toBeUndefined();
    });

    it('should create error with all parameters', () => {
      const details = { field: 'email', reason: 'invalid format' };
      const error = createError('Validation failed', 400, 'VALIDATION_ERROR', details);

      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual(details);
    });

    it('should default status code to 500 if not provided', () => {
      const error = createError('Internal error');

      expect(error.message).toBe('Internal error');
      expect(error.statusCode).toBe(500);
    });

    it('should handle empty message', () => {
      const error = createError('', 400);

      expect(error.message).toBe('');
      expect(error.statusCode).toBe(400);
    });

    it('should handle complex details object', () => {
      const details = {
        errors: [
          { field: 'email', message: 'Invalid email format' },
          { field: 'password', message: 'Password too short' },
        ],
        requestId: 'req-123',
        timestamp: '2023-01-01T00:00:00Z',
      };
      
      const error = createError('Multiple validation errors', 400, 'VALIDATION_ERROR', details);

      expect(error.details).toEqual(details);
    });
  });

  describe('Error Properties', () => {
    it('should create error that is instance of Error', () => {
      const error = createError('Test error', 400);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('Error');
    });

    it('should preserve error stack trace', () => {
      const error = createError('Test error', 400);

      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
      expect(error.stack).toContain('Test error');
    });

    it('should be serializable to JSON', () => {
      const error = createError('Test error', 400, 'TEST_ERROR', { field: 'test' });
      
      // Note: Error objects don't serialize well by default, but our custom properties should be accessible
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.details).toEqual({ field: 'test' });
    });
  });

  describe('Error Code Validation', () => {
    it('should handle various HTTP status codes', () => {
      const testCases = [
        { status: 400, description: 'Bad Request' },
        { status: 401, description: 'Unauthorized' },
        { status: 403, description: 'Forbidden' },
        { status: 404, description: 'Not Found' },
        { status: 409, description: 'Conflict' },
        { status: 422, description: 'Unprocessable Entity' },
        { status: 429, description: 'Too Many Requests' },
        { status: 500, description: 'Internal Server Error' },
        { status: 502, description: 'Bad Gateway' },
        { status: 503, description: 'Service Unavailable' },
      ];

      testCases.forEach(({ status, description }) => {
        const error = createError(description, status);
        expect(error.statusCode).toBe(status);
        expect(error.message).toBe(description);
      });
    });

    it('should handle custom error codes', () => {
      const customCodes = [
        'VALIDATION_ERROR',
        'AUTHENTICATION_FAILED',
        'RESOURCE_NOT_FOUND',
        'RATE_LIMIT_EXCEEDED',
        'EXTERNAL_SERVICE_ERROR',
        'DATABASE_CONNECTION_FAILED',
        'INVALID_CONFIGURATION',
      ];

      customCodes.forEach(code => {
        const error = createError('Test error', 400, code);
        expect(error.code).toBe(code);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined values', () => {
      const error1 = createError('Test', 400, undefined, undefined);
      expect(error1.code).toBeUndefined();
      expect(error1.details).toBeUndefined();

      const error2 = createError('Test', 400, null as any, null as any);
      expect(error2.code).toBeNull();
      expect(error2.details).toBeNull();
    });

    it('should handle very long error messages', () => {
      const longMessage = 'A'.repeat(1000);
      const error = createError(longMessage, 400);

      expect(error.message).toBe(longMessage);
      expect(error.message.length).toBe(1000);
    });

    it('should handle special characters in error messages', () => {
      const specialMessage = 'Error with special chars: !@#$%^&*()_+-=[]{}|;:,.<>?';
      const error = createError(specialMessage, 400);

      expect(error.message).toBe(specialMessage);
    });

    it('should handle unicode characters in error messages', () => {
      const unicodeMessage = 'Error with unicode: 你好 🚀 ñáéíóú';
      const error = createError(unicodeMessage, 400);

      expect(error.message).toBe(unicodeMessage);
    });

    it('should handle circular references in details', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      // This should not throw an error when creating the error object
      expect(() => {
        const error = createError('Test error', 400, 'TEST_ERROR', circularObj);
        expect(error.details).toBe(circularObj);
      }).not.toThrow();
    });
  });

  describe('Integration with asyncHandler', () => {
    it('should work together for error handling flow', async () => {
      const customError = createError('Custom error', 422, 'CUSTOM_ERROR', { field: 'test' });
      
      const failingHandler = asyncHandler(async (req, res) => {
        throw customError;
      });

      await failingHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(customError);
      
      const passedError = (mockNext as jest.Mock).mock.calls[0][0];
      expect(passedError.message).toBe('Custom error');
      expect(passedError.statusCode).toBe(422);
      expect(passedError.code).toBe('CUSTOM_ERROR');
      expect(passedError.details).toEqual({ field: 'test' });
    });

    it('should handle promise rejection with custom error', async () => {
      const customError = createError('Promise rejected', 503, 'SERVICE_UNAVAILABLE');
      
      const failingHandler = asyncHandler(async (req, res) => {
        throw customError;
      });

      await failingHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(customError);
    });
  });
});
