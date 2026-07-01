/**
 * Jest globalSetup — runs ONCE before all test suites in the main Jest process.
 * Starting MongoMemoryServer here instead of inside setupFilesAfterEnv means:
 *  - Only one MongoDB binary download/start ever happens per test run.
 *  - No race condition between parallel test files fighting over the lock file.
 *  - The URI is forwarded to every worker via process.env.
 */
const { MongoMemoryServer } = require("mongodb-memory-server");

module.exports = async () => {
  const mongoServer = await MongoMemoryServer.create();

  // Share the URI with all Jest workers (env vars are inherited by child processes).
  process.env.MONGO_URI = mongoServer.getUri();

  // Deterministic secret so tests can mint JWTs the auth middleware accepts.
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

  // Store the instance on `global` so globalTeardown can stop it.
  // globalSetup and globalTeardown run in the same main process, so `global` is shared.
  global.__MONGOD__ = mongoServer;
};
