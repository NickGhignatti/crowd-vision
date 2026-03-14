import type { Request, Response } from "express";
import * as AuthService from "../services/authenticationService.js";
import { Account } from "../models/account.js";
import { generateStandardToken } from "../services/tokenService.js";

export const provideAdministratorAccount = async (
  req: Request,
  res: Response,
) => {
  try {
    const { companyName, companyAdminMail, companyPassword } = req.body;

    const account = await Account.findOne({
      $or: [{ email: companyAdminMail }, { username: `${companyName}-admin` }],
    });

    if (account) {
      res.status(500).json({ message: `Account for company ${companyName} already exists` });
      return;
    }

    const accountCreated = await AuthService.registerAccount(
      `${companyName}-admin`,
      companyAdminMail,
      companyPassword,
    );

    const token = generateStandardToken({
      accountId: accountCreated._id.toString(),
      accountName: accountCreated.name,
    });

    res.status(201).json({
      message: `Administrator account for company ${companyName} created successfully`,
      token,
      account: {
        accountName: accountCreated.name,
      }
    });
  } catch (error: any) {
    res.status(500).json({message: 'Error: ', error});
  }
};