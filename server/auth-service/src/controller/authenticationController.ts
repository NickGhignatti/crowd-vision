import type { Request, Response } from "express";
import * as AuthService from "../services/authenticationService.js";
import { generateStandardToken } from "../services/tokenService.js";

export const createNewUser = async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    const user = await AuthService.registerUser(username, email, password);
    const token = generateStandardToken({
      userId: user._id.toString(),
      username: user.username,
    });

    res.status(201).json({
      message: "User creation successful",
      token,
      user: {
        username: user.username,
      },
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const user = await AuthService.authenticateUser(username, password);
    const token = generateStandardToken({
      userId: user._id.toString(),
      username: user.username,
    });

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        username,
      },
    });
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
};

export const startSSOLogin = async (req: Request, res: Response) => {
  try {
    const { domainName } = req.params;
    const { username } = req.query;

    const redirectUrl = await AuthService.generateSSOLoginUrl(
      domainName as string,
      username as string,
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
