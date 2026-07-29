import type { Request, Response } from "express";
import * as ConversationService from "../services/conversation.js";
import { ValidationError } from "../models/error.js";

export const createConversation = async (req: Request, res: Response) => {
  const conversation = await ConversationService.createConversation(
    ConversationService.requireUserId(req.userId),
    req.body?.title,
  );
  res.status(201).json(conversation);
};

export const listConversations = async (req: Request, res: Response) => {
  const conversations = await ConversationService.listConversations(
    ConversationService.requireUserId(req.userId),
  );
  res.json({ conversations });
};

export const getConversation = async (req: Request, res: Response) => {
  const conversation = await ConversationService.getConversation(
    ConversationService.requireUserId(req.userId),
    req.params.id as string,
  );
  res.json(conversation);
};

export const renameConversation = async (req: Request, res: Response) => {
  const conversation = await ConversationService.renameConversation(
    ConversationService.requireUserId(req.userId),
    req.params.id as string,
    req.body?.title,
  );
  res.json(conversation);
};

export const deleteConversation = async (req: Request, res: Response) => {
  await ConversationService.deleteConversation(
    ConversationService.requireUserId(req.userId),
    req.params.id as string,
  );
  res.status(204).send();
};

export const sendMessage = async (req: Request, res: Response) => {
  if (!req.authToken) throw new ValidationError("Missing authentication token");

  const message = await ConversationService.sendMessage(
    ConversationService.requireUserId(req.userId),
    req.params.id as string,
    req.body?.content,
    req.authToken,
  );
  res.status(201).json(message);
};
