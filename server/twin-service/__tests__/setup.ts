import mongoose from "mongoose";

beforeAll(async () => {
  // Each Jest worker gets its own database within the shared MongoMemoryServer,
  // so parallel test files can't delete each other's data mid-test.
  const baseUri = process.env.MONGO_URI!;
  const dbName = `testdb_worker_${process.env.JEST_WORKER_ID ?? "1"}`;
  const uri = baseUri.endsWith("/")
    ? `${baseUri}${dbName}`
    : `${baseUri}/${dbName}`;
  await mongoose.connect(uri);
}, 30_000);

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
});
