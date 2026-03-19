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
  getSubdomainsFromDomain,
  createSubdomain,
} from "./controller/domainController.js";
import {
  requireAuthentication,
  requireHmacSignature,
} from "./controller/authenticationMiddleware.js";
import { provideEnterpriseAccount } from "./controller/administrationController.js";
import { requireAuthorization } from "./models/roles.js";
import { getAllAllowedDomains } from "./services/domainService.js";

const router = Router();

// --- Authentication ---
router.post("/register", createAccount);
router.post("/login", authenticateAccount);
router.post(
  "/business/register",
  requireHmacSignature,
  provideEnterpriseAccount,
);

// --- Domains ---
router.get("/domains", requireAuthentication, getAllAllowedDomains);
router.post(
  "/domains",
  requireAuthentication,
  requireAuthorization("business_admin"),
  createDomain,
);
router.get("/domains/:accountName", requireAuthentication, getDomainsByAccount);
router.get(
  "/subdomains/:domainName",
  requireAuthentication,
  getSubdomainsFromDomain,
);
router.post(
  "/subdomains/:domainName",
  requireAuthentication,
  requireAuthorization("business_admin"),
  createSubdomain,
);

// --- Subscriptions ---
router.post(
  "/domains/:accountName/subscribe",
  requireAuthentication,
  subscribeAccountToDomain,
);
router.delete(
  "/domains/:accountName/unsubscribe",
  requireAuthentication,
  unsubscribeAccountFromDomain,
);

// --- SSO (OIDC) ---
router.get("/auth/sso/login/:domainName", requireAuthentication, startSSOLogin);
router.get("/auth/sso/callback", handleSSOCallback);

export default router;
