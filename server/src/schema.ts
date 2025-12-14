import { Schema } from 'mongoose';

export interface IUser {
    username: string;
    email: string;
    password: string;
}

export const userSchema = new Schema<IUser>({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true}
});