import { Schema, model, Document, Types } from "mongoose";
import type { Role } from "./roles.js";
import { ROLE_WEIGHTS } from "./roles.js";

export interface ISSOConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
}

export interface IDomainTOTPSecrets {
  business_admin?: string;
  business_staff?: string;
  standard_customer?: string;
}

export interface IDomain extends Document {
  name: string;
  subdomains: Types.ObjectId[];
  authStrategy: "internal" | "oidc";
  totpSecrets: IDomainTOTPSecrets;
  ssoConfig?: ISSOConfig;
  isVisibleFromOutside?: boolean;
}

export interface IDomainMembership {
  domainName: string;
  role: Role;
  externalId?: string;
}

const ssoConfigSchema = new Schema<ISSOConfig>(
  {
    issuerUrl: { type: String },
    clientId: { type: String },
    clientSecret: { type: String, select: false },
  },
  { _id: false },
);

const totpSecretsSchema = new Schema<IDomainTOTPSecrets>(
  {
    business_admin: { type: String },
    business_staff: { type: String },
    standard_customer: { type: String },
  },
  { _id: false },
);

export const domainSchema = new Schema<IDomain>({
  name: { type: String, required: true, unique: true },
  subdomains: [{ type: Schema.Types.ObjectId, ref: "Domain", default: [] }],
  authStrategy: {
    type: String,
    enum: ["internal", "oidc"],
    default: "internal",
  },
  totpSecrets: { type: totpSecretsSchema, default: {}, select: false },
  ssoConfig: ssoConfigSchema,
  isVisibleFromOutside: { type: Boolean, required: false, default: false },
});

export const membershipSchema = new Schema<IDomainMembership>(
  {
    domainName: { type: String, required: true },
    role: { type: String, enum: Object.keys(ROLE_WEIGHTS), required: true },
    externalId: { type: String },
  },
  { _id: false },
);

export const Domain = model<IDomain>("Domain", domainSchema);
