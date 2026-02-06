import { test } from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import pingRoutes from './ping'

test('POST /calculate should return correct sum', async () => {
  const fastify = Fastify()
  // Register the plugin (routes)
  await fastify.register(pingRoutes)

  // Inject a fake request
  const response = await fastify.inject({
    method: 'POST',
    url: '/calculate',
    payload: {
      x: 10,
      y: 5,
      operation: 'add'
    }
  })

  // Assertions
  assert.strictEqual(response.statusCode, 200)
  assert.deepStrictEqual(JSON.parse(response.payload), { result: 15 })
})

test('POST /calculate should fail on invalid input', async () => {
  const fastify = Fastify()
  await fastify.register(pingRoutes)

  const response = await fastify.inject({ method: 'POST', url: '/calculate', payload: { x: 'invalid' } })
  assert.strictEqual(response.statusCode, 400)
})


test('POST /calculate should fail on invalid input more strict', async () => {
  const fastify = Fastify()
  await fastify.register(pingRoutes)


  const response1 = await fastify.inject({
    method: 'POST',
    url: '/calculate',
    payload: {
      x: 10,
      y: 5,
      operation: 'Come stai'
    }
  })

  assert.strictEqual(response1.statusCode, 400)
})
