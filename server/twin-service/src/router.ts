import { Router } from "express";
import {
  getBuildingByDomain,
  getBuildingById,
  getBuildingCounts,
  getDomainsByBuilding,
  addBuilding,
  updateBuilding,
  updateRoom,
} from "./controller/buildings.js";
import { checkHealth } from "./controller/status.js";
import { register } from "./config/registry.js";
import { DIGITAL_TWIN_METRICS_CONTRACT } from "./models/metrics.js";
import { requireAuthentication } from "./middlewares/authentication.js";

const router = Router();

// --- Public infra (no auth): health, Prometheus scrape, metric contract. ---
router.get("/health/", checkHealth);
router.get("/metrics/", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.send(await register.metrics());
});
router.get("/contracts", (_req, res) =>
  res.status(200).json(DIGITAL_TWIN_METRICS_CONTRACT),
);

// Everything below exposes/mutates building data: require a valid JWT (browser
// cookie or a service forwarding the caller's bearer token).
router.use(requireAuthentication);

router.post("/register", addBuilding);
router.get("/building/:id", getBuildingById);
// Registered before "/buildings/:domain" so the literal path isn't captured by
// the :domain param.
router.post("/buildings/counts", getBuildingCounts);
router.get("/buildings/:domain", getBuildingByDomain);
router.get("/domain/:buildingName", getDomainsByBuilding);
router.patch("/building/:buildingId", updateBuilding);
router.patch("/building/:buildingId/room/:roomId", updateRoom);

export default router;
