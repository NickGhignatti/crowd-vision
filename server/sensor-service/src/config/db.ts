import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI!;

export function connectMongo() {
  return mongoose.connect(MONGO_URI, {
    minPoolSize: 5, // keep warm connections
    serverSelectionTimeoutMS: 5000, // fail fast instead of hanging
    socketTimeoutMS: 45000,
  });
}
