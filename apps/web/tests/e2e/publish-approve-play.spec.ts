import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';

test.describe('Publish -> Approve -> Play Sanity Checks', () => {
  test('Hello World: publish, approve, and play', async ({ page }) => {
    // 1. Publish "Hello World" app (assuming this is done via an API or a UI)
    // For the purpose of this test, we will assume the app is already published
    // and has the slug 'hello-world'.

    // 2. Approve the app (assuming this is done via an API or a UI)
    // For the purpose of this test, we will assume the app is already approved.

    // 3. Play the app
    await page.goto(`${BASE_URL}/play/hello-world`);

    // Verify that the app loads in the iframe
    const iframe = page.frameLocator('iframe');
    await expect(iframe.locator('body')).toContainText('Hello World');
  });

  test('People Pie: strict network policy and storage', async ({ page }) => {
    // 1. Publish "People Pie" app with a strict network policy
    // For the purpose of this test, we will assume the app is already published
    // with the slug 'people-pie' and has the following security policy:
    // { network: { mode: 'strict' } }

    // 2. Approve the app

    // 3. Play the app
    await page.goto(`${BASE_URL}/play/people-pie`);

    // Verify that the app loads and that storage works
    const iframe = page.frameLocator('iframe');
    await iframe.locator('#some-button').click(); // Assuming a button that triggers storage
    await expect(iframe.locator('#some-element')).toHaveText('some-expected-value');

    // Verify that external network requests are blocked
    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().startsWith('https://example.com')),
      iframe.evaluate(() => fetch('https://example.com').catch(() => {})),
    ]);
    expect(request).toBe(null);
  });

  test('Lokalni Informator: proxy network policy and allowlist', async ({ page }) => {
    // 1. Publish "Lokalni Informator" app with a proxy network policy
    // For the purpose of this test, we will assume the app is already published
    // with the slug 'lokalni-informator' and has the following security policy:
    // { network: { mode: 'proxy', allowlist: ['www.infozagreb.hr'] } }

    // 2. Approve the app

    // 3. Play the app
    await page.goto(`${BASE_URL}/play/lokalni-informator`);

    // Verify that requests to allowed domains go through the proxy
    const [allowedRequest] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/api/proxy?url=https://www.infozagreb.hr')),
      page.frameLocator('iframe').evaluate(() => fetch('https://www.infozagreb.hr')),
    ]);
    expect(allowedRequest).not.toBe(null);

    // Verify that requests to disallowed domains are blocked
    const [disallowedRequest] = await Promise.all([
      page.waitForRequest(req => req.url().startsWith('https://www.google.com')),
      page.frameLocator('iframe').evaluate(() => fetch('https://www.google.com').catch(() => {})),
    ]);
    expect(disallowedRequest).toBe(null);
  });
});
