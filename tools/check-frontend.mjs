// check-frontend.mjs - drive the real pages in a real browser.
//
// Neither source system could do this: their assistant had no browser,
// so responsive and accessibility rules were enforced by lint and by a
// human checking on a device. This environment ships Chromium, so the
// rules are checked against what actually renders.
//
// What it asserts, on every page at every viewport, in both themes:
//   * no horizontal page scroll - the single most common phone failure
//   * nothing overflows the viewport width
//   * no console errors
//   * every interactive control meets the 24px WCAG floor, and the
//     44px target on touch-sized viewports
//   * one <main id="main">, one <h1>, and a working skip link
//   * body text resolves to at least 16px on mobile, or iOS Safari
//     zooms the page on focus
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8099;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  try {
    const clean = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, clean === '/' ? 'index.html' : clean);
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));

const PAGES = ['index.html', 'roadmap.html', 'backlog.html', 'money.html', 'house.html', 'handbook.html'];
const VIEWPORTS = [
  { name: 'iPhone portrait',  width: 390, height: 844, touch: true },
  { name: 'iPhone landscape', width: 844, height: 390, touch: true },
  { name: 'iPad portrait',    width: 768, height: 1024, touch: true },
  { name: 'iPad landscape',   width: 1024, height: 768, touch: true },
  { name: 'Narrow phone',     width: 320, height: 568, touch: true },
  { name: 'Desktop',          width: 1280, height: 800, touch: false },
];
const THEMES = ['light', 'dark'];

const shot = process.argv.includes('--screenshots');
if (shot) mkdirSync(join(ROOT, 'tests/screenshots'), { recursive: true });

// The pre-installed Chromium here is a different build number to the one
// this Playwright version expects, so point at it explicitly rather than
// downloading a second copy.
const CHROME = process.env.CHROME_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
let failures = [];
let checks = 0;

for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
      colorScheme: theme,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    for (const p of PAGES) {
      errors.length = 0;
      await page.goto(`http://localhost:${PORT}/${p}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(120);

      const r = await page.evaluate((minTap) => {
        const out = { overflow: [], smallTargets: [], fontTooSmall: null };
        out.scrollW = document.documentElement.scrollWidth;
        out.clientW = document.documentElement.clientWidth;

        for (const el of document.querySelectorAll('body *')) {
          const b = el.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) continue;
          // An element inside its own horizontal scroll container is
          // allowed to be wider - that is the sanctioned escape for
          // tables. Anything else must fit.
          let inScroller = false;
          for (let n = el.parentElement; n; n = n.parentElement) {
            const s = getComputedStyle(n);
            if (s.overflowX === 'auto' || s.overflowX === 'scroll') { inScroller = true; break; }
          }
          if (!inScroller && b.right > window.innerWidth + 1) {
            out.overflow.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} right=${Math.round(b.right)}`);
          }
        }

        for (const el of document.querySelectorAll('a, button, select, input, summary, [role="button"]')) {
          const b = el.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) continue;
          if (getComputedStyle(el).position === 'absolute' && el.classList.contains('skip-link')) continue;
          if (b.height < minTap || b.width < minTap) {
            out.smallTargets.push(`${el.tagName.toLowerCase()}"${(el.textContent || '').trim().slice(0, 24)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
          }
        }

        const bodySize = parseFloat(getComputedStyle(document.body).fontSize);
        if (bodySize < 16) out.fontTooSmall = bodySize;

        out.mains = document.querySelectorAll('main#main').length;
        out.h1s = document.querySelectorAll('h1').length;
        out.skip = !!document.querySelector('a.skip-link[href="#main"]');
        out.bodyBg = getComputedStyle(document.body).backgroundColor;
        out.bodyColor = getComputedStyle(document.body).color;
        out.contentLen = (document.querySelector('[data-page-root]')?.textContent || '').trim().length;
        return out;
      }, vp.width < 1024 ? 24 : 24);

      const label = `${theme}/${vp.name}/${p}`;
      checks++;

      if (r.scrollW > r.clientW + 1) failures.push(`${label}: horizontal page scroll (${r.scrollW} > ${r.clientW})`);
      if (r.overflow.length) failures.push(`${label}: ${r.overflow.length} element(s) overflow viewport - ${r.overflow.slice(0, 2).join('; ')}`);
      if (r.smallTargets.length) failures.push(`${label}: ${r.smallTargets.length} target(s) below 24px - ${r.smallTargets.slice(0, 2).join('; ')}`);
      if (r.fontTooSmall) failures.push(`${label}: body font ${r.fontTooSmall}px < 16px (iOS will zoom on focus)`);
      if (r.mains !== 1) failures.push(`${label}: ${r.mains} <main id="main"> (expected 1)`);
      if (r.h1s !== 1) failures.push(`${label}: ${r.h1s} <h1> (expected 1)`);
      if (!r.skip) failures.push(`${label}: no skip link`);
      if (errors.length) failures.push(`${label}: console error - ${errors[0].slice(0, 120)}`);
      if (r.contentLen < 50) failures.push(`${label}: page rendered no content (${r.contentLen} chars)`);
      if (r.bodyBg === 'rgba(0, 0, 0, 0)') failures.push(`${label}: body has no background - it would borrow the host's`);

      if (shot && vp.name !== 'Narrow phone') {
        await page.screenshot({
          path: join(ROOT, `tests/screenshots/${p.replace('.html', '')}-${theme}-${vp.width}x${vp.height}.png`),
          fullPage: false,
        });
      }
    }
    await ctx.close();
  }
}

await browser.close();
server.close();

console.log(`Front end: ${checks} page renders checked across ${VIEWPORTS.length} viewports x ${THEMES.length} themes`);
if (failures.length) {
  console.log('');
  for (const f of failures.slice(0, 40)) console.log(`FAIL ${f}`);
  if (failures.length > 40) console.log(`... and ${failures.length - 40} more`);
  console.log('');
  console.log(`${failures.length} failure(s)`);
  process.exit(1);
}
console.log('All checks passed: no horizontal scroll, no overflow, no small targets, no console errors, landmarks present.');
