import { Schema, model, Document } from "mongoose";
import { membershipSchema, type IDomainMembership } from "./domain.js";

export interface IAccount extends Document {
  name: string;
  email: string;
  password: string;
  memberships: IDomainMembership[];
  totpSecret?: string;
}

const accountSchema = new Schema<IAccount>({
  name: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  memberships: [membershipSchema],
  totpSecret: { type: String, required: false },
});

export const Account = model<IAccount>("Account", accountSchema);
