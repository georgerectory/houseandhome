// check-frontend-road.mjs - drive the Road Ahead page in the browser gate.
//
// Measuring the default render proves the page draws; it does not prove
// the what-ifs do anything. So this switches a scenario, moves a slider,
// resets, copies, sorts, filters, opens and closes a card, asks for an
// assessment, opens a money ladder and follows a shared link - and after
// each asks whether the figures actually moved, whether the URL kept up
// and whether the page still fits. Called once per viewport and theme by
// check-frontend.mjs.

const wait = (page, ms = 180) => page.waitForTimeout(ms);

/** What the page shows now: enough to tell one state from another. */
const look = (page) => page.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
  sum: document.querySelector('[data-sum]')?.textContent.trim() ?? '',
  firstBar: document.querySelector('.rd-bars__value')?.textContent.trim() ?? '',
  on: document.querySelector('[data-scenario].is-on')?.dataset.scenario ?? null,
  pressed: document.querySelector('[data-scenario][aria-pressed="true"]')?.dataset.scenario ?? null,
  status: document.querySelector('[data-status]')?.textContent.trim() ?? '',
  changed: [...document.querySelectorAll('.rd-ctl.is-changed')].map((el) => el.dataset.ctl),
  rows: document.querySelectorAll('.rd-reg tbody tr').length,
  firstRow: document.querySelector('.rd-reg tbody [data-listing]')?.dataset.listing ?? null,
  card: document.querySelector('[data-card]')?.textContent.trim().length ?? 0,
  expanded: [...document.querySelectorAll('[data-listing][aria-expanded="true"]')].map((b) => b.dataset.listing),
  allPressed: document.querySelector('[data-filter="all"]')?.getAttribute('aria-pressed') === 'true',
  search: location.search,
}));

/** Move a slider the way a finger does: set it, then say so. */
const slide = (page, id, value) => page.evaluate(([sel, v]) => {
  const el = document.querySelector(sel);
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, [`#rd-${id}`, value]);

/**
 * @param {import('playwright').Page} page on road.html, rendered
 * @param {{label:string, failures:string[], errors:string[], measure:Function, url:string}} ctx
 */
export async function driveRoad(page, { label, failures, errors, measure, url }) {
  const fail = (m) => failures.push(`${label}: ${m}`);
  const fits = (r, where) => { if (r.scrollW > r.clientW + 1) fail(`page scroll ${where} (${r.scrollW} > ${r.clientW})`); };
  // A control that is not there is a finding, not a crash: a broken page
  // must fail with a reason rather than time the whole gate out.
  const tap = async (sel, what) => {
    try { await page.click(sel, { timeout: 4000 }); return true; } catch { fail(`could not ${what} (${sel})`); return false; }
  };

  const base = await look(page);
  if (!base.sum.includes('£')) fail('the bar shows no forever-home budgets');
  if (!base.on || base.on !== base.pressed) fail(`the scenario on (${base.on}) and the one pressed (${base.pressed}) disagree`);

  // A scenario pill changes the figures, the pressed pill and the URL.
  await tap('[data-scenario="promotion"]', 'press the Promotion pill');
  await wait(page);
  const promo = await look(page);
  if (promo.on !== 'promotion' || promo.pressed !== 'promotion') fail('the Promotion pill did not become the one pressed');
  if (promo.sum === base.sum) fail('switching to Promotion did not move a forever-home budget');
  if (promo.firstBar === base.firstBar) fail('switching to Promotion did not move the first budget bar');
  if (!promo.search.includes('s=promotion')) fail('the scenario did not reach the URL');
  fits(promo, 'under Promotion');

  // The Adjust sheet: a slider moves the figures and says what it was.
  await tap('.rd-adjust > summary', 'open Adjust');
  await wait(page, 120);
  const sheet = await measure(page);
  if (sheet.overflow.length) fail(`with Adjust open, ${sheet.overflow.length} element(s) overflow - ${sheet.overflow[0]}`);
  if (sheet.smallTargets.length) fail(`with Adjust open, a target is below 24px - ${sheet.smallTargets[0]}`);
  await slide(page, 'rise', 15000);
  await wait(page);
  const slid = await look(page);
  if (slid.sum === promo.sum) fail('moving the 2027 pay rise did not move a forever-home budget');
  if (!slid.changed.includes('rise')) fail('the moved slider is not marked as a what-if');
  if (!slid.search.includes('rise=15000')) fail('the what-if did not reach the URL');
  if (!/1 what-if/.test(slid.status)) fail(`the status line does not count the what-if: "${slid.status}"`);
  fits(slid, 'after a what-if');

  // Copy for Claude: the clipboard, or the box to copy from by hand.
  await tap('[data-copy]', 'press Copy for Claude');
  await wait(page, 200);
  const copied = await page.evaluate(() => ({
    status: document.querySelector('[data-status]')?.textContent ?? '',
    box: !document.querySelector('[data-copy-box]')?.hidden,
    text: document.querySelector('[data-copy-text]')?.value ?? '',
  }));
  if (!/^Copied/.test(copied.status) && !copied.box) fail('Copy for Claude neither copied nor showed the message');
  if (!/Road Ahead/.test(copied.text) || !/15,000/.test(copied.text)) fail('the message for Claude does not name the what-if');

  // Reset takes the what-ifs away and the figures back.
  await tap('[data-reset]', 'press Reset');
  await wait(page);
  const reset = await look(page);
  if (reset.changed.length) fail(`Reset left what-ifs marked: ${reset.changed.join(', ')}`);
  if (reset.sum !== promo.sum) fail('Reset did not bring the budgets back to Promotion\'s');
  if (reset.search.includes('rise=')) fail('Reset left the what-if in the URL');
  await tap('.rd-adjust > summary', 'close Adjust');
  await wait(page, 120);

  // The register: a column sorts both ways, a filter narrows or widens.
  await tap('[data-sort="profit_opt"]', 'sort by optimistic profit');
  await wait(page);
  const sortOf = () => page.getAttribute('th:has([data-sort="profit_opt"])', 'aria-sort', { timeout: 4000 }).catch(() => null);
  const sort1 = await sortOf();
  await tap('[data-sort="profit_opt"]', 'sort by optimistic profit again');
  await wait(page);
  const sort2 = await sortOf();
  const kept = await page.evaluate(() => document.activeElement?.dataset?.sort ?? null);
  if (kept !== 'profit_opt') fail(`after a sort the focus went to ${kept ?? 'nothing'}, not the column's button`);
  if (sort1 !== 'descending' || sort2 !== 'ascending') fail(`sorting by profit went ${sort1} then ${sort2}`);
  const before = await look(page);
  await tap('[data-filter="all"]', 'show all listings');
  await wait(page);
  const all = await look(page);
  if (all.rows < before.rows) fail('the All filter shows fewer listings than Live');
  if (!all.search.includes('f=all')) fail('the filter did not reach the URL');
  if (!all.allPressed) fail('the All filter is not marked pressed');

  // A listing opens its card; Close shuts it and hands focus back.
  const code = all.firstRow;
  if (!code) fail('the register has no listing to open');
  else {
    await tap(`[data-listing="${code}"]`, `open ${code}`);
    await wait(page, 300);
    const open = await look(page);
    if (open.card < 200) fail(`opening ${code} showed no card`);
    if (!open.search.includes(`l=${code}`)) fail('the open card did not reach the URL');
    if (!open.expanded.includes(code)) fail('the open listing is not marked expanded');
    const inCard = await measure(page);
    if (inCard.overflow.length) fail(`with a card open, ${inCard.overflow.length} element(s) overflow - ${inCard.overflow[0]}`);
    if (inCard.smallTargets.length) fail(`with a card open, a target is below 24px - ${inCard.smallTargets[0]}`);
    fits(open, 'with a card open');
    if (open.card >= 200 && await tap('[data-close]', 'close the card')) {
      await wait(page, 300);
      const shut = await page.evaluate(() => ({
        card: !!document.querySelector('[data-card]'),
        focus: document.activeElement?.dataset?.listing ?? null,
      }));
      if (shut.card) fail('Close left the card open');
      if (shut.focus !== code) fail(`Close sent focus to ${shut.focus ?? 'nothing'}, not back to ${code}`);
    }
  }

  // Assess: the latest answers, and a pasted listing copied for Claude
  // with the protocol. What was pasted survives a repaint.
  const PASTED = 'Invented: a 3-bed detached house, guide £250,000';
  if (!(await page.locator('.rd-answer').count())) fail('Assess shows none of the latest answers');
  await page.fill('[data-assess-text]', PASTED).catch(() => fail('could not paste into Assess'));
  await tap('[data-assess-copy]', 'copy a listing for Claude to assess');
  await wait(page, 200);
  const asked = await page.evaluate(() => ({
    status: document.querySelector('[data-status]')?.textContent ?? '',
    box: !document.querySelector('[data-copy-box]')?.hidden,
    text: document.querySelector('[data-copy-text]')?.value ?? '',
  }));
  if (!/^Copied/.test(asked.status) && !asked.box) fail('Copy for Claude to assess neither copied nor showed the message');
  if (!asked.text.includes(PASTED) || !asked.text.includes('ASSESS_PROPERTY.md')) {
    fail('the message to assess does not carry the pasted listing and the protocol');
  }
  if (await page.locator('[data-adjust-panel][open]').count()) await tap('.rd-adjust > summary', 'close Adjust');
  await tap('[data-scenario="base"]', 'press the Base pill');
  await wait(page);
  if (await page.inputValue('[data-assess-text]').catch(() => '') !== PASTED) fail('a repaint lost the pasted listing');
  const answered = await page.locator('.rd-answer [data-listing]').first().getAttribute('data-listing').catch(() => null);
  if (answered && await tap(`.rd-answer [data-listing="${answered}"]`, `open ${answered} from its answer`)) {
    await wait(page, 300);
    const opened = await look(page);
    if (!opened.search.includes(`l=${answered}`) || opened.card < 200) fail(`an answer did not open ${answered}`);
    await tap('[data-close]', 'close the card');
    await wait(page, 200);
  }

  // A road's money ladder is wide; it scrolls in its frame, not the page.
  const ladder = page.locator('.rd-road details > summary').first();
  if (await ladder.count()) {
    await ladder.click({ timeout: 4000 }).catch(() => fail('could not open a money ladder'));
    await wait(page, 150);
    fits(await look(page), 'with a money ladder open');
    if (!(await page.locator('.rd-road details[open] .rd-ladder tbody tr').count())) fail('the money ladder opened empty');
    // A what-if repaints the roads; the open ladder stays open.
    await tap('[data-scenario="optimistic"]', 'press the Optimistic pill');
    await wait(page);
    if (!(await page.locator('.rd-road details[open]').count())) fail('a repaint closed the open money ladder');
    await ladder.click({ timeout: 4000 }).catch(() => {});
  } else fail('no road has a money ladder');

  // A shared link opens the same view.
  await page.goto(`${url}?s=optimistic&rise=5000&l=L03`, { waitUntil: 'networkidle' });
  await wait(page, 300);
  const linked = await look(page);
  if (linked.on !== 'optimistic') fail(`a shared link to Optimistic opened ${linked.on}`);
  if (!linked.changed.includes('rise')) fail('a shared link lost its what-if');
  if (linked.card < 200) fail('a shared link lost its open card');
  fits(linked, 'from a shared link');

  if (errors.length) fail(`console error while driving Road Ahead - ${errors[0].slice(0, 140)}`);
}
