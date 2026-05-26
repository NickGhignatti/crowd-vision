import { Router } from "express";
import {
  getBuildingByDomain,
  getBuildingById,
  getDomainsByBuilding,
  addBuilding,
  updateBuilding,
  updateRoom,
} from "./controller/buildings.js";
import { checkHealth } from "./controller/status.js";
import { register } from "./config/registry.js";
import { DIGITAL_TWIN_METRICS_CONTRACT } from "./models/metrics.js";

const router = Router();

router.post("/register", addBuilding);
router.get("/building/:id", getBuildingById);
router.get("/buildings/:domain", getBuildingByDomain);
router.get("/domain/:buildingName", getDomainsByBuilding);
router.patch("/building/:buildingId", updateBuilding);
router.patch("/building/:buildingId/room/:roomId", updateRoom);

// --- Metrics ---
router.get("/health/", checkHealth);
router.get("/metrics/", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.send(await register.metrics());
});
router.get("/contracts", (_req, res) =>
  res.status(200).json(DIGITAL_TWIN_METRICS_CONTRACT),
);
export default router;
