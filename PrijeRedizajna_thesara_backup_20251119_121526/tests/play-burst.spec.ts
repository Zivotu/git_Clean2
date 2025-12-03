// tests/play-burst.spec.ts
import { test, expect } from '@playwright/test';

test('batch flush ~= 1 per 2s', async ({ page }) => {
  await page.goto('https://thesara.space/play/testers%2Fstorage-burst');
  const [reqs] = await Promise.all([
    (async () => {
      const calls: string[] = [];
      page.on('request', (r) => { if (r.url().includes('/api/storage') && r.method() === 'PATCH') calls.push(r.url()); });
      await page.click('#burst');
      await page.waitForTimeout(2500);
      return calls;
    })(),
  ]);
  expect(reqs.length).toBeLessThanOrEqual(2);
});