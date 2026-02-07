import { Schema, model, Document } from "mongoose";
import { membershipSchema, type IDomainMembership } from "./domain.js";

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  memberships: IDomainMembership[];
}

const userSchema = new Schema<IUser>({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  memberships: [membershipSchema],
});

export const User = model<IUser>("User", userSchema);
