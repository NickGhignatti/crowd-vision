import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

/**
 * The dashboard's connected-devices card, with the backend stubbed: telemetry sums the
 * building's devices, so the browser only shows what it answers and never adds rooms itself.
 */

const DOMAIN = 'eng'
const BUILDING = 'bldg-e2e'

const building = {
  id: BUILDING,
  name: 'Engineering Block',
  domains: [DOMAIN],
  rooms: [
    {
      id: 'Room-101',
      name: 'Room 101',
      capacity: 20,
      position: { x: 0, y: 2, z: 0 },
      dimensions: { width: 8, height: 4, depth: 6 },
    },
  ],
}

const wire = JSON.parse(
  readFileSync(new URL('../../schemas/fixtures/connected-devices.json', import.meta.url), 'utf8'),
) as { cases: { body: { totalDeviceCount: number; timestamp: number } }[] }

/** Stubs the dashboard's backend; `connected` answers the building's devices, or 404 when null. */
async function stubBackend(page: Page, connected: { status: number; body?: unknown }) {
  const json = (route: Route, body: unknown) => route.fulfill({ json: body })

  await page.route('**/gateway/me', (route) => json(route, { sub: 'u1', accountName: 'Tester' }))
  await page.route('**/tenancy/me/memberships', (route) =>
    json(route, [{ domain: DOMAIN, role: 'business_admin' }]),
  )
  await page.route(`**/twin/buildings/${DOMAIN}`, (route) => json(route, [building]))
  await page.route('**/telemetry/contracts', (route) => json(route, { metrics: [] }))
  await page.route('**/telemetry/*/dashboard*', (route) => json(route, { data: [] }))
  await page.route('**/telemetry/*/entireBuilding*', (route) => json(route, { data: [] }))
  await page.route(`**/telemetry/sensors/buildings/${BUILDING}`, (route) =>
    json(route, { data: [] }),
  )
  await page.route(`**/telemetry/simulation/buildings/${BUILDING}`, (route) =>
    json(route, { running: false }),
  )
  await page.route(`**/telemetry/connected-devices/buildings/${BUILDING}`, (route) =>
    route.fulfill({ status: connected.status, json: connected.body ?? { message: 'none' } }),
  )
}

const card = (page: Page) => page.getByRole('article').filter({ hasText: 'Connected devices' })

async function openDashboard(page: Page) {
  await page.goto('/dashboards')
  const later = page.getByRole('dialog', { name: /alerts/i }).getByRole('button', { name: 'Later' })
  if (await later.isVisible().catch(() => false)) await later.click()
}

test("shows the building's connected devices as telemetry sums them", async ({ page }) => {
  const [answer] = wire.cases
  await stubBackend(page, {
    status: 200,
    body: { ...answer!.body, buildingId: BUILDING, timestamp: Date.now() },
  })

  await openDashboard(page)

  await expect(card(page)).toContainText(String(answer!.body.totalDeviceCount))
  await expect(card(page)).toContainText('Across every router')
})

test('says so when the building never reported, instead of showing zero', async ({ page }) => {
  await stubBackend(page, { status: 404 })

  await openDashboard(page)

  await expect(card(page)).toContainText('—')
  await expect(card(page)).toContainText('No reading yet')
})

test('flags a figure the collector stopped refreshing', async ({ page }) => {
  const [answer] = wire.cases
  await stubBackend(page, {
    status: 200,
    body: { ...answer!.body, buildingId: BUILDING, timestamp: Date.now() - 10 * 60_000 },
  })

  await openDashboard(page)

  await expect(card(page)).toContainText('No report for 5+ min')
})
