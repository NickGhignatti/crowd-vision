import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

/**
 * Button-driven camera moves glide instead of jumping. The camera has no DOM handle, so this reads
 * it through the canvas: mid-move must differ from both the start and the end.
 */

const rooms = Array.from({ length: 12 }, (_, i) => ({
  id: `R-${i}`,
  name: `Room ${i}`,
  capacity: 10,
  position: { x: (i % 4) * 7, y: 2, z: Math.floor(i / 4) * 8 },
  dimensions: { width: 6, height: 4, depth: 7 },
}))

async function stubBackend(page: Page) {
  const json = (route: Route, body: unknown) => route.fulfill({ json: body })
  const api = /^\/(notification|dashboard|chat|agent|tenancy)\//
  await page.route(
    (url) => api.test(url.pathname),
    (r) => json(r, []),
  )
  await page.route('**/telemetry/**', (r) => json(r, { data: [] }))
  await page.route('**/gateway/me', (r) => json(r, { sub: 'u1', accountName: 'Tester' }))
  await page.route('**/tenancy/me/memberships', (r) =>
    json(r, [{ domain: 'eng', role: 'business_admin' }]),
  )
  await page.route('**/twin/buildings/eng', (r) =>
    json(r, [{ id: 'b', name: 'B', domains: ['eng'], rooms }]),
  )
  await page.route('**/twin/building/*/placements', (r) => json(r, []))
}

/** Presses a toolbar button through the DOM: the push prompt can sit over the toolbar. */
const press = (page: Page, title: string) =>
  page.evaluate((t) => document.querySelector<HTMLElement>(`button[title="${t}"]`)?.click(), title)

async function framesAround(page: Page) {
  const canvas = page.locator('canvas')
  await page.goto('/model')
  await expect(page.getByRole('button', { name: 'Top view' })).toBeVisible()
  await expect(canvas).toBeVisible()

  const start = await canvas.screenshot()
  await press(page, 'Top view')
  const middle = await canvas.screenshot()
  // Well past the glide, so the end is the settled view.
  await expect
    .poll(async () => (await canvas.screenshot()).equals(middle), { timeout: 3000 })
    .toBe(false)
  await page.evaluate(() => new Promise((done) => setTimeout(done, 800)))
  const end = await canvas.screenshot()
  return { start, middle, end }
}

test.beforeEach(async ({ page }) => {
  await stubBackend(page)
  // The dev server's DevTools button floats over the canvas and animates on its own.
  await page.addInitScript(() =>
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '#__vue-devtools-container__ { display: none !important }'
      document.head.append(style)
    }),
  )
})

test('the top-view button glides the camera instead of jumping', async ({ page }) => {
  const { start, middle, end } = await framesAround(page)
  expect(middle.equals(start)).toBe(false)
  expect(middle.equals(end)).toBe(false)
})

test('under reduced motion the same button jumps straight there', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const canvas = page.locator('canvas')
  await page.goto('/model')
  await expect(page.getByRole('button', { name: 'Top view' })).toBeVisible()
  const start = await canvas.screenshot()
  await press(page, 'Top view')
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )
  const next = await canvas.screenshot()
  await page.evaluate(() => new Promise((done) => setTimeout(done, 800)))
  const end = await canvas.screenshot()
  expect(next.equals(start)).toBe(false)
  expect(next.equals(end)).toBe(true)
})

test('grabbing the scene mid-glide hands the camera back to the user', async ({ page }) => {
  const canvas = page.locator('canvas')
  await page.goto('/model')
  await expect(page.getByRole('button', { name: 'Top view' })).toBeVisible()
  const settle = () => page.evaluate(() => new Promise((done) => setTimeout(done, 800)))
  const box = (await canvas.boundingBox())!

  const roundTrip = async () => {
    await press(page, 'Reset View')
    await settle()
    await press(page, 'Top view')
  }
  await roundTrip()
  await settle()
  const top = await canvas.screenshot()

  // Control run: the same round trip without a grab lands on the same frame.
  await roundTrip()
  await settle()
  expect((await canvas.screenshot()).equals(top)).toBe(true)

  await roundTrip()
  // A corner is empty sky, so the press grabs the orbit without selecting a room.
  await page.mouse.move(box.x + 8, box.y + 8)
  await page.mouse.down()
  await page.mouse.up()
  await settle()
  expect((await canvas.screenshot()).equals(top)).toBe(false)
})
