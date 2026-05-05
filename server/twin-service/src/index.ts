import express from 'express'
import cors from "cors";
import swaggerUi from 'swagger-ui-express';
import YAML from "yamljs";
import router from "./router.js";
import {connectMongo} from "./config/db.js";
import {errorHandler} from "./middlewares/errors.js";
import { metricsMiddleware } from "./middlewares/metrics.js";
import { getClientUrl } from "./config/config.js";

const PORT = 3000;
export const app = express()

app.use(
  cors({
    origin: getClientUrl(),
    credentials: true,
  }),
);
app.use(express.json());
app.use('/', router);
app.use(errorHandler);
app.use(metricsMiddleware);

if (process.env.NODE_ENV !== 'test') {
    connectMongo().then(() => {
        app.listen(PORT, () => console.log(`Digital twin service is running`));
    });
}