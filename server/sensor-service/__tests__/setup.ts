import { jest } from '@jest/globals';

jest.setTimeout(30000);

beforeAll(() => {
    process.env.NODE_ENV = 'test';
});

// Suppress expected alert/diagnostic console output from production modules
// (e.g. threshold violation warnings) so test runs stay readable.
beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
});