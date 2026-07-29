import { Schema, model, type HydratedDocument } from "mongoose";
import { MAX_MESSAGE_LENGTH, MAX_MESSAGES, MAX_TITLE_LENGTH } from "../config/config.js";

export interface ICitation {
  chunk_id: string;
  document_id: string;
  source: string;
  section_path?: string | null;
}

export interface IChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: ICitation[];
  createdAt: Date;
}

export interface IConversation {
  userId: string;
  title: string;
  messages: IChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export type ConversationDocument = HydratedDocument<IConversation>;

const citationSchema = new Schema<ICitation>(
  {
    chunk_id: { type: String, required: true },
    document_id: { type: String, required: true },
    source: { type: String, required: true },
    section_path: { type: String, required: false },
  },
  { _id: false },
);

const messageSchema = new Schema<IChatMessage>(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: MAX_MESSAGE_LENGTH,
    },
    citations: { type: [citationSchema], required: false },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { _id: true },
);

const conversationSchema = new Schema<IConversation>(
  {
    userId: { type: String, required: true, index: true },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: MAX_TITLE_LENGTH,
      default: "New chat",
    },
    messages: {
      type: [messageSchema],
      default: [],
      validate: {
        validator: (messages: IChatMessage[]) => messages.length <= MAX_MESSAGES,
        message: `A conversation cannot exceed ${MAX_MESSAGES} messages`,
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_document, result) => {
        const { __v: _version, ...json } = result;
        return json;
      },
    },
  },
);

conversationSchema.index({ userId: 1, updatedAt: -1 });

export const Conversation = model<IConversation>(
  "Conversation",
  conversationSchema,
);
