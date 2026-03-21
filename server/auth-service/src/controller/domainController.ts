import type {Request, Response} from "express";
import * as DomainService from "../services/domainService.js";
import {Domain, type IDomain} from "../models/domain.js";
import * as OTPAuth from "otpauth";
import { Account } from "../models/account.js";
import { hasRequiredRole, type Role } from "../models/roles.js";

export const createDomain = async (req: Request, res: Response) => {
    try {
        const {name, subdomains, authStrategy, ssoConfig, isVisibleFromOutside} =
            req.body;

        const creatorAccountName: string | undefined = (req.account as { accountName?: string })?.accountName;

        if (!creatorAccountName) {
            return res.status(401).json({error: "Authenticated account name missing"});
        }

        const domain = await DomainService.createDomain(
            name,
            [],
            creatorAccountName,
            authStrategy,
            ssoConfig,
            isVisibleFromOutside
        );

        res.status(201).json(domain);
    } catch (error: any) {
        res.status(400).json({error: error.message});
    }
};

export const getAllDomains = async (req: Request, res: Response) => {
    try {
        const domains = await DomainService.getAllDomains();
        res.json({domains});
    } catch (error: any) {
        res.status(400).json({error: error.message});
    }
};

export const getAllAllowedDomains = async (req: Request, res: Response) => {
    try {
        const domains = await DomainService.getAllAllowedDomains();
        res.json({domains});
    } catch (error: any) {
        res.status(400).json({error: error.message});
    }
}

export const getDomainsByAccount = async (req: Request, res: Response) => {
    const {accountName} = req.params;
    try {
        const memberships = await DomainService.getAccountMemberships(
            accountName as string,
        );
        res.json({domains: memberships});
    } catch (error: any) {
        res.status(404).json({error: error.message});
    }
};

export const subscribeAccountToDomain = async (req: Request, res: Response) => {
    try {
        const {accountName} = req.params;
        const {domainName} = req.body;
        await DomainService.subscribeInternal(accountName as string, domainName);
        res.status(200).send();
    } catch (error: any) {
        res.status(400).json({error: error.message});
    }
};

export const unsubscribeAccountFromDomain = async (
    req: Request,
    res: Response,
) => {
    try {
        const {accountName} = req.params;
        const {domainName} = req.body;
        await DomainService.unsubscribe(accountName as string, domainName);
        res.status(200).send();
    } catch (error: any) {
        res.status(400).json({error: error.message});
    }
};

export const getSubdomainsFromDomain = async (req: Request, res: Response) => {
    try {
        const {domainName} = req.params;
        const subdomains = await DomainService.getDomainSubdomains(
            domainName as string,
        );

        res.status(200).json(subdomains);
    } catch (error: any) {
        res.status(400).json({error: error.message});
    }
};

export const createSubdomain = async (req: Request, res: Response) => {
    try {
        const {domainName} = req.params;
        const {name, authStrategy, ssoConfig, isVisibleFromOutside} = req.body;

        const creatorAccountName: string | undefined = (
            req.account as { accountName?: string }
        )?.accountName;

        if (!creatorAccountName) {
            return res
                .status(401)
                .json({error: "Authenticated account name missing"});
        }

        const subdomain = await DomainService.createDomain(
            name,
            [],
            creatorAccountName,
            authStrategy,
            ssoConfig,
            isVisibleFromOutside
        );

        await DomainService.attachSubdomainToDomain(
            domainName as string,
            subdomain,
        );

        res.status(200).send();
    } catch (error: any) {
        res.status(400).json({error: error.message});
    }
};

export const getDomainTOTPQr = async (req: Request, res: Response) => {
    try {
        const {domainName, accountName} = req.params;
        const domain = await Domain.findOne({name: domainName as string}).select(
            "+totpSecrets",
        );

        if (!domain) return res.status(404).json({error: "Domain not found"});

        const account = await Account.findOne({name: accountName as string});

        if (!account) return res.status(404).json({error: "Account not found"});

        const qrCodes: Record<string, string> = {};
        const totpSecrets = domain.toObject().totpSecrets;
        const accountRolePerDomain = account.memberships.filter(d => d.domainName == domain.name)

        if (accountRolePerDomain.length <= 0 || accountRolePerDomain.length >= 2 || !accountRolePerDomain[0])
          return res.status(404).json({ error: "Account invalid" });

        for (const [role, secret] of Object.entries(totpSecrets)) {
            if (!secret || !hasRequiredRole(accountRolePerDomain[0].role, role as Role)) continue;
            qrCodes[role] = new OTPAuth.TOTP({
                issuer: "CrowdVision",
                label: `${domainName} (${role})`,
                secret: OTPAuth.Secret.fromBase32(secret),
            }).toString();
        }

        res.json({qrCodes});
    } catch (error: any) {
        res.status(500).json({error: error.message});
    }
};
