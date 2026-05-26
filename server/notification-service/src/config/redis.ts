import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

export const redisSubscriber = redisClient.duplicate();

redisClient.on("error", (err) => console.error("❌ Redis Client Error", err));

export const connectRedis = async () => {
  try {
    await redisClient.connect();
    await redisSubscriber.connect();
  } catch (error) {
    console.error("❌ Could not connect to Redis:", error);
    process.exit(1);
  }
};

export default redisClient;
