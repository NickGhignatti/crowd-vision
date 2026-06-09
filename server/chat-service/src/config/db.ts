import mongoose from "mongoose";
import { InternalError } from "../models/error.js";

export function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new InternalError("Missing MONGO_URI configuration");
  return mongoose.connect(uri);
}
