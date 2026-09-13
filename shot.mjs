import { chromium } from 'playwright-core';
import fs from 'node:fs';
const exe = ['/opt/pw-browsers/chromium/chrome-linux/chrome','/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p=>fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
for (const spec of process.argv.slice(2)) {
  const [name, path, w, h] = spec.split('|');
  const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`http://localhost:3130${path}`, { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: `/tmp/claude-0/${name}.png`, fullPage: true });
  console.log(`${name}: overflow=${overflow} errors=${errs.length}`);
  await ctx.close();
}
await browser.close();
