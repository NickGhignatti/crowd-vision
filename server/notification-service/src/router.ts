import { Router } from "express";
import {
  getPreferences,
  publicKey,
  pushTemperatureAlert,
  subscribe,
  triggerAlert,
  updatePreference,
} from "./controller/notificationController.js";
import { requireAuthentication } from "./middlewares/authentication.js";

const router = Router();

// --- Public: health probe and the (non-secret) VAPID public key. ---
router.get("/health", (_req, res) => res.status(200).send());
router.get("/public-key", publicKey);

// Everything below reads/writes per-account data or fans out push alerts.
router.use(requireAuthentication);

router.post("/subscribe", subscribe);
// :accountName is kept for backwards-compatible URLs but ignored — the handler
// always uses the authenticated identity (was an IDOR before).
router.get("/preferences/:accountName", getPreferences);
router.get("/preferences", getPreferences);
router.post("/preferences", updatePreference);
router.post("/trigger", triggerAlert);
router.post("/push/temperature", pushTemperatureAlert);

export default router;
