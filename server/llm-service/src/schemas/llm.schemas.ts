import { Type, Static } from '@sinclair/typebox';

export const messageLLMSchema = Type.Object({
  msg: Type.String(),
});

export type messageLLM = Static<typeof messageLLMSchema>
