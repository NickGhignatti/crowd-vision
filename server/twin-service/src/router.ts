import { Router } from 'express';
import {getByDomain, getById, register, updateRoom} from "./controller/twinController.js";

const router = Router();

router.post('/register', register);
router.get('/building/:id', getById);
router.get('/buildings/:domain', getByDomain);
router.patch('/building/:buildingId/room/:roomId', updateRoom);

export default router;