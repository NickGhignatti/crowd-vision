import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

/**
 * The dashboard's simulator toggle, with the backend stubbed: telemetry decides what is
 * simulated, so the browser's only job is to ask it — and never to reach a simulator itself.
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

/** Stubs the dashboard's backend; the simulation route answers `startStatus` to a start. */
async function stubBackend(page: Page, startStatus = 204): Promise<string[]> {
  const calls: string[] = []
  let running = false
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

  await page.route(`**/telemetry/simulation/buildings/${BUILDING}`, (route) => {
    const method = route.request().method()
    calls.push(method)
    if (method === 'GET') return json(route, { running })
    if (method === 'PUT' && startStatus !== 204) {
      return route.fulfill({ status: startStatus, json: { message: 'simulator did not start.' } })
    }
    running = method === 'PUT'
    return route.fulfill({ status: 204, body: '' })
  })

  return calls
}

/** The push-notification prompt opens over the page and would swallow the clicks. */
async function dismissAlertsPrompt(page: Page) {
  const later = page.getByRole('dialog', { name: /alerts/i }).getByRole('button', { name: 'Later' })
  if (await later.isVisible().catch(() => false)) await later.click()
}

async function openCharts(page: Page) {
  await page.goto('/dashboards')
  await dismissAlertsPrompt(page)
  await page.getByRole('radio', { name: 'Graphs' }).click()
}

const startButton = (page: Page) => page.getByRole('button', { name: 'Start Simulator' })
const stopButton = (page: Page) => page.getByRole('button', { name: 'Stop Simulator' })

test('starts and stops the simulation through telemetry, never a simulator', async ({ page }) => {
  const calls = await stubBackend(page)
  const direct: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/simulator/')) direct.push(request.url())
  })

  await openCharts(page)
  await startButton(page).click()
  await expect(stopButton(page)).toBeVisible()
  await stopButton(page).click()
  await expect(startButton(page)).toBeVisible()

  expect(calls.filter((method) => method !== 'GET')).toEqual(['PUT', 'DELETE'])
  expect(direct).toEqual([])
})

test('a start telemetry refuses leaves the toggle on Start', async ({ page }) => {
  const calls = await stubBackend(page, 502)

  await openCharts(page)
  await startButton(page).click()

  await expect.poll(() => calls.filter((method) => method === 'PUT').length).toBe(1)
  await expect(startButton(page)).toBeVisible()
})
