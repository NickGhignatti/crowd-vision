import fastify from 'fastify'
import autoload from '@fastify/autoload'
import path from 'path'

const server = fastify({
  logger: true
})

// Register routes
server.register(autoload, {
  dir: path.join(__dirname, 'routes'),
  options: { prefix: '/api' }
})

// Start the server
const start = async () => {
  try {
    await server.listen({ port: 3000, host: '0.0.0.0' })
    console.log('Server listening on port 3000')
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
