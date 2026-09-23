import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

/**
 * The sensor editor end to end, with telemetry and digital-twin stubbed: the flow is worth a
 * browser (3D picking, drafts, one Save for many edits), the services are not — they have their
 * own suites. Every stub records what the app sent, so the test asserts the two batches too.
 */

const DOMAIN = 'eng'
const BUILDING = 'bldg-e2e'
const ROOM = 'Room-101'

const building = {
  id: BUILDING,
  name: 'Engineering Block',
  domains: [DOMAIN],
  rooms: [
    {
      id: ROOM,
      name: 'Room 101',
      capacity: 20,
      position: { x: 0, y: 2, z: 0 },
      dimensions: { width: 8, height: 4, depth: 6 },
    },
  ],
}

const devices = {
  devices: [
    { kind: 'router', label: 'Router', metrics: ['totalDeviceCount', 'ratioDeviceCount'] },
    { kind: 'temperature', label: 'Thermostat', metrics: ['temperature'] },
  ],
}

interface Saved {
  sensors: Record<string, unknown>[]
  placements: Record<string, unknown>[]
}

/** Serves the app a building with no sensors, and remembers what Save sent. */
async function stubBackend(page: Page): Promise<Saved> {
  const saved: Saved = { sensors: [], placements: [] }
  const json = (route: Route, body: unknown) => route.fulfill({ json: body })

  await page.route('**/gateway/me', (route) => json(route, { sub: 'u1', accountName: 'Tester' }))
  // The wire shape is `domain`; the store maps it to `domainName` itself.
  await page.route('**/tenancy/me/memberships', (route) =>
    json(route, [{ domain: DOMAIN, role: 'business_admin' }]),
  )
  await page.route(`**/twin/buildings/${DOMAIN}`, (route) => json(route, [building]))
  await page.route('**/telemetry/devices', (route) => json(route, devices))
  await page.route('**/telemetry/contracts', (route) => json(route, { metrics: [] }))
  await page.route('**/telemetry/*/dashboard*', (route) => json(route, { data: [] }))
  await page.route('**/telemetry/*/entireBuilding*', (route) => json(route, { data: [] }))

  // The lists answer with whatever has been saved so far, so a reload shows the real result.
  await page.route(`**/telemetry/sensors/buildings/${BUILDING}`, async (route) => {
    if (route.request().method() !== 'POST') return json(route, { data: saved.sensors })

    const batch = route.request().postDataJSON()
    const created = (batch.create ?? []).map((item: { ref: string }, index: number) => ({
      ref: item.ref,
      sensorId: `srv-${index}`,
    }))
    saved.sensors.push(
      ...(batch.create ?? []).map((item: Record<string, unknown>, index: number) => ({
        buildingId: BUILDING,
        sensorId: `srv-${index}`,
        name: item.name,
        sensorType: item.sensorType,
        roomId: item.roomId ?? null,
        actions: [],
      })),
    )
    saved.sensors = saved.sensors.filter((s) => !(batch.delete ?? []).includes(s.sensorId))
    return json(route, { created })
  })

  await page.route(`**/twin/building/${BUILDING}/placements`, async (route) => {
    if (route.request().method() !== 'PUT') return json(route, saved.placements)
    const batch = route.request().postDataJSON()
    saved.placements.push(...(batch.upsert ?? []))
    return route.fulfill({ status: 204, body: '' })
  })

  return saved
}

const editSensors = (page: Page) => page.getByRole('button', { name: 'Edit sensors' })
const roomCard = (page: Page) => page.getByRole('button', { name: /Room 101/ }).first()
/** Three buttons read "Add sensor" — toolbar, sidebar, form — so the room flow stays in its section. */
const roomSensors = (page: Page) => page.getByRole('region', { name: 'Sensors' })

async function addToRoom(page: Page, name: string) {
  const section = roomSensors(page)
  await section.getByRole('button', { name: 'Add sensor' }).click()
  await section.getByLabel('Sensor name').fill(name)
  await section.getByRole('button', { name: 'Thermostat' }).click()
  await section.getByRole('button', { name: 'Add sensor' }).click()
}

/** The push-notification prompt opens over the sidebar and would swallow the clicks. */
async function dismissAlertsPrompt(page: Page) {
  const later = page.getByRole('dialog', { name: /alerts/i }).getByRole('button', { name: 'Later' })
  if (await later.isVisible().catch(() => false)) await later.click()
}

test.beforeEach(async ({ page }) => {
  await stubBackend(page)
})

test('adds a sensor to a room, saves it, and keeps it across a reload', async ({ page }) => {
  await page.goto('/model')

  await dismissAlertsPrompt(page)
  await editSensors(page).click()
  await roomCard(page).click()
  await addToRoom(page, 'Lab thermostat')

  // Drafted only: it is listed, counted as unsaved, and nothing has been sent.
  await expect(page.getByText('Lab thermostat')).toBeVisible()
  await expect(page.getByText('1 unsaved change')).toBeVisible()

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('No unsaved changes')).toBeVisible()

  await page.reload()
  await dismissAlertsPrompt(page)
  await editSensors(page).click()
  await roomCard(page).click()
  await expect(page.getByText('Lab thermostat')).toBeVisible()
})

test('sends one telemetry batch and one twin batch for a point sensor', async ({ page }) => {
  const saved = await stubBackend(page)
  await page.goto('/model')

  await dismissAlertsPrompt(page)
  await editSensors(page).click()
  await page.getByRole('button', { name: 'Add sensor' }).first().click()
  await page.getByLabel('Sensor name').fill('Yard router')
  await page.getByRole('button', { name: 'Router' }).click()
  await page.getByRole('radio', { name: 'At a point' }).click()
  await page.getByRole('button', { name: 'Place' }).click()

  // Click the scene: the ground plane is the only thing under the cursor out here.
  const canvas = page.locator('canvas')
  const box = (await canvas.boundingBox())!
  await canvas.click({ position: { x: box.width / 2, y: box.height * 0.8 } })

  await page.getByRole('button', { name: 'Place here' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('No unsaved changes')).toBeVisible()

  expect(saved.sensors).toHaveLength(1)
  expect(saved.sensors[0]).toMatchObject({ name: 'Yard router', sensorType: 'router' })
  expect(saved.placements).toHaveLength(1)
  expect(saved.placements[0]).toMatchObject({ sensorId: 'srv-0' })
})

test('removes a sensor, and the removal reaches telemetry', async ({ page }) => {
  const saved = await stubBackend(page)
  await page.goto('/model')

  await dismissAlertsPrompt(page)
  await editSensors(page).click()
  await roomCard(page).click()
  await addToRoom(page, 'Doomed sensor')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('No unsaved changes')).toBeVisible()

  await page.getByRole('button', { name: 'Remove sensor' }).click()
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Doomed sensor')).toBeHidden()
  expect(saved.sensors).toHaveLength(0)
})
