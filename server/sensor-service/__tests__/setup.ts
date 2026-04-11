import { jest } from '@jest/globals';

jest.setTimeout(30000);

beforeAll(() => {
    process.env.NODE_ENV = 'test';
});

afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
});