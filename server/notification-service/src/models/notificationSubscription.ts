import mongoose, { Schema, Document } from "mongoose";

export enum NotificationType {
  TEMPERATURE = "temperature",
}

interface SubscriptionPreference extends Document {
  isSubscribed: boolean;
  notificationType: NotificationType;
}

const SubscriptionPreferenceSchema = new Schema(
  {
    notificationType: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
    },
    isSubscribed: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { _id: false },
);

export interface INotificationSubscription extends Document {
  accountName: string;
  domainName: string;
  notificationTypes: SubscriptionPreference[];
  createdAt: Date;
}

const SubscriptionSchema: Schema = new Schema({
  accountName: { type: String, required: true, index: true },
  domainName: { type: String, required: true, index: true },
  preferences: [SubscriptionPreferenceSchema],
  createdAt: { type: Date, default: Date.now },
});

// Enforce unique combinations of user + domain
SubscriptionSchema.index({ accountName: 1, domainName: 1 }, { unique: true });

export default mongoose.model<INotificationSubscription>(
  "NotificationSubscription",
  SubscriptionSchema,
);