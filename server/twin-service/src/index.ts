import express from "express";
import router from "./router.js";
import { connectMongo } from "./config/db.js";
import { errorHandler } from "./middlewares/errors.js";
import { metricsMiddleware } from "./middlewares/metrics.js";

const PORT = 3000;
export const app = express();

app.use(express.json());
app.use("/", router);
app.use(errorHandler);
app.use(metricsMiddleware);

if (process.env.NODE_ENV !== "test") {
  connectMongo().then(() => {
    app.listen(PORT);
  });
}
