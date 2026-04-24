import mongoose, { Schema, Document } from "mongoose";

export interface INotificationSubscription extends Document {
  userId: string;
  domainId: string;
  createdAt: Date;
}

const SubscriptionSchema: Schema = new Schema({
  userId: { type: String, required: true, index: true },
  domainId: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
});

// Enforce unique combinations of user + domain
SubscriptionSchema.index({ userId: 1, domainId: 1 }, { unique: true });

export default mongoose.model<INotificationSubscription>(
  "NotificationSubscription",
  SubscriptionSchema,
);