import express from "express";
import * as http from "node:http";
import { Server } from "socket.io";
import { createClient } from "redis";
import { register } from "./config/registry.js";
import { relayTelemetry } from "./handlers/telemetry.js";
import { relayNotification } from "./handlers/notification.js";
import { handleConnection } from "./handlers/connection.js";
import { authenticateToken, readCookie } from "./auth.js";

// Composition root (imperative shell): build dependencies, wire the pure
// handlers to them, and start listening. No logic lives here — that's in
// core/ and handlers/, which is why this file is excluded from coverage.

const JWT_SECRET = process.env.JWT_SECRET || "";
const PORT = 3000;
const app = express();
const server = http.createServer(app);

const getClientUrl = () => process.env.CLIENT_URL || "http://localhost:5173";

app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: getClientUrl(),
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.use((socket, next) => {
  const token = readCookie(
    socket.handshake.headers.cookie,
    "authentication_token",
  );
  const identity = authenticateToken(token, JWT_SECRET);
  if (!identity) return next(new Error("unauthorized"));
  socket.data.identity = identity; // server-authoritative; client can't forge rooms
  next();
});

io.on("connection", handleConnection);

app.get("/health", (_req, res) => res.status(200).send());
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.send(await register.metrics());
});

const redisSubscriber = createClient({ url: process.env.REDIS_URL || "" });
redisSubscriber.on("error", (err) => console.error("Redis Client Error", err));

await redisSubscriber.connect();

await redisSubscriber.subscribe("notifications", (message) =>
  relayNotification(io, message),
);

await redisSubscriber.pSubscribe("telemetry:filtered:*", (message, channel) =>
  relayTelemetry(io, message, channel),
);

server.listen(PORT);

const shutdown = async () => {
  // Force-exit if the graceful close hangs, so the pod always dies before SIGKILL.
  setTimeout(() => process.exit(1), 10_000).unref();
  io.close();
  server.close();
  await redisSubscriber.unsubscribe();
  await redisSubscriber.pUnsubscribe();
  await redisSubscriber.quit();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
