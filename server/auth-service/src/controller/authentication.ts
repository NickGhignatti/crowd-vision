import type { Request, Response } from "express";
import * as AuthService from "../services/authentication.js";
import { generateStandardToken } from "../services/token.js";
import type { StandardTokenPayload } from "../models/token.js";
import { grantTOTPRoles } from "../services/totp.js";
import { COOKIE_NAME, getCookieOptions } from "../config/config.js";

export const addAccount = async (req: Request, res: Response) => {
  const { accountName, email, password, otp } = req.body;

  const account = await AuthService.addAccount(accountName, email, password);

  if (otp) await grantTOTPRoles(otp, account._id);

  const token = await generateStandardToken({
    accountId: account._id.toString(),
    accountName: account.name,
  } as StandardTokenPayload);

  // Set the token as an httpOnly cookie — never exposed to JS
  res.cookie(COOKIE_NAME, token, getCookieOptions());

  res.status(201).json({
    message: "Account creation successful",
    account: {
      accountName,
    },
  });
};

export const authenticateAccount = async (req: Request, res: Response) => {
  const { accountName, password } = req.body;
  const account = await AuthService.authenticateAccount(accountName, password);
  const token = await generateStandardToken({
    accountId: account._id.toString(),
    accountName: account.name,
  } as StandardTokenPayload);

  res.cookie(COOKIE_NAME, token, getCookieOptions());

  res.status(200).json({
    message: "Login successful",
    account: {
      accountName: account.name,
    },
  });
};

export const startSSOLogin = async (req: Request, res: Response) => {
  const { domainName } = req.params;
  const { accountName } = req.query;

  const redirectUrl = await AuthService.generateSSOLoginUrl(
    domainName as string,
    accountName as string,
  );

  res.json({ redirectUrl });
};

export const handleSSOCallback = async (req: Request, res: Response) => {
  // Pass full URL to service to handle state/code extraction
  const clientRedirect = await AuthService.processSSOCallback(req.originalUrl);
  res.redirect(clientRedirect);
};

export const getMe = async (req: Request, res: Response) => {
  res.status(200).json({
    accountName: req.account.accountName,
  });
};

export const logout = (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, getCookieOptions());
  res.status(200).json({ message: "Logged out" });
};
