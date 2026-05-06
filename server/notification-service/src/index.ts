import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import router from './router.js';
import swaggerUi from 'swagger-ui-express';
import { connectRedis } from './config/redis.js';
import { startNotificationLoop } from './services/notificationService.js';
import {connectMongo} from "./config/db.js";
import YAML from "yamljs";
import {globalErrorHandler} from "./middlewares/errorsMiddleware.js";

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 3000;

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

const startServer = async () => {
    await connectRedis();

    // just to demonstrate notifications being sent periodically
    // startNotificationLoop();

    if (process.env.NODE_ENV !== 'test') {
        connectMongo().then(() => {
            app.listen(PORT);
        });
    }
};

app.use(globalErrorHandler);

startServer();