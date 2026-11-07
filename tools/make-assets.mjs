/**
 * Regenerate public/og.png and the PNG icons from the app's own art.
 * Needs the dev server running (npm run dev) and Playwright:
 *   npx -y -p playwright@1 node tools/make-assets.mjs   (first run: npx playwright install chromium)
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const base = process.env.DEV_URL ?? 'http://127.0.0.1:5173'
const browser = await chromium.launch()

const og = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await og.goto(`${base}/tools/og.html`)
await og.waitForTimeout(1500) // fonts + a few animation frames
await og.screenshot({ path: 'public/og.png' })
console.log('wrote public/og.png')

const svg = readFileSync('public/favicon.svg', 'utf8')
for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<body style="margin:0"><img style="width:${size}px;height:${size}px;image-rendering:pixelated;display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body>`)
  await page.screenshot({ path: `public/${file}` })
  console.log(`wrote public/${file}`)
}
await browser.close()
