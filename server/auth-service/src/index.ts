import express from "express";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import router from "./router.js";
import { connectMongo } from "./config/db.js";
import cookieParser from "cookie-parser";
import { errorHandler } from "./middlewares/error.js";
import { metricsMiddleware } from "./middlewares/metrics.js";

const PORT = 3000;
export const app = express();
// Behind the Caddy/ingress proxy: trust one hop so express-rate-limit reads the real client IP.
app.set("trust proxy", 1);

// Per-IP rate limit on all routes (DoS protection); disabled under test.
const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

app.use(cookieParser());

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(apiLimiter);
app.use("/", router);
app.use(errorHandler);
app.use(metricsMiddleware);

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
