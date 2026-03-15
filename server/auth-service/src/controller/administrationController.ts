import type { Request, Response } from "express";
import * as AuthService from "../services/authenticationService.js";
import * as DomainService from "../services/domainService.js";
import { generateStandardToken } from "../services/tokenService.js";
import type { StandardTokenPayload } from "../models/token.js";
import { Account } from "../models/account.js";

export const provideEnterpriseAccount = async (req: Request, res: Response) => {
  try {
    const { companyName, companyAdminMail, companyPassword, companyDomain } =
      req.body;

    const accountCreated = await AuthService.registerAccount(
      `${companyName}-admin`,
      companyAdminMail,
      companyPassword,
    );

    // TODO
    // const totpSecret = deriveTotpSecret(
    //   accountCreated.name,
    //   accountCreated.password,
    // );

    // await Account.findOneAndUpdate(
    //   { name: accountCreated.name },
    //   { $addToSet: { totpSecret: totpSecret } },
    // );

    await DomainService.createDomain(
      companyDomain as string,
      [],
      accountCreated.name,
      "internal",
    );

    const token = generateStandardToken({
      accountId: accountCreated._id.toString(),
      accountName: accountCreated.name,
    } as StandardTokenPayload);

    res.status(201).json({
      message: `Administrator account for company ${companyName} created successfully`,
      token,
      account: {
        accountName: accountCreated.name,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error: ", error });
  }
};

export const provideEnterpriseAdministratorAccount = async (
  req: Request,
  res: Response,
) => {
  try {
    const {
      companyName,
      accountSecretCode,
      accountName,
      accountEmail,
      accountPassword,
    } = req.body;

    // TODO
    // if (!(await verifyTotpSecret(accountSecretCode, companyName))) {
    //   throw new Error(
    //     "Invalid secret code provided for administrator account creation",
    //   );
    // }

    const createdAccount = await AuthService.registerAccount(
      accountName,
      accountEmail,
      accountPassword,
    );

    const enterpriseDomain = await DomainService.getDomainByName(companyName);

    if (!enterpriseDomain) {
      throw new Error("domain of the organization not found");
    }
  } catch (error: any) {
    res.status(500).json({ message: "Error: ", error });
  }
};
