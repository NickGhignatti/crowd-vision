import mongoose, { Schema, Document } from "mongoose";

export interface IWebPushSubscription extends Document {
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

const WebPushSubscriptionSchema: Schema = new Schema({
  userId: { type: String, required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
});

WebPushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

export default mongoose.model<IWebPushSubscription>(
  "WebPushSubscription",
  WebPushSubscriptionSchema,
);
