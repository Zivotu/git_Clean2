 import { Page, FrameLocator } from '@playwright/test'
 export async function openPlay(page: Page, appId: string) {
   await page.goto(`/play/${appId}`)
   await page.waitForSelector('iframe')
 }
 export async function getIframe(page: Page) {
   const frame = page.frameLocator('iframe')
   await frame.locator('body').waitFor()
   return frame
 }
 export async function setItemsInIframe(frame: FrameLocator, n: number) {
   for (let i = 0; i < n; i++) {
     await frame.evaluate(([k, v]) => localStorage.setItem(k, v), [`k${Date.now()}-${Math.random()}`, `${i}`])
   }
 }