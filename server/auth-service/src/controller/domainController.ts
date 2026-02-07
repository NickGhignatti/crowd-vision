import type { Request, Response } from "express";
import * as DomainService from "../services/domainService.js";

export const registerDomain = async (req: Request, res: Response) => {
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

export const allDomains = async (req: Request, res: Response) => {
  try {
    const domains = await DomainService.getAllDomains();
    res.json({ domains });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getUserDomains = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const memberships = await DomainService.getUserMemberships(
      username as string,
    );
    res.json({ domains: memberships });
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
};

export const subscribeUser = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { domainName } = req.body;
    await DomainService.subscribeInternal(username as string, domainName);
    res.status(200).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const unsubscribeUser = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { domainName } = req.body;
    await DomainService.unsubscribe(username as string, domainName);
    res.status(200).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
