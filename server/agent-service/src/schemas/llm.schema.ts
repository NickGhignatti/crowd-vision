import { Type, Static } from "@sinclair/typebox";

export const MessageLLMSchema = Type.Object({
  msg: Type.String(),
});

export type messageLLM = Static<typeof MessageLLMSchema>;
