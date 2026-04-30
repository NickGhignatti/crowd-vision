import mongoose from "mongoose";

import { jest } from "@jest/globals";

// Mock openid-client entirely to avoid ESM parsing issues
jest.mock("openid-client", () => ({
  discovery: jest.fn(),
  randomPKCECodeVerifier: jest.fn(() => "mock-verifier"),
  calculatePKCECodeChallenge: jest.fn(() => "mock-challenge"),
  buildAuthorizationUrl: jest.fn(() => new URL("http://mock-auth-url")),
  authorizationCodeGrant: jest.fn(),
}));

/**
 * Each test file connects its own mongoose instance to the shared MongoDB
 * that was already started by globalSetup.cjs. No MongoMemoryServer is
 * created here — that would race against other parallel test files.
 */
beforeAll(async () => {
  // Each Jest worker gets its own database within the shared MongoMemoryServer,
  // so parallel test files can't delete each other's data mid-test.
  const baseUri = process.env.MONGO_URI!;
  const dbName = `testdb_worker_${process.env.JEST_WORKER_ID ?? '1'}`;
  const uri = baseUri.endsWith('/') ? `${baseUri}${dbName}` : `${baseUri}/${dbName}`;
  await mongoose.connect(uri);
}, 30_000);

beforeEach(() => {
  jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
  } as Response);
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    if (collection) {
      await collection.deleteMany({});
    }
  }

  jest.restoreAllMocks();
});

afterAll(async () => {
  // Disconnect this worker's mongoose connection.
  // The MongoMemoryServer itself is stopped by globalTeardown.cjs.
  await mongoose.disconnect();
});