import { Router } from 'express';
import {triggerAlert} from "./controller/notificationController.js";

const router = Router();

router.post('/trigger', triggerAlert);

export default router;