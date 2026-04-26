import mongoose, { Schema, Document } from "mongoose";

export interface INotificationSubscription extends Document {
  accountName: string;
  domainName: string;
  createdAt: Date;
}

const SubscriptionSchema: Schema = new Schema({
  accountName: { type: String, required: true, index: true },
  domainName: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
});

// Enforce unique combinations of user + domain
SubscriptionSchema.index({ accountName: 1, domainName: 1 }, { unique: true });

export default mongoose.model<INotificationSubscription>(
  "NotificationSubscription",
  SubscriptionSchema,
);