import { Router } from 'express';
import {
  getByDomain,
  getById,
  getDomainByBuilding,
  register,
  updateBuildingById,
  updateRoom,
} from "./controller/twinController.js";

const router = Router();

router.post('/register', register);
router.get('/building/:id', getById);
router.get('/buildings/:domain', getByDomain);
router.get('/domain/:buildingName', getDomainByBuilding);
router.patch('/building/:buildingId', updateBuildingById);
router.patch('/building/:buildingId/room/:roomId', updateRoom);

export default router;