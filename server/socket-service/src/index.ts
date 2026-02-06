import express from 'express';
import cors from "cors";
import * as http from "node:http";
import {Server} from "socket.io";
import {createClient} from "redis";

const PORT = 3000;
export const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

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

        io.emit('notification', data);
    });

    server.listen(PORT, () => {
        console.log('🚀 Gateway running on port 3000');
    });
}

io.on('connection', (socket) => {
    socket.on('join_room', (userId) => {
        socket.join(userId);
    });
});

startServer();