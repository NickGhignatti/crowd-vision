import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import router from './router.js';
import { connectRedis } from './config/redis.js';
import { startNotificationLoop } from './services/notificationService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/', router);

const startServer = async () => {
    await connectRedis();

    // just to demonstrate notifications being sent periodically
    startNotificationLoop();

    app.listen(PORT, () => {
        console.log(`🚀 Notification Service running on port ${PORT}`);
    });
};

startServer();