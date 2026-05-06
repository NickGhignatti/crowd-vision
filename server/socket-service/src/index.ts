import express from 'express';
import cors from "cors";
import * as http from "node:http";
import {Server} from "socket.io";
import {createClient} from "redis";

const PORT = 3000;
export const app = express();
const server = http.createServer(app);

export const getClientUrl = () =>
  process.env.CLIENT_URL || "http://localhost:5173";

app.use(
  cors({
    origin: getClientUrl(),
    credentials: true,
  }),
);
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: getClientUrl(),
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const redisSubscriber = createClient({ url: process.env.REDIS_URL || ''});
redisSubscriber.on('error', (err) => console.error('Redis Client Error', err));

async function startServer() {
    await redisSubscriber.connect();

    await redisSubscriber.subscribe('notifications', (message) => {
        const data = JSON.parse(message);

        io.emit('notification', data);
    });

    server.listen(PORT);
}

io.on('connection', (socket) => {
    socket.on('join_room', (userId) => {
        socket.join(userId);
    });
});

startServer();