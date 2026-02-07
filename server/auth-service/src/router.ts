import { Router } from "express";
import {
  loginUser,
  createNewUser,
  startSSOLogin,
  handleSSOCallback,
} from "./controller/authController.js";
import {
  allDomains,
  getUserDomains,
  registerDomain,
  subscribeUser,
  unsubscribeUser,
} from "./controller/domainController.js";

const router = Router();

// --- User Auth ---
router.post("/register", createNewUser);
router.post("/login", loginUser);

// --- Domains ---
router.get("/domains", allDomains);
router.post("/domains", registerDomain);

// --- Subscriptions ---
router.get("/domains/:username", getUserDomains);
router.post("/domains/:username/subscribe", subscribeUser); // Internal Only
router.delete("/domains/:username/unsubscribe", unsubscribeUser);

// --- SSO (OIDC) ---
router.get("/auth/sso/login/:domainName", startSSOLogin);
router.get("/auth/sso/callback", handleSSOCallback);

export default router;
