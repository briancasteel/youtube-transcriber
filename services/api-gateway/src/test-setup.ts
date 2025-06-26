import { jest } from '@jest/globals';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.WORKFLOW_SERVICE_URL = 'http://test-workflow:8001';
process.env.VIDEO_PROCESSOR_URL = 'http://test-video:8002';
process.env.TRANSCRIPTION_SERVICE_URL = 'http://test-transcription:8003';
process.env.FILE_STORAGE_URL = 'http://test-storage:8004';
process.env.LLM_SERVICE_URL = 'http://test-llm:8005';

// Mock axios globally
jest.mock('axios');

// Suppress console logs during tests unless explicitly needed
const originalConsole = console;
beforeAll(() => {
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});
