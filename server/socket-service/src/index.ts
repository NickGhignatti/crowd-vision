import express from "express";
import * as http from "node:http";
import { Server } from "socket.io";
import { createClient } from "redis";

const PORT = 3000;
export const app = express();
const server = http.createServer(app);

export const getClientUrl = () =>
  process.env.CLIENT_URL || "http://localhost:5173";

app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: getClientUrl(),
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const redisSubscriber = createClient({ url: process.env.REDIS_URL || "" });
redisSubscriber.on("error", (err) => console.error("Redis Client Error", err));

await redisSubscriber.connect();

await redisSubscriber.subscribe("notifications", (message) => {
  console.info("[Event] New notification received:", message);
  io.emit("notification", JSON.parse(message));
});

await redisSubscriber.pSubscribe("telemetry:filtered:*", (message, channel) => {
  const buildingId = channel.replace("telemetry:filtered:", "");
  io.to(`building:${buildingId}`).emit("telemetry", JSON.parse(message));
});

io.on("connection", (socket) => {
  socket.on("join_room", (userId) => {
    socket.join(userId);
  });

  socket.on("subscribe_building", (buildingId) => {
    socket.join(`building:${buildingId}`);
  });

  socket.on("unsubscribe_building", (buildingId) => {
    socket.leave(`building:${buildingId}`);
  });
});

server.listen(PORT);
