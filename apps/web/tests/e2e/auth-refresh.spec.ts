import { test, expect } from '@playwright/test'

test('401 triggers refresh then retries successfully', async ({ page }) => {
  let firstGet = true
  await page.route('**/api/storage?*', async (route, req) => {
    if (req.method() === 'GET' && firstGet) {
      firstGet = false
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
    }
    return route.continue()
  })

  let refreshCalled = false
  await page.route('**/api/auth/refresh', async (route) => {
    refreshCalled = true
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'eyJhbGciOi...dummy' }) })
  })

  await page.goto('/play/demo-app-id')
  await expect.poll(() => refreshCalled).toBeTruthy()
})
