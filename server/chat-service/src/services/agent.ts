import { getAgentBaseUrl } from "../config/config.js";
import { BadGatewayError } from "../models/error.js";
import type { ICitation } from "../models/conversation.js";

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface AskResponse {
  answer: string;
  citations: ICitation[];
}

export const askAgent = async (
  question: string,
  history: HistoryMessage[],
  claimsHeader: string,
): Promise<AskResponse> => {
  let response: Response;
  try {
    response = await fetch(`${getAgentBaseUrl()}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gateway-claims": claimsHeader,
      },
      body: JSON.stringify({ question, history, stream: false }),
    });
  } catch {
    throw new BadGatewayError("Could not reach agent-service");
  }

  if (!response.ok) {
    throw new BadGatewayError(`agent-service returned ${response.status}`);
  }

  const payload = (await response.json()) as Partial<AskResponse>;
  if (typeof payload.answer !== "string" || !Array.isArray(payload.citations)) {
    throw new BadGatewayError("agent-service returned an invalid response");
  }

  return { answer: payload.answer, citations: payload.citations };
};
