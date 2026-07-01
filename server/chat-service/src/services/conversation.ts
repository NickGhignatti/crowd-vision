import { Types } from "mongoose";
import {
  getHistoryMaxMessages,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGES,
  MAX_TITLE_LENGTH,
} from "../config/config.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../models/error.js";
import {
  Conversation,
  type ConversationDocument,
  type IChatMessage,
} from "../models/conversation.js";
import { askAgent } from "./agent.js";

const validateText = (value: unknown, name: string, maxLength: number) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${name} must be a non-empty string`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new ValidationError(`${name} cannot exceed ${maxLength} characters`);
  }
  return text;
};

const ownedConversation = async (userId: string, conversationId: string) => {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw new NotFoundError("Conversation not found");
  }
  const conversation = await Conversation.findOne({
    _id: conversationId,
    userId,
  });
  if (!conversation) throw new NotFoundError("Conversation not found");
  return conversation;
};

export const createConversation = (userId: string, title?: unknown) =>
  Conversation.create({
    userId,
    title: title === undefined ? "New chat" : validateText(title, "title", MAX_TITLE_LENGTH),
    messages: [],
  });

export const listConversations = (userId: string) =>
  Conversation.find({ userId })
    .sort({ updatedAt: -1 })
    .select("-messages")
    .lean();

export const getConversation = (userId: string, conversationId: string) =>
  ownedConversation(userId, conversationId);

export const renameConversation = async (
  userId: string,
  conversationId: string,
  title: unknown,
) => {
  const conversation = await ownedConversation(userId, conversationId);
  conversation.title = validateText(title, "title", MAX_TITLE_LENGTH);
  await conversation.save();
  return conversation;
};

export const deleteConversation = async (
  userId: string,
  conversationId: string,
) => {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw new NotFoundError("Conversation not found");
  }
  const deleted = await Conversation.findOneAndDelete({
    _id: conversationId,
    userId,
  });
  if (!deleted) throw new NotFoundError("Conversation not found");
};

export const sendMessage = async (
  userId: string,
  conversationId: string,
  content: unknown,
  cookie: string,
) => {
  const question = validateText(content, "content", MAX_MESSAGE_LENGTH);
  const conversation = await ownedConversation(userId, conversationId);
  if (conversation.messages.length + 2 > MAX_MESSAGES) {
    throw new ConflictError("Conversation message limit reached");
  }

  const history = conversation.messages
    .slice(-getHistoryMaxMessages())
    .map(({ role, content: previousContent }) => ({
      role,
      content: previousContent,
    }));
  const answer = await askAgent(question, history, cookie);
  const now = new Date();
  const userMessage: IChatMessage = {
    role: "user",
    content: question,
    createdAt: now,
  };
  const assistantMessage: IChatMessage = {
    role: "assistant",
    content: answer.answer,
    citations: answer.citations,
    createdAt: new Date(),
  };

  conversation.messages.push(userMessage, assistantMessage);
  if (conversation.title === "New chat" && conversation.messages.length === 2) {
    conversation.title = question.slice(0, MAX_TITLE_LENGTH);
  }
  await conversation.save();

  return conversation.messages.at(-1);
};

export const requireUserId = (userId: string | undefined) => {
  if (!userId) throw new ValidationError("Missing authenticated user id");
  return userId;
};

export const toJSON = (conversation: ConversationDocument) =>
  conversation.toJSON();
