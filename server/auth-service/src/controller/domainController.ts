import type { Request, Response } from "express";
import * as DomainService from "../services/domainService.js";

export const createDomain = async (req: Request, res: Response) => {
  try {
    const { name, subdomains, authStrategy, ssoConfig, creatorUsername } =
      req.body;

    const domain = await DomainService.createDomain(
      name,
      subdomains,
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
  try {
    const { accountName } = req.params;
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

export const unsubscribeAccountFromDomain = async (req: Request, res: Response) => {
  try {
    const { accountName } = req.params;
    const { domainName } = req.body;
    await DomainService.unsubscribe(accountName as string, domainName);
    res.status(200).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
