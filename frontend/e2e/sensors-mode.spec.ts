/**
 * Sensors mode draws pins and badges as sprites built outside Tres. Two ways that went wrong
 * before this test existed: a node material passed as a prop re-rendered the sprite forever, and
 * one declared as a tag has no constructor in Tres. Both only show once the mode is switched on.
 */
import { expect, test } from '@playwright/test'

test('sensors mode draws pins and badges without breaking the scene', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e.stack ?? e).slice(0, 600)))

  const rooms = Array.from({ length: 6 }, (_, i) => ({
    id: `R-${i}`,
    name: `Room ${i}`,
    capacity: 10,
    position: { x: i * 7, y: 2, z: 0 },
    dimensions: { width: 6, height: 4, depth: 7 },
  }))
  const sensors = rooms.map((r, i) => ({
    buildingId: 'b',
    sensorId: `s-${i}`,
    name: `S${i}`,
    sensorType: 'router',
    roomId: r.id,
    actions: [],
  }))
  const json = (route: import('@playwright/test').Route, body: unknown) =>
    route.fulfill({ json: body })
  // Anchored to the path start: a glob like **/chat/** also matches the dev server's own modules.
  const api = /^\/(notification|dashboard|chat|agent|tenancy)\//
  await page.route(
    (url) => api.test(url.pathname),
    (r) => json(r, []),
  )
  await page.route('**/telemetry/**', (r) => json(r, { data: [] }))
  await page.route('**/gateway/me', (r) => json(r, { sub: 'u', accountName: 'T' }))
  await page.route('**/tenancy/me/memberships', (r) =>
    json(r, [{ domain: 'eng', role: 'business_admin' }]),
  )
  await page.route('**/twin/buildings/eng', (r) =>
    json(r, [{ id: 'b', name: 'B', domains: ['eng'], rooms }]),
  )
  await page.route('**/telemetry/devices', (r) =>
    json(r, { devices: [{ kind: 'router', label: 'Router', metrics: [] }] }),
  )
  await page.route('**/telemetry/sensors/buildings/*', (r) => json(r, { data: sensors }))
  await page.route('**/twin/building/*/placements', (r) =>
    json(
      r,
      sensors.map((s, i) => ({ sensorId: s.sensorId, position: { x: i * 7, y: 4, z: 0 } })),
    ),
  )

  await page.goto('/model')
  const showSensors = page.getByRole('button', { name: 'Show sensors' })
  await expect(page.locator('canvas')).toBeVisible()
  await expect(showSensors).toBeVisible()

  // Through the DOM: the push prompt can sit over the toolbar, and it is not what is under test.
  await page.evaluate(() =>
    document.querySelector<HTMLElement>('button[title="Show sensors"]')?.click(),
  )
  await expect(showSensors).toHaveAttribute('aria-pressed', 'true')
  // A render loop or a missing constructor throws within the first frames after mounting.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )

  // Other panels choke on these stubs; only errors from the scene are this test's business.
  expect(errors.filter((e) => /sprite|sensor|three|tres|recursive|constructor/i.test(e))).toEqual(
    [],
  )
  await expect(page.locator('canvas')).toBeVisible()
})
