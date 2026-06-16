import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Spins up a real in-memory MongoDB so the service layer is exercised against
// genuine queries, aggregations and indexes — not mocks. One server per test
// file (Jest isolates module state per file), torn down afterwards.
let mongod: MongoMemoryServer | undefined;

export async function startMongo(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

export async function stopMongo(): Promise<void> {
  await mongoose.disconnect();
  await mongod?.stop();
}

export async function clearCollections(): Promise<void> {
  const { collections } = mongoose.connection;
  for (const name of Object.keys(collections)) {
    await collections[name]!.deleteMany({});
  }
}
