import { Router } from "express";
import {
  authenticateAccount,
  createAccount,
  startSSOLogin,
  handleSSOCallback,
  getMe,
  logout,
} from "./controller/authenticationController.js";
import {
  getDomainsByAccount,
  createDomain,
  subscribeAccountToDomain,
  unsubscribeAccountFromDomain,
  getSubdomainsFromDomain,
  createSubdomain,
  getDomainTOTPQr, getAllAllowedDomains,
} from "./controller/domainController.js";
import {
  requireAuthentication,
  requireHmacSignature,
} from "./controller/authenticationMiddleware.js";
import { provideEnterpriseAccount } from "./controller/administrationController.js";
import { requireAuthorization } from "./models/role.js";

const router = Router();

// --- Authentication ---
router.post("/register", createAccount);
router.post("/login", authenticateAccount);
router.post(
  "/business/register",
  requireHmacSignature,
  provideEnterpriseAccount,
);
router.get("/me", requireAuthentication, getMe);
router.post('/logout', logout)

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

// --- QR Codes ---
router.get(
  "/domains/:domainName/totp/qr/:accountName",
  requireAuthentication,
  requireAuthorization("business_admin"),
  getDomainTOTPQr,
);

export default router;
