/**
 * Regenerate public/og.png (the 1200x630 link-preview card) from the app's own art.
 * App icons (favicon.svg, apple-touch-icon.png, icon-192/512.png) are hand-made: this script
 * never touches them.
 *
 * Needs the dev server running (npm run dev) and Playwright:
 *   npx -y -p playwright@1 node tools/make-assets.mjs   (first run: npx playwright install chromium)
 */
import { chromium } from 'playwright'

const base = process.env.DEV_URL ?? 'http://127.0.0.1:5173'
const browser = await chromium.launch()
const og = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await og.goto(`${base}/tools/og.html`)
await og.waitForTimeout(1500) // fonts + a few animation frames
await og.screenshot({ path: 'public/og.png' })
console.log('wrote public/og.png')
await browser.close()
