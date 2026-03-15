import type { Request, Response } from "express";
import * as DomainService from "../services/domainService.js";
import type { IDomain } from "../models/domain.js";

export const createDomain = async (req: Request, res: Response) => {
  try {
    const { name, subdomains, authStrategy, ssoConfig, creatorUsername, isVisibleFromOutside } =
      req.body;

    const objectSubdomain: IDomain[] = [];

    if (subdomains.length > 0) {
      for (const subdomain of subdomains) {
        objectSubdomain.push(await DomainService.createDomain(
          subdomain,
          [],
          creatorUsername,
          authStrategy,
          ssoConfig,
          isVisibleFromOutside
        ));
      }
    }

    const domain = await DomainService.createDomain(
      name,
      objectSubdomain,
      creatorUsername,
      authStrategy,
      ssoConfig,
    );

    res.status(201).json(domain);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getAllDomains = async (req: Request, res: Response) => {
  try {
    const domains = await DomainService.getAllDomains();
    res.json({ domains });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getDomainsByAccount = async (req: Request, res: Response) => {
  const { accountName } = req.params;
  try {
    const memberships = await DomainService.getAccountMemberships(
      accountName as string,
    );
    res.json({ domains: memberships });
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
};

export const subscribeAccountToDomain = async (req: Request, res: Response) => {
  try {
    const { accountName } = req.params;
    const { domainName } = req.body;
    await DomainService.subscribeInternal(accountName as string, domainName);
    res.status(200).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const unsubscribeAccountFromDomain = async (
  req: Request,
  res: Response,
) => {
  try {
    const { accountName } = req.params;
    const { domainName } = req.body;
    await DomainService.unsubscribe(accountName as string, domainName);
    res.status(200).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getSubdomainsFromDomain = async (req: Request, res: Response) => {
  try {
    const { domainName } = req.params;
    const subdomains = await DomainService.getDomainSubdomains(
      domainName as string,
    );

    res.status(200).json(subdomains);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const createSubdomain = async (req: Request, res: Response) => {
  try {
    const { domainName } = req.params;
    const { name, subdomains, authStrategy, ssoConfig, creatorUsername } =
      req.body;

    const subdomain = await DomainService.createDomain(
      name,
      subdomains,
      creatorUsername,
      authStrategy,
      ssoConfig,
    );

    await DomainService.attachSubdomainToDomain(domainName as string, subdomain);

    res.status(200).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
