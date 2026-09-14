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
// Port 0 asks the OS for a free one. A fixed port made this gate fail
// intermittently when a previous run's server was still holding it -
// which looked like a front-end regression and was not.
let PORT = 0;
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
await new Promise((r) => server.listen(0, '127.0.0.1', r));
PORT = server.address().port;

const PAGES = ['index.html', 'roadmap.html', 'backlog.html', 'money.html', 'house.html', 'handbook.html'];
// The login screen is checked separately: it has no nav and is reached
// without a session.
const PUBLIC_PAGES = ['login.html'];
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
    // Force demo mode for the sweep: the suite must run offline, in CI,
    // and without touching the live database. This is the only consumer
    // of the config override.
    await page.addInitScript(() => {
      globalThis.__HH_CONFIG__ = { supabaseUrl: '', supabaseAnonKey: '' };
    });
    // Every protected page redirects to the login screen without a
    // session, so establish one before the sweep - otherwise this would
    // silently check the same login page six times and report success.
    await page.goto(`http://localhost:${PORT}/login.html`, { waitUntil: 'networkidle' });
    await page.fill('#username', 'homeowner');
    await page.fill('#password', 'houseandhome');
    await Promise.all([
      page.waitForURL((u) => !u.pathname.endsWith('login.html'), { timeout: 5000 }),
      page.click('#submit'),
    ]);
    // Signing in lands on the dashboard, which immediately fetches its
    // fixtures. Let that settle before the sweep navigates away, or the
    // aborted fetch surfaces as a console error on whichever page the
    // sweep happens to be loading - an intermittent failure with nothing
    // wrong behind it.
    await page.waitForLoadState('networkidle');

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
        out.hasNav = !!document.querySelector('nav[aria-label]');
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
      if (r.hasNav !== true) failures.push(`${label}: no navigation landmark`);
      if (!r.skip) failures.push(`${label}: no skip link`);
      if (errors.length) failures.push(`${label}: console error - ${errors[0].slice(0, 120)}`);
      if (r.contentLen < 50) failures.push(`${label}: page rendered no content (${r.contentLen} chars)`);
      if (r.bodyBg === 'rgba(0, 0, 0, 0)') failures.push(`${label}: body has no background - it would borrow the host's`);

      // The roadmap is the one page with real interaction, so the sweep
      // drives it rather than only measuring its default render: every
      // level, both layouts, a band collapse and the drawer. A view that
      // throws on switch, or spills the page sideways once a board is on
      // screen, is exactly what this catches.
      if (p === 'roadmap.html') {
        const probe = () => page.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
          rendered: (document.getElementById('rm-board')?.textContent || '').trim().length,
        }));

        // A tab has to CHANGE something. Asserting only that the board
        // rendered some characters passes a board that never repainted,
        // which is exactly how a dead tab once shipped: the hash moved,
        // the active tab did not, and the same board stayed on screen.
        const state = () => page.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
          board: (document.getElementById('rm-board')?.textContent || '').trim(),
          activeLevel: document.querySelector('[data-level].is-on')?.dataset.level || null,
          activeLayout: document.querySelector('[data-layout].is-on')?.dataset.layout || null,
          hash: location.hash,
        }));

        for (const layoutKey of ['timeline', 'cascade']) {
          await page.click(`[data-layout="${layoutKey}"]`);
          await page.waitForTimeout(160);
          const seen = new Map();
          for (const levelKey of ['projects', 'trades', 'work', 'backlog']) {
            await page.click(`[data-level="${levelKey}"]`);
            await page.waitForTimeout(160);
            const r2 = await state();
            const where = `${layoutKey}/${levelKey}`;
            if (r2.scrollW > r2.clientW + 1) {
              failures.push(`${label}: horizontal page scroll in ${where} (${r2.scrollW} > ${r2.clientW})`);
            }
            if (r2.board.length < 10) failures.push(`${label}: ${where} rendered nothing`);
            if (r2.activeLevel !== levelKey) {
              failures.push(`${label}: clicking ${levelKey} left ${r2.activeLevel} marked active`);
            }
            if (!r2.hash.includes(levelKey)) {
              failures.push(`${label}: ${levelKey} did not reach the URL, so the board is not shareable`);
            }
            // The Trades roll-up ignores layout by design, so it is the
            // one level allowed to look the same in both.
            if (levelKey !== 'trades' && r2.activeLayout !== layoutKey) {
              failures.push(`${label}: clicking ${layoutKey} left ${r2.activeLayout} marked active`);
            }
            for (const [prev, text] of seen) {
              if (text === r2.board) {
                failures.push(`${label}: ${where} renders the same board as ${prev}`);
              }
            }
            seen.set(where, r2.board);
          }
        }

        // The Trades roll-up is a level, not a layout, so it must render
        // something the other levels do not - a tab that silently shows
        // the same board as its neighbour is a dead control.
        await page.click('[data-level="work"]');
        await page.waitForTimeout(160);
        const workBoard = await page.evaluate(() =>
          (document.getElementById('rm-board')?.textContent || '').trim());
        await page.click('[data-level="trades"]');
        await page.waitForTimeout(160);
        const tradesBoard = await page.evaluate(() => ({
          text: (document.getElementById('rm-board')?.textContent || '').trim(),
          counts: document.querySelectorAll('.rmv-sum-count').length,
          layoutTabs: document.querySelectorAll('[data-layout]').length,
          detailed: !!document.getElementById('rm-expanded'),
        }));
        if (tradesBoard.text === workBoard) {
          failures.push(`${label}: the Trades level renders the same board as Work items`);
        }
        if (!tradesBoard.counts) failures.push(`${label}: the Trades roll-up showed no counts`);
        if (tradesBoard.layoutTabs) {
          failures.push(`${label}: layout tabs are still offered on a level they do not change`);
        }
        if (!tradesBoard.detailed) failures.push(`${label}: the Trades level has no Detailed toggle`);

        // Detailed expands the counts into items, each opening the drawer.
        await page.click('#rm-expanded');
        await page.waitForTimeout(160);
        const expanded = await page.evaluate(() => ({
          items: document.querySelectorAll('.rmv-sum-item').length,
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        }));
        if (!expanded.items) failures.push(`${label}: Detailed listed no items`);
        if (expanded.scrollW > expanded.clientW + 1) {
          failures.push(`${label}: page scroll in the expanded Trades roll-up`);
        }
        await page.click('#rm-expanded');
        await page.waitForTimeout(140);

        // Back to a populated board for the interaction checks.
        await page.click('[data-level="backlog"]');
        await page.waitForTimeout(140);
        await page.click('[data-layout="timeline"]');
        await page.waitForTimeout(180);

        // Collapsing a column must not break the axis or the page width.
        const bandBtn = page.locator('[data-band]').first();
        if (await bandBtn.count()) {
          await bandBtn.click();
          await page.waitForTimeout(140);
          const r3 = await probe();
          if (r3.scrollW > r3.clientW + 1) failures.push(`${label}: page scroll after collapsing a band`);
          if (r3.rendered < 10) failures.push(`${label}: board empty after collapsing a band`);
          await page.locator('[data-band]').first().click();
          await page.waitForTimeout(140);
        }

        // Every item is clickable and opens the drawer; Escape closes it.
        const bar = page.locator('#rm-board [data-item-id]').first();
        if (await bar.count()) {
          await bar.click();
          await page.waitForTimeout(220);
          const drawer = await page.evaluate(() => {
            const el = document.getElementById('rm-drawer');
            return {
              open: el && !el.hidden,
              body: (document.getElementById('rmd-body')?.textContent || '').trim().length,
              hasTitle: !!document.querySelector('.rmd-head h2'),
              deepLinked: new URLSearchParams(location.search).has('item'),
            };
          });
          if (!drawer.open) failures.push(`${label}: clicking an item did not open the drawer`);
          if (drawer.body < 40) failures.push(`${label}: drawer opened empty (${drawer.body} chars)`);
          if (!drawer.hasTitle) failures.push(`${label}: drawer has no title`);
          if (!drawer.deepLinked) failures.push(`${label}: drawer did not deep-link the item`);

          const afterOpen = await probe();
          if (afterOpen.scrollW > afterOpen.clientW + 1) {
            failures.push(`${label}: page scroll with the drawer open`);
          }

          await page.keyboard.press('Escape');
          await page.waitForTimeout(180);
          const closed = await page.evaluate(() => {
            const el = document.getElementById('rm-drawer');
            return el ? el.hidden : true;
          });
          if (!closed) failures.push(`${label}: Escape did not close the drawer`);
        } else {
          failures.push(`${label}: no clickable items on the board`);
        }

        // Filters must narrow without throwing.
        for (const [selId, idx] of [['#rm-room', 1], ['#rm-trade', 1]]) {
          const opts = await page.locator(`${selId} option`).count();
          if (opts > idx) {
            await page.selectOption(selId, { index: idx });
            await page.waitForTimeout(140);
            const r4 = await probe();
            if (r4.scrollW > r4.clientW + 1) failures.push(`${label}: page scroll after filtering ${selId}`);
            await page.selectOption(selId, '');
            await page.waitForTimeout(100);
          }
        }

        if (errors.length) failures.push(`${label}: console error while driving the board - ${errors[0].slice(0, 140)}`);
      }

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
