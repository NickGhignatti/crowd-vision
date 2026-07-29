import { jest } from "@jest/globals";
import mongoose from "mongoose";

process.env.AGENT_SERVICE_URL = "http://agent-service:3000";

beforeAll(async () => {
  const baseUri = process.env.MONGO_URI!;
  const dbName = `testdb_worker_${process.env.JEST_WORKER_ID ?? "1"}`;
  await mongoose.connect(`${baseUri}${dbName}`);
}, 30_000);

beforeEach(() => {
  jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ answer: "Agent reply", citations: [] }),
  } as Response);
});

afterEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({});
  }
  jest.restoreAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
});
