import express from "express";
import cors from "cors";
import router from "./router.js";
import { connectMongo } from "./config/db.js";
import { getClientUrl } from "./config/config.js";
import cookieParser from "cookie-parser";
import { errorHandler } from "./middlewares/error.js";
import { metricsMiddleware } from "./middlewares/metrics.js";

const PORT = 3000;
export const app = express();

app.use(
  cors({
    origin: getClientUrl(),
    credentials: true,
  }),
);

app.use(cookieParser());

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use("/", router);
app.use(errorHandler);
app.use(metricsMiddleware);

if (process.env.NODE_ENV !== "test") {
  connectMongo().then(() => {
    app.listen(PORT);
  });
}
