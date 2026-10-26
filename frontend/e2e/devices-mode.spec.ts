/**
 * Devices mode joins the building's socket room and draws what twin sends on `devices`. The socket
 * is faked at the WebSocket level (engine.io v4 framing), so the real socket.io client runs.
 */
import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

const rooms = ['R-0', 'R-1'].map((id, i) => ({
  id,
  name: id,
  capacity: 10,
  position: { x: i * 7, y: 2, z: 0 },
  dimensions: { width: 6, height: 4, depth: 7 },
}))

const device = (room: string, connected: boolean) => ({
  floor: 0,
  room,
  x: 1,
  y: 0,
  z: 1,
  radius: 2,
  connected,
})

async function stubBackend(page: Page) {
  const json = (route: Route, body: unknown) => route.fulfill({ json: body })
  // Anchored to the path start: a glob like **/chat/** also matches the dev server's own modules.
  const api = /^\/(notification|dashboard|chat|agent|tenancy)\//
  await page.route(
    (url) => api.test(url.pathname),
    (r) => json(r, []),
  )
  // The socket connects only once preferences load, so these need their real shape.
  await page.route('**/notification/preferences/*', (r) => json(r, { accountPreferences: [] }))
  await page.route('**/telemetry/**', (r) => json(r, { data: [] }))
  await page.route('**/gateway/me', (r) => json(r, { sub: 'u', accountName: 'T' }))
  await page.route('**/tenancy/me/memberships', (r) =>
    json(r, [{ domain: 'eng', role: 'business_admin' }]),
  )
  await page.route('**/twin/buildings/eng', (r) =>
    json(r, [{ id: 'b', name: 'B', domains: ['eng'], rooms }]),
  )
  await page.route('**/twin/building/*/placements', (r) => json(r, []))
}

/** A socket.io server that answers the handshake and records which rooms the client joined. */
async function fakeSocket(page: Page) {
  const joined: string[] = []
  let send: (event: string, body: unknown) => void = () => {}
  // Matched on the path, not a regex over the whole URL, which any host could also satisfy.
  await page.routeWebSocket(
    (url) => url.pathname.startsWith('/socket.io/'),
    (ws) => {
      ws.send('0{"sid":"e2e","upgrades":[],"pingInterval":25000,"pingTimeout":20000}')
      send = (event, body) => ws.send(`42${JSON.stringify([event, body])}`)
      ws.onMessage((message) => {
        const text = String(message)
        if (text.startsWith('40')) ws.send('40{"sid":"e2e-socket"}')
        const join = /^42\["subscribe_building","([^"]+)"\]/.exec(text)
        if (join) joined.push(join[1]!)
      })
    },
  )
  return { joined, emit: (event: string, body: unknown) => send(event, body) }
}

test('devices mode shows the live devices of the building on screen', async ({ page }) => {
  await stubBackend(page)
  const socket = await fakeSocket(page)
  await page.goto('/model')

  const showDevices = page.getByRole('button', { name: 'Show devices' })
  await expect(showDevices).toBeVisible()
  // Through the DOM: the push prompt can sit over the toolbar, and it is not what is under test.
  await page.evaluate(() =>
    document.querySelector<HTMLElement>('button[title="Show devices"]')?.click(),
  )
  await expect(showDevices).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => socket.joined).toContain('b')

  const legend = page.getByRole('status').filter({ hasText: /Wi-Fi|devices/ })
  await expect(legend).toHaveText(/No live devices/)

  const now = Date.now()
  socket.emit('devices', {
    buildingId: 'b',
    tick: now,
    devices: [device('R-0', true), device('R-1', true), device('R-1', false), device('gone', true)],
  })
  // The device in a room not on screen is left out.
  await expect(legend).toHaveText(/On the Wi-Fi\s*2/)
  await expect(legend).toHaveText(/Passing by\s*1/)

  // Another building's tick, and a tick older than the one shown, both change nothing.
  socket.emit('devices', { buildingId: 'other', tick: now + 1, devices: [] })
  socket.emit('devices', { buildingId: 'b', tick: now - 1, devices: [] })
  await expect(legend).toHaveText(/On the Wi-Fi\s*2/)

  socket.emit('devices', { buildingId: 'b', tick: now + 10_000, devices: [] })
  await expect(legend).toHaveText(/No live devices/)
})
