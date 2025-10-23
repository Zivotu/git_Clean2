import { test, expect } from '@playwright/test';

test('iframe sandbox excludes allow-same-origin', async ({ page }) => {
  await page.goto('/play/demo-app-id');
  const sandbox = await page.locator('iframe').first().getAttribute('sandbox');
  expect(sandbox).not.toContain('allow-same-origin');
  expect(sandbox).toContain('allow-scripts');
});

test('parent sends CSP headers', async ({ page }) => {
  const response = await page.goto('/play/demo-app-id');
  expect(response).not.toBeNull();
  if (response) {
    const csp = response.headers()['content-security-policy'];
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  }
});
