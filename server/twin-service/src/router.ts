import { Router } from 'express';
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

const router = Router();

router.post('/register', addBuilding);
router.get('/building/:id', getBuildingById);
router.get('/buildings/:domain', getBuildingByDomain);
router.get('/domain/:buildingName', getDomainsByBuilding);
router.patch('/building/:buildingId', updateBuilding);
router.patch("/building/:buildingId/room/:roomId", updateRoom);

// --- Metrics ---
router.get("/health/", checkHealth);
router.get("/metrics/", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.send(await register.metrics());
});
export default router;