import type { Request, Response } from "express";
import * as AuthService from "../services/authentication.js";
import * as DomainService from "../services/domain.js";
import { generateStandardToken } from "../services/token.js";
import type { StandardTokenPayload } from "../models/token.js";
import { Account } from "../models/account.js";
import {
  type ConflictError,
  InternalError,
  NotFoundError,
} from "../models/error.js";

export const provideEnterpriseAccount = async (req: Request, res: Response) => {
  const { companyName, companyAdminMail, companyPassword, companyDomain } =
    req.body;

  const accountCreated = await AuthService.addAccount(
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

  const createdDomain = await DomainService.addDomain(
    companyDomain as string,
    [],
    accountCreated.name,
    "internal",
  );

  const token = await generateStandardToken({
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
};

export const provideEnterpriseAdministratorAccount = async (
  req: Request,
  res: Response,
) => {
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

  const createdAccount = await AuthService.addAccount(
    accountName,
    accountEmail,
    accountPassword,
  );

  const enterpriseDomain = await DomainService.getDomainByName(companyName);

  if (!enterpriseDomain) {
    throw new NotFoundError(`Enterprise domain with name "${companyName}" not found`);
  }
};
