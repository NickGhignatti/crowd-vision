import cookieParser from "cookie-parser";
import express from "express";
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
  connectMongo().then(() => app.listen(PORT));
}
