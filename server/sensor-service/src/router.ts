import { Router } from "express";
import type { RequestHandler } from "express";
import type { SensorKernel } from "./kernel/sensorKernel.js";
import { createReadHandlers } from "./controllers/readController.js";
import { SENSOR_METRICS_CONTRACT } from "./models/metrics.js";
import {
  createThresholdHandlers
} from "./controllers/thresholdController.js";

export function createRouter(
  ingestionHandler: RequestHandler,
  kernel: SensorKernel,
): Router {
  const router = Router();
  const reader = createReadHandlers(kernel);
  const thresholds = createThresholdHandlers(kernel);

  router.post("/ingest", ingestionHandler);

  router.get("/:sensorType/latest", reader.getLatestSingle);
  router.get(
    "/:sensorType/entireBuilding",
    reader.getAllLatestBuilding,
  );
  router.get("/:sensorType/dashboard", reader.getDashboard);

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

  router.get("/metrics", (_req, res) =>
    res.status(200).json(SENSOR_METRICS_CONTRACT),
  );

  return router;
}
