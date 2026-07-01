import { InternalError } from "../models/error.js";

const readPositiveInteger = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) {
    throw new InternalError(`${name} must be a positive integer`);
  }
  return value;
};

export const COOKIE_NAME =
  process.env.JWT_COOKIE_NAME ?? "authentication_token";

export const getTokenSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new InternalError("Missing JWT_SECRET configuration");
  return secret;
};

export const getAgentBaseUrl = () =>
  process.env.AGENT_SERVICE_URL ?? "http://agent-service:3000";

export const getHistoryMaxMessages = () =>
  readPositiveInteger("HISTORY_MAX_MESSAGES", 10);

export const MAX_MESSAGES = 100;
export const MAX_MESSAGE_LENGTH = 8000;
export const MAX_TITLE_LENGTH = 120;
