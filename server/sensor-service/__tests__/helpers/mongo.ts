import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Spins up a real in-memory MongoDB so the service layer is exercised against
// genuine queries, aggregations and indexes — not mocks. One server per test
// file (Jest isolates module state per file), torn down afterwards.
let mongod: MongoMemoryServer | undefined;

export async function startMongo(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Time-series collections must exist before the first insert — otherwise a
  // racing insert auto-creates a plain collection instead. Create every
  // registered model's collection up front so the timeseries options apply.
  await Promise.all(
    mongoose
      .modelNames()
      .map((name) => mongoose.model(name).createCollection().catch(() => undefined)),
  );
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
