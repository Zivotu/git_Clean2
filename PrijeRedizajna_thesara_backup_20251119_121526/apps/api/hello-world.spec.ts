import { test, expect, type Page } from '@playwright/test'

const APP_ID = process.env.E2E_APP_ID || '1'
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'

async function verifyNetwork(page: Page) {
  const requests = {
    shim: false,
    manifest: false,
    bundle: false,
  }

  page.on('request', (request) => {
    const url = request.url()
    if (url.endsWith('/shim.js') || url.endsWith('/shims/rooms.js')) {
      requests.shim = true
    } else if (url.includes('/manifest_v1.json')) {
      requests.manifest = true
    } else if (url.includes('/app.bundle.js')) {
      requests.bundle = true
    }
  })

  await page.waitForTimeout(5000) // Wait for requests to settle

  expect(requests.shim, 'Shim script should be loaded').toBe(true)
  expect(requests.manifest, 'Manifest should be loaded').toBe(true)
  expect(requests.bundle, 'Bundle script should be loaded').toBe(true)
}

test.describe('Hello World App', () => {
  test('should boot without CSP errors and initialize storage', async ({ page }) => {
    const cspErrors: string[] = []
    page.on('pageerror', (error) => {
      if (error.message.includes('Content-Security-Policy')) {
        cspErrors.push(error.message)
      }
    })

    const messages: any[] = []
    page.on('console', (msg) => {
      if (msg.text().startsWith('[thesara:')) {
        messages.push(msg.text())
      }
    })

    await page.goto(`/play/${APP_ID}`)

    // 1. Verify network requests for critical assets
    await verifyNetwork(page)

    // 2. Check for CSP violations
    expect(cspErrors, 'Should have no CSP errors').toHaveLength(0)

    // 3. Check for successful shim/storage handshake
    await expect.poll(() => messages.some(m => m.includes('thesara:shim:ready')), { timeout: 10000 }).toBeTruthy()
    await expect.poll(() => messages.some(m => m.includes('thesara:storage:init')), { timeout: 10000 }).toBeTruthy()
  })
})