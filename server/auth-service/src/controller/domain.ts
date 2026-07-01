import type { Request, Response } from "express";
import * as DomainService from "../services/domain.js";
import { Domain } from "../models/domain.js";
import * as OTPAuth from "otpauth";
import { Account } from "../models/account.js";
import { hasRequiredRole, type Role } from "../models/role.js";
import { NotFoundError, UnauthorizedError } from "../models/error.js";

// The verified account name from the JWT — the only trustworthy source of the
// caller's identity. Routes must use this, not a body/URL-supplied account name.
const tokenAccountName = (req: Request): string => {
  const accountName = (req.account as { accountName?: string })?.accountName;
  if (!accountName) throw new UnauthorizedError("Invalid account name");
  return accountName;
};

export const createDomain = async (req: Request, res: Response) => {
  const { name, subdomains, authStrategy, ssoConfig, isVisibleFromOutside } =
    req.body;

  const creatorAccountName: string | undefined = (
    req.account as { accountName?: string }
  )?.accountName;

  if (!creatorAccountName) {
    throw new UnauthorizedError("Invalid creator account name");
  }

  const domain = await DomainService.addDomain(
    name,
    [],
    creatorAccountName,
    authStrategy,
    ssoConfig,
    isVisibleFromOutside,
  );

  res.status(201).json(domain);
};

export const getAllAllowedDomains = async (req: Request, res: Response) => {
  const domains = await DomainService.getPublicDomains();
  res.json({ domains });
};

export const getDomainMemberCounts = async (req: Request, res: Response) => {
  const accountName: string | undefined = (
    req.account as { accountName?: string }
  )?.accountName;

  if (!accountName) {
    throw new UnauthorizedError("Invalid account name");
  }

  // Scope counts to what the caller may see: public domains plus their own
  // memberships. Identity comes from the token, never from a request param.
  const [publicDomains, memberships] = await Promise.all([
    DomainService.getPublicDomains(),
    DomainService.getAccountMemberships(accountName),
  ]);

  const visibleNames = Array.from(
    new Set([
      ...publicDomains.map((d) => d.name),
      ...memberships.map((m) => m.domainName),
    ]),
  );

  const counts = await DomainService.getMemberCountsFor(visibleNames);
  res.json({ counts });
};

export const getDomainsByAccount = async (req: Request, res: Response) => {
  // Identity comes from the token, never the :accountName URL param — otherwise
  // any logged-in user could read another account's memberships (IDOR).
  const accountName = tokenAccountName(req);
  const memberships = await DomainService.getAccountMemberships(accountName);
  res.json({ domains: memberships });
};

export const subscribeAccountToDomain = async (req: Request, res: Response) => {
  // Subscribe only the authenticated caller; the :accountName param is ignored.
  const accountName = tokenAccountName(req);
  const { domainName } = req.body;
  await DomainService.subscribe(accountName, domainName);
  res.status(200).send();
};

export const unsubscribeAccountFromDomain = async (
  req: Request,
  res: Response,
) => {
  // Unsubscribe only the authenticated caller; the :accountName param is ignored.
  const accountName = tokenAccountName(req);
  const { domainName } = req.body;
  await DomainService.unsubscribe(accountName, domainName);
  res.status(200).send();
};

export const getSubdomainsFromDomain = async (req: Request, res: Response) => {
  const { domainName } = req.params;
  const subdomains = await DomainService.getDomainSubdomains(
    domainName as string,
  );

  res.status(200).json(subdomains);
};

export const createSubdomain = async (req: Request, res: Response) => {
  const { domainName } = req.params;
  const { name, authStrategy, ssoConfig, isVisibleFromOutside } = req.body;

  const creatorAccountName: string | undefined = (
    req.account as { accountName?: string }
  )?.accountName;

  if (!creatorAccountName) {
    throw new UnauthorizedError("Missing creator account name");
  }

  const subdomain = await DomainService.addDomain(
    name,
    [],
    creatorAccountName,
    authStrategy,
    ssoConfig,
    isVisibleFromOutside,
  );

  await DomainService.addSubdomainToDomain(domainName as string, subdomain);

  // Return the created subdomain (like createDomain) so the client can parse the
  // response body instead of choking on an empty one.
  res.status(201).json(subdomain);
};

export const getDomainTOTPQr = async (req: Request, res: Response) => {
  const { domainName, accountName } = req.params;
  const domain = await Domain.findOne({ name: domainName as string }).select(
    "+totpSecrets",
  );

  if (!domain) {
    throw new NotFoundError("Domain not found");
  }

  const account = await Account.findOne({ name: accountName as string });

  if (!account) {
    throw new NotFoundError("Account not found");
  }

  const qrCodes: Record<string, string> = {};
  const totpSecrets = domain.toObject().totpSecrets;
  const accountRolePerDomain = account.memberships.filter(
    (d) => d.domainName == domain.name,
  );

  if (
    accountRolePerDomain.length <= 0 ||
    accountRolePerDomain.length >= 2 ||
    !accountRolePerDomain[0]
  ) {
    throw new NotFoundError("Account role per domain missing");
  }

  for (const [role, secret] of Object.entries(totpSecrets)) {
    if (!secret || !hasRequiredRole(accountRolePerDomain[0].role, role as Role))
      continue;
    qrCodes[role] = new OTPAuth.TOTP({
      issuer: "CrowdVision",
      label: `${domainName} (${role})`,
      secret: OTPAuth.Secret.fromBase32(secret),
    }).toString();
  }

  res.json({ qrCodes });
};
