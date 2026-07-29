import { Registry, Counter, Gauge, collectDefaultMetrics } from "prom-client";

export const register = new Registry();
collectDefaultMetrics({ register });

export const telemetryRelayedTotal = new Counter({
  name: "telemetry_relayed_total",
  help: "Telemetry messages relayed to building rooms",
  registers: [register],
});

export const connectedClients = new Gauge({
  name: "socket_connected_clients",
  help: "Currently connected Socket.IO clients",
  registers: [register],
});
