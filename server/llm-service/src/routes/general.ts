import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyPluginOptions,
} from "fastify";
import { llmResponse } from "../agents";
import { messageLLMSchema, messageLLM } from "../schemas/llm.schemas";

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
        body: messageLLMSchema,
      },
    },
    async (request, reply) => {
      const msg: string = request.body.msg;
      console.log("this is the message: " + msg)
      return await llmResponse(msg);
    },
  );

};

export const autoPrefix = "/llm";

export default generalRoutes;
