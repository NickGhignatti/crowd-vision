import { Router } from "express";
import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import type { SensorKernel } from "./kernel/sensorKernel.js";
import { createReadHandlers } from "./controllers/readController.js";
import { createActionHandler } from "./controllers/actionController.js";
import { createWriteHandler } from "./controllers/writerController.js";
import { SENSOR_METRICS_CONTRACT } from "./models/metrics.js";
import { createThresholdHandlers } from "./controllers/thresholdController.js";
import { requireAuthentication } from "./middlewares/authentication.js";

// Rate-limit the DB-backed read/threshold endpoints (DoS protection). The
// telemetry hot path (/ingest) and /health are intentionally excluded.
const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

export function createRouter(
  ingestionHandler: RequestHandler,
  kernel: SensorKernel,
): Router {
  const router = Router();
  const reader = createReadHandlers(kernel);
  const writer = createWriteHandler(kernel);
  const thresholds = createThresholdHandlers(kernel);
  const action = createActionHandler(kernel);

  // Unthrottled + unauthenticated: telemetry ingestion hot path (device-facing,
  // guarded separately) + infra endpoints.
  router.post("/ingest", ingestionHandler);
  router.get("/contracts", (_req, res) =>
    res.status(200).json(SENSOR_METRICS_CONTRACT),
  );
  router.get("/health", (_req, res) => res.status(200).send());

  // Rate-limited from here down: every handler below performs a DB read/write.
  router.use(apiLimiter);

  // Authenticated from here down: building reads and threshold management are
  // user/account data (browser cookie, or twin-service forwarding a bearer token).
  router.use(requireAuthentication);

  router.get("/:sensorType/latest", reader.getLatestSingle);
  router.get("/:sensorType/entireBuilding", reader.getAllLatestBuilding);
  router.get("/:sensorType/dashboard", reader.getDashboard);

  router.get("/sensors/buildings/:buildingId", reader.getBuildingSensors);
  router.get(
    "/sensors/buildings/:buildingId/rooms/:roomId",
    reader.getRoomSensors,
  );

  router.post("/sensor", writer)

  router.post("/executeAction", action)

  router.put("/thresholds/buildings/:buildingId", thresholds.registerBuilding);
  router.get(
    "/thresholds/buildings/:buildingId",
    thresholds.getBuildingThresholdClone,
  );

  router.get(
    "/thresholds/:sensorType/buildings/:buildingId",
    thresholds.getBuildingThreshold,
  );
  router.patch(
    "/thresholds/:sensorType/buildings/:buildingId",
    thresholds.patchBuildingThreshold,
  );
  router.patch(
    "/thresholds/:sensorType/buildings/:buildingId/rooms/:roomId",
    thresholds.patchRoomThreshold,
  );

  return router;
}
