/**
 * Jest globalTeardown — runs ONCE after all test suites complete.
 * Stops the MongoMemoryServer that was started in globalSetup.
 */
module.exports = async () => {
  await global.__MONGOD__?.stop();
};
