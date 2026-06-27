import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import router from "./router.js";
import { connectRedis } from "./config/redis.js";
import { connectMongo } from "./config/db.js";
import { globalErrorHandler } from "./middlewares/errorsMiddleware.js";
import { initializeEventListeners } from "./services/eventListener.js";

dotenv.config();

export const app = express();
// Behind the Caddy/ingress proxy: trust one hop so express-rate-limit reads the real client IP.
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;

// Per-IP rate limit on all routes (DoS protection); disabled under test.
const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

app.use(express.json());
app.use(cookieParser());
app.use(apiLimiter);
app.use("/", router);
// Express error-handling middleware must be registered AFTER the routes so it
// can catch errors thrown (or `next(err)`-passed) from any route handler.
app.use(globalErrorHandler);

if (process.env.NODE_ENV !== "test") {
  Promise.all([connectMongo(), connectRedis()])
    .then(async () => {
      await initializeEventListeners();

      const server = app.listen(PORT, () => {
        console.info(`[notification-service] Listening on port ${PORT}`);
      });
      const shutdown = () => {
        server.close(() => {
          mongoose.disconnect().finally(() => process.exit(0));
        });
        setTimeout(() => process.exit(1), 10_000).unref();
      };
      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);
    })
    .catch((err) => {
      console.error(
        "[notification-service] Failed to connect to databases:",
        err,
      );
      process.exit(1);
    });
}
