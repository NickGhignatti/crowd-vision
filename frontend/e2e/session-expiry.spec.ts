import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

/**
 * An expired session must not leave the app looking signed in. The first 401 on a gated call
 * ends it: home, and a banner that says why. The twin view is used because it calls the API on
 * its own, so the expiry needs no test-only hook.
 */

/** Serves a signed-in session that dies at the first gated call. */
async function stubExpiredBackend(page: Page) {
  const json = (route: Route, body: unknown) => route.fulfill({ json: body })
  const unauthorized = (route: Route) =>
    route.fulfill({ status: 401, contentType: 'text/plain', body: 'invalid token\n' })

  let expired = false

  await page.route(
    (url) => /^\/(dashboard|chat|agent|tenancy)\//.test(url.pathname),
    (r) => json(r, []),
  )
  await page.route('**/telemetry/**', (r) => json(r, { data: [] }))
  await page.route('**/notification/preferences/*', (r) => json(r, { accountPreferences: [] }))
  await page.route('**/tenancy/me/memberships', (r) =>
    json(r, [{ domain: 'eng', role: 'business_admin' }]),
  )
  // Once the pass is refused, the socket's reconnect must stay refused too, or the stub would
  // hand the app a fresh session and the redirect could be undone.
  await page.route('**/gateway/me', (r) =>
    expired ? unauthorized(r) : json(r, { sub: 'u1', accountName: 'Tester' }),
  )
  await page.route('**/twin/buildings/eng', (r) => {
    expired = true
    return unauthorized(r)
  })
  await page.route('**/twin/building/*/placements', (r) => json(r, []))
}

test('an expired session sends the user home with a banner, not a silent 401', async ({ page }) => {
  await stubExpiredBackend(page)
  await page.goto('/model')

  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await expect(page.getByRole('alert')).toContainText('Your session has expired')
})

test('the banner asks for a sign-in and can be dismissed', async ({ page }) => {
  await stubExpiredBackend(page)
  await page.goto('/model')

  const banner = page.getByRole('alert')
  await expect(banner).toBeVisible({ timeout: 15_000 })

  await banner.getByRole('button', { name: 'Login' }).click()
  const loginDialog = page.getByRole('dialog', { name: 'Welcome Back!' })
  await expect(loginDialog).toBeVisible()
  await loginDialog.getByRole('button', { name: 'Close' }).click()
  await expect(loginDialog).toBeHidden()

  await banner.getByRole('button', { name: 'Dismiss' }).click()
  await expect(banner).toBeHidden()
})
