import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI!;

export function connectMongo() {
    return mongoose.connect(MONGO_URI)
}