import express from "express";
import dotenv from "dotenv";
import router from "./router.js";
import { connectRedis } from "./config/redis.js";
import { connectMongo } from "./config/db.js";
import { globalErrorHandler } from "./middlewares/errorsMiddleware.js";
import { initializeEventListeners } from "./services/eventListener.js";

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 3000;

export const getClientUrl = () =>
  process.env.CLIENT_URL || "http://localhost:5173";

app.use(express.json());
app.use("/", router);
// Express error-handling middleware must be registered AFTER the routes so it
// can catch errors thrown (or `next(err)`-passed) from any route handler.
app.use(globalErrorHandler);

if (process.env.NODE_ENV !== "test") {
  Promise.all([connectMongo(), connectRedis()])
    .then(async () => {
      await initializeEventListeners();

      app.listen(PORT, () => {
        console.info(`[notification-service] Listening on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error(
        "[notification-service] Failed to connect to databases:",
        err,
      );
      process.exit(1);
    });
}
