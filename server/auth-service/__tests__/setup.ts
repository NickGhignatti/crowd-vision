import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongoServer: MongoMemoryServer;

import { jest } from "@jest/globals";

// Mock openid-client entirely to avoid ESM parsing issues
jest.mock("openid-client", () => ({
  discovery: jest.fn(),
  randomPKCECodeVerifier: jest.fn(() => "mock-verifier"),
  calculatePKCECodeChallenge: jest.fn(() => "mock-challenge"),
  buildAuthorizationUrl: jest.fn(() => new URL("http://mock-auth-url")),
  authorizationCodeGrant: jest.fn(),
}));

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGO_URI = uri;
  await mongoose.connect(uri);
}, 30000);

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    if (collection) {
      await collection.deleteMany({});
    }
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});
