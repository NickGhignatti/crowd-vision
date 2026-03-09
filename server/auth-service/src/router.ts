import { Router } from "express";
import {
  loginUser,
  createNewUser,
  startSSOLogin,
  handleSSOCallback,
} from "./controller/authenticationController.js";
import {
  allDomains,
  getUserDomains,
  registerDomain,
  subscribeUser,
  unsubscribeUser,
} from "./controller/domainController.js";
import { requireAuth } from "./controller/authenticationMiddleware.js";

const router = Router();

// --- User Auth ---
router.post("/register", createNewUser);
router.post("/login", loginUser);

// --- Domains ---
router.get("/domains", requireAuth, allDomains);
router.post("/domains", requireAuth, registerDomain);

// --- Subscriptions ---
router.get("/domains/:username", requireAuth, getUserDomains);
router.post("/domains/:username/subscribe", requireAuth, subscribeUser); // Internal Only
router.delete("/domains/:username/unsubscribe", requireAuth, unsubscribeUser);

// --- SSO (OIDC) ---
router.get("/auth/sso/login/:domainName", requireAuth, startSSOLogin);
router.get("/auth/sso/callback", requireAuth, handleSSOCallback);

export default router;
