// Captures the public site for the promo, the README and danieldeusing.de/apps/seedr
// (docs/promo-video.md §1). The public site only, so no internal host can be in frame.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const SITE = 'https://seedr.danieldeusing.de'
const PAGES = [
  { file: '01-home.png', path: '/' },
  { file: '02-skills.png', path: '/skills' },
  { file: '03-skill-detail.png', path: '/skills/skill-optimizer' },
  { file: '04-plugins.png', path: '/plugins' },
]

async function capture(browser, deviceScaleFactor, dir) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor })
  await context.addInitScript(() => {
    localStorage.setItem('theme', 'warm')
    localStorage.setItem('anim', 'off')
  })
  const page = await context.newPage()
  for (const { file, path } of PAGES) {
    await page.goto(SITE + path, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `${dir}/${file}` })
    console.log(`${dir}/${file}`)
  }
  await context.close()
}

mkdirSync('out/captures', { recursive: true })
const browser = await chromium.launch()
try {
  await capture(browser, 2, 'out/captures')
  await capture(browser, 1, 'assets')
} finally {
  await browser.close()
}
