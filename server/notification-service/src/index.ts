import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import router from './router.js';
import swaggerUi from 'swagger-ui-express';
import { connectRedis } from './config/redis.js';
import { startNotificationLoop } from './services/notificationService.js';
import {connectMongo} from "./config/db.js";
import YAML from "yamljs";

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 3000;

const swaggerDocument = YAML.load('./openapi.yaml');

app.use(cors());
app.use(express.json());

app.use('/', router);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const startServer = async () => {
    await connectRedis();

    // just to demonstrate notifications being sent periodically
    startNotificationLoop();

    if (process.env.NODE_ENV !== 'test') {
        connectMongo().then(() => {
            app.listen(PORT, () => console.log(`Authentication service running on localhost:${PORT}`));
        });
    }
};

startServer();