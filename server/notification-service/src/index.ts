import express from 'express';
import cors from "cors";
import swaggerUi from 'swagger-ui-express';
import YAML from "yamljs";
import dotenv from 'dotenv';
import router from "./router.js";
import * as http from "node:http";
import {Server} from "socket.io";
import {createClient} from "redis";

const PORT = 3000;
export const app = express();
const server = http.createServer(app);

const swaggerDocument = YAML.load('./openapi.yaml');

app.use(cors());
app.use(express.json());
app.use('/', router);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"]
    }
});

const redisSubscriber = createClient({ url: process.env.REDIS_URL || ''});
redisSubscriber.on('error', (err) => console.error('Redis Client Error', err));

async function startServer() {
    await redisSubscriber.connect();

    await redisSubscriber.subscribe('notifications', (message) => {
        const data = JSON.parse(message);
        console.log(`📡 Sending notification to user: ${data.userId}`);

        io.emit('notification', data);
    });

    server.listen(3000, () => {
        console.log('🚀 Gateway running on port 3000');
    });
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join_room', (userId) => {
        socket.join(userId);
    });
});

startServer();