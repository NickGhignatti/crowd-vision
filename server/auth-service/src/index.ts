import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import router from "./router.js";
import { connectMongo } from "./config/db.js";
import { getClientUrl } from "./config/config.js";
import cookieParser from "cookie-parser";
import { globalErrorHandler } from "./middlewares/errorsMiddleware.js";

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
app.use(globalErrorHandler);

if (process.env.NODE_ENV !== "test") {
  connectMongo().then(() => {
    app.listen(PORT, () =>
      console.log(`Authentication service running on localhost:${PORT}`),
    );
  });
}
