import cookieParser from "cookie-parser";
import express from "express";
import mongoose from "mongoose";
import { connectMongo } from "./config/db.js";
import { errorHandler } from "./middlewares/error.js";
import { metricsMiddleware } from "./middlewares/metrics.js";
import router from "./router.js";

const PORT = 3000;
export const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(metricsMiddleware);
app.use("/", router);
app.use(errorHandler);

if (process.env.NODE_ENV !== "test") {
  connectMongo().then(() => {
    const server = app.listen(PORT);
    const shutdown = () => {
      server.close(() => {
        mongoose.disconnect().finally(() => process.exit(0));
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  });
}
