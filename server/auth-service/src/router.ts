import { Router } from "express";
import {
  authenticateAccount,
  createAccount,
  startSSOLogin,
  handleSSOCallback,
} from "./controller/authenticationController.js";
import {
  getAllDomains,
  getDomainsByAccount,
  createDomain,
  subscribeAccountToDomain,
  unsubscribeAccountFromDomain,
} from "./controller/domainController.js";
import { requireAuthentication, requireHmacSignature } from "./controller/authenticationMiddleware.js";
import { provideAdministratorAccount } from "./controller/administrationController.js";

const router = Router();

// --- Authentication ---
router.post("/register", createAccount);
router.post("/login", authenticateAccount);
router.post('/business/register', requireHmacSignature, provideAdministratorAccount);

// --- Domains ---
router.get("/domains", requireAuthentication, getAllDomains);
router.post("/domains", requireAuthentication, createDomain);

// --- Subscriptions ---
router.get("/domains/:accountName", requireAuthentication, getDomainsByAccount);
router.post("/domains/:accountName/subscribe", requireAuthentication, subscribeAccountToDomain);
router.delete("/domains/:accountName/unsubscribe", requireAuthentication, unsubscribeAccountFromDomain);

// --- SSO (OIDC) ---
router.get("/auth/sso/login/:domainName", requireAuthentication, startSSOLogin);
router.get("/auth/sso/callback", requireAuthentication, handleSSOCallback);

export default router;
