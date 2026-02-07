import { Schema, model, Document } from "mongoose";

export interface ISSOConfig {
  issuerUrl: string; // e.g. https://idp.unibo.it/auth/realms/master
  clientId: string;
  clientSecret: string; // select: false
}

export interface IDomain extends Document {
  name: string;
  subdomains: string[];
  authStrategy: "internal" | "oidc";
  ssoConfig?: ISSOConfig;
}

export interface IDomainMembership {
  domainName: string;
  role: "owner" | "admin" | "viewer";
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
  subdomains: { type: [String], default: [] },
  authStrategy: {
    type: String,
    enum: ["internal", "oidc"],
    default: "internal",
  },
  ssoConfig: ssoConfigSchema,
});

export const membershipSchema = new Schema<IDomainMembership>(
  {
    domainName: { type: String, required: true },
    role: {
      type: String,
      enum: ["owner", "admin", "viewer"],
      default: "viewer",
    },
    externalId: { type: String },
  },
  { _id: false },
);

export const Domain = model<IDomain>("Domain", domainSchema);
