import express from 'express'
import cors from "cors";
import swaggerUi from 'swagger-ui-express';
import YAML from "yamljs";
import router from "./router.js";
import {connectMongo} from "./config/db.js";

const PORT = 3000;
export const app = express()

const swaggerDocument = YAML.load("./openapi.yaml");
export const getClientUrl = () =>
  process.env.CLIENT_URL || "http://localhost:5173";

app.use(
  cors({
    origin: getClientUrl(),
    credentials: true,
  }),
);
app.use(express.json());
app.use('/', router);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

if (process.env.NODE_ENV !== 'test') {
    connectMongo().then(() => {
        app.listen(PORT, () => console.log(`Digital twin service is running`));
    });
}