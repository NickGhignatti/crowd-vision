import type { Request, Response } from "express";
import * as AuthService from "../services/authenticationService.js";
import { generateStandardToken } from "../services/tokenService.js";

export const createAccount = async (req: Request, res: Response) => {
  try {
    const { accountName, email, password } = req.body;
    const account = await AuthService.registerAccount(accountName, email, password);
    const token = generateStandardToken({
      accountId: account._id.toString(),
      accountName: account.name,
    });

    res.status(201).json({
      message: "Account creation successful",
      token,
      account: {
        accountName,
      },
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const authenticateAccount = async (req: Request, res: Response) => {
  try {
    const { name, password } = req.body;
    const account = await AuthService.authenticateAccount(name, password);
    const token = generateStandardToken({
      accountId: account._id.toString(),
      accountName: account.name,
    });

    res.status(200).json({
      message: "Login successful",
      token,
      account: {
        accountName: name,
      },
    });
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
};

export const startSSOLogin = async (req: Request, res: Response) => {
  try {
    const { domainName } = req.params;
    const { accountName } = req.query;

    const redirectUrl = await AuthService.generateSSOLoginUrl(
      domainName as string,
      accountName as string,
    );

    res.json({ redirectUrl });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const handleSSOCallback = async (req: Request, res: Response) => {
  try {
    // Pass full URL to service to handle state/code extraction
    const clientRedirect = await AuthService.processSSOCallback(
      req.originalUrl,
    );
    res.redirect(clientRedirect);
  } catch (error: any) {
    console.error("SSO Error:", error);
    res.redirect(
      `${process.env.CLIENT_URL || "http://localhost:8080"}/domains?error=sso_failed`,
    );
  }
};
