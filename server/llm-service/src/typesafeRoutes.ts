import Fastify from 'fastify'

const server = Fastify()

interface UserBody {
  name: string
  email: string
}

interface UserParams {
  id: string
}

interface UserQuerystring {
  search?: string
}

// Type-safe POST route
server.post<{ Body: UserBody }>('/users', async (request, reply) => {
  const { name, email } = request.body // Types are inferred
  return { success: true, user: { name, email } }
})

// Type-safe GET route with params
server.get<{ Params: UserParams }>('/users/:id', async (request, reply) => {
  const { id } = request.params // Type is string
  return { id }
})

// Type-safe GET route with querystring
server.get<{ Querystring: UserQuerystring }>('/users', async (request, reply) => {
  const { search } = request.query // Type is string | undefined
  return { results: [], query: search }
})

export default server;
