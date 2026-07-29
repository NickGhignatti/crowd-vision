import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage()

page.on('console', (msg) => console.log(`[${msg.type()}] ${msg.text()}`))
page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`))

await page.goto('http://localhost:8080/_webgpu-smoke', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const pixels = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')
  const gl = canvas.getContext('webgl2')
  if (!gl) return 'no webgl2 context'
  const data = new Uint8Array(4)
  // sample a corner far from the boxes, should be pure clear color
  gl.readPixels(5, 5, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data)
  return Array.from(data)
})
console.log('corner pixel RGBA:', JSON.stringify(pixels))

await page.screenshot({ path: '_webgpu-smoke.png' })
await browser.close()
