import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyPluginOptions,
} from "fastify";
import { llmResponse } from "../agents";
import { MessageLLMSchema, messageLLM } from "../schemas/llm.schema";

const generalRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
) => {
  fastify.get("/health", async (request, reply) => {
    return { pong: "it works!" };
  });

  fastify.post<{ Body: messageLLM }>(
    "/msg",
    {
      schema: {
        body: MessageLLMSchema,
      },
    },
    async (request, reply) => {
      const msg: string = request.body.msg;
      fastify.log.debug("Received /msg request");
      try {
        const result = await llmResponse(msg);
        return result;
      } catch (err) {
        fastify.log.error({ err }, "llmResponse failed");
        return reply.code(500).send({ error: "Internal server error" });
      }
    },
  );
};

// export const autoPrefix = "/agent";

export default generalRoutes;
