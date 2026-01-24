import { Schema } from 'mongoose';
import * as mongoose from "mongoose";

export interface IDomain {
    name: string;
    subdomain: string;
}

export interface UserParams {
    username: string;
}

const domainSchema = new Schema<IDomain>({
    name: { type: String, required: true },
    subdomain: { type: String, required: false, unique: false },
});

export interface IUser {
    username: string;
    email: string;
    password: string;
    domain: IDomain;
}

const userSchema = new Schema<IUser>({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    domain: { type: domainSchema, required: true },
});

export const User = mongoose.model<IUser>('User', userSchema);