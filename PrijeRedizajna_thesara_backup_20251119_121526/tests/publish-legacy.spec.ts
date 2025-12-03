
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';

test('Legacy scenario boot with correct CSP', async ({ page, request }) => {
  // 1. Create a legacy build via the testing endpoint
  const res = await request.post(`${BASE_URL}/api/testing/create-legacy-build`, {
    data: {
      inlineCode: `document.body.innerHTML = '<h1 id="test-header">Hello Legacy</h1>'`,
    },
  });
  expect(res.ok()).toBeTruthy();
  const { listingId } = await res.json();
  expect(listingId).toBeDefined();

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // 2. Navigate to the play page
  await page.goto(`${BASE_URL}/play/${listingId}`);

  // 3. Check for CSP errors
  const cspErrors = consoleErrors.filter((text) => text.includes('Content Security Policy'));
  expect(cspErrors).toHaveLength(0);

  // 4. Assert that the app content is rendered
  const header = page.frameLocator('iframe[src*="about:srcdoc"]').locator('#test-header');
  await expect(header).toBeVisible();
  await expect(header).toHaveText('Hello Legacy');
});
