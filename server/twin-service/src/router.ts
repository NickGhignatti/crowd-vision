import { Router } from 'express';
import {
  getBuildingByDomain,
  getBuildingById,
  getDomainsByBuilding,
  addBuilding,
  updateBuilding,
  updateRoom,
} from "./controller/buildings.js";

const router = Router();

router.post('/register', addBuilding);
router.get('/building/:id', getBuildingById);
router.get('/buildings/:domain', getBuildingByDomain);
router.get('/domain/:buildingName', getDomainsByBuilding);
router.patch('/building/:buildingId', updateBuilding);
router.patch('/building/:buildingId/room/:roomId', updateRoom);

export default router;