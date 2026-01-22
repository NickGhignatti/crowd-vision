import { Schema } from 'mongoose';
import * as mongoose from "mongoose";

export interface IUser {
    username: string;
    email: string;
    password: string;
    domain: string;
}

const userSchema = new Schema<IUser>({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true},
    domain: { type: String, required: false },
});

export const User = mongoose.model<IUser>('User', userSchema);