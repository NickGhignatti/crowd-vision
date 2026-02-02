import { Router } from 'express';
import {publicKey, subscribe, triggerAlert} from "./controller/notificationController.js";

const router = Router();

router.post('/trigger', triggerAlert);
router.post('/subscribe', subscribe);
router.get('/public-key', publicKey);

export default router;