import { Schema, model, Document } from "mongoose";
import type { Role } from "./roles.js";
import { ROLE_WEIGHTS } from "./roles.js";

export interface ISSOConfig {
  issuerUrl: string; // e.g. https://idp.unibo.it/auth/realms/master
  clientId: string;
  clientSecret: string; // select: false
}

export interface IDomain extends Document {
  name: string;
  subdomains: IDomain[];
  authStrategy: "internal" | "oidc";
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
    clientSecret: { type: String, select: false }, // Hidden by default
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
