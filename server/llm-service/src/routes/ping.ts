import { FastifyInstance, FastifyPluginAsync, FastifyPluginOptions } from 'fastify'
import { PingSchema, Ping, CalculateBody, CalculateBodySchema} from '../schemas/ping.schema'

const pingRoutes: FastifyPluginAsync = async (fastify: FastifyInstance, options: FastifyPluginOptions) => {
  fastify.get('/', async (request, reply) => {
    return { pong: 'it works!' }
  })

  fastify.get<{ Params: { ping: string } }>('/:ping', {
    schema: {
        response: {
            200: PingSchema
      }
    }
  }, async (request, reply) => {
    const { ping: param } = request.params
    const ping: Ping = { id: param, name: 'ping', email: 'ping@example.com', age: 0 }
    return ping
  })

  // Type-safe POST route
  // Note: Ideally, move this to a dedicated users.ts file
  fastify.post<{ Body: { name: string; email: string } }>('/users', async (request, reply) => {
    const { name, email } = request.body // Types are inferred
    return { success: true, user: { name, email } }
  })

  // Fully Type-Safe Route (Runtime Validation + Compile-time Inference)
  fastify.post<{ Body: CalculateBody }>('/calculate', {
    schema: {
      body: CalculateBodySchema
    }
  }, async (request, reply) => {
    const { x, y, operation } = request.body

    const result = operation === 'add' ? x + y : x * y
    return { result }
  })
}

export const autoPrefix = '/ping';

export default pingRoutes;