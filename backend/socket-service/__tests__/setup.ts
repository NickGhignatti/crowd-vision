import { jest } from '@jest/globals';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

