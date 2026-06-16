import { Router } from "express";
import {
  getPreferences,
  publicKey,
  pushTemperatureAlert,
  subscribe,
  triggerAlert,
  updatePreference,
} from "./controller/notificationController.js";

const router = Router();

router.get("/health", (_req, res) => res.status(200).send());
router.get("/public-key", publicKey);
router.post("/subscribe", subscribe);
router.get("/preferences/:accountName", getPreferences);
router.post("/preferences", updatePreference);
router.post("/trigger", triggerAlert);
router.post("/push/temperature", pushTemperatureAlert);

export default router;
