// The auctions arranged for the page: London's today, the dates from
// today with every lot's open steps, the month as weeks, each sale's lots
// with the step each is on, and results against their guides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  londonToday, addDays, daysBetween, dayMonth, agenda, monthGrid, sales, resultRows, playbookByKind,
} from '../../assets/js/engine/road-ahead/page/auctions.js';
import { auctionsHtml } from '../../assets/js/pages/road/auctions.js';

const D = JSON.parse(readFileSync(new URL('../../data/fixtures/road-ahead.json', import.meta.url), 'utf8'));
const TODAY = D.meta.generated;

test('today is London\'s, whatever the clock the reader is on', () => {
  // Half past midnight in a British summer: still yesterday in UTC.
  assert.equal(londonToday(new Date('2026-07-01T23:30:00Z')), '2026-07-02');
  // In winter London is UTC.
  assert.equal(londonToday(new Date('2026-12-01T23:30:00Z')), '2026-12-01');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(daysBetween('2026-09-30', '2026-10-21'), 21);
  assert.equal(dayMonth('2026-10-21'), '21 Oct');
});

test('the agenda runs from today: the houses\' dates and every open step, a day\'s lots on one line', () => {
  const items = agenda(D, TODAY);
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => i.on >= TODAY), 'nothing before today');
  assert.deepEqual(items.map((i) => i.on), [...items.map((i) => i.on)].sort(), 'in date order');
  const t21 = items.find((i) => i.kind === 'step' && i.on === TODAY);
  assert.ok(t21, 'the catalogue step due today is there');
  assert.ok(!t21.lots.some((l) => l.code === 'L03'), 'a step reported done is gone');
  assert.match(t21.what, /^Fairbank & Co 21 Oct: Catalogue out: .* \(lot 7, lot 9\)$/);
  assert.match(t21.short, /^Catalogue out: L01, L02$/);
  const moved = items.find((i) => i.status === 'moved');
  assert.equal(moved.notes, 'Moved from 25 November');
  assert.ok(items.filter((i) => i.kind !== 'step').every((i) => i.checked), 'every house date says when it was checked');
});

test('a month is weeks from Monday, every day once, each with what falls on it', () => {
  const items = agenda(D, TODAY);
  const weeks = monthGrid(2026, 10, items);
  assert.ok(weeks.every((w) => w.length === 7));
  const days = weeks.flat().filter((c) => c.date);
  assert.equal(days.length, 31);
  assert.equal(weeks[0].findIndex((c) => c.date === '2026-10-01'), 3, '1 October 2026 is a Thursday');
  const auctionDay = days.find((c) => c.date === '2026-10-21');
  assert.ok(auctionDay.items.some((i) => i.kind === 'auction'));
  assert.equal(monthGrid(2027, 2, []).flat().filter((c) => c.date).length, 28);
});

test('each sale to come lists its lots on the first step not done, with what is overdue', () => {
  const list = sales(D.pipeline, TODAY);
  assert.deepEqual(list.map((s) => s.on), [...list.map((s) => s.on)].sort());
  const fbk = list.find((s) => s.house === 'Fairbank & Co' && s.on === '2026-10-21');
  assert.deepEqual(fbk.lots.map((l) => l.lot), ['3', '7', '9'], 'in lot order');
  const l03 = fbk.lots.find((l) => l.code === 'L03');
  assert.equal(l03.next.step_key, 't-14', 'the done step is passed over');
  assert.equal(l03.done, 1);
  const later = sales(D.pipeline, '2026-10-10');
  assert.equal(later.find((s) => s.on === '2026-10-21').lots.find((l) => l.code === 'L01').overdue, 3,
    'catalogue, viewing and legal pack are overdue by the tenth');
  assert.ok(!sales(D.pipeline, '2026-12-01').length, 'a sale in the past is not listed');
});

test('results are newest first with the sold price against the guide; the playbook keeps its order', () => {
  const rows = resultRows(D.results);
  assert.deepEqual(rows.map((r) => r.sold_on), [...rows.map((r) => r.sold_on)].sort().reverse());
  assert.equal(Math.round(rows.find((r) => r.lot === '4').ratio * 100), 121);
  assert.equal(rows.find((r) => r.outcome === 'unsold').ratio, null);
  assert.deepEqual(playbookByKind(D.playbook).map((g) => g.kind), ['setup', 'daily', 'weekly', 'rule', 'did_not_work']);
});

test('the Auctions section draws without gaps, the grid hidden from assistive technology', () => {
  const html = auctionsHtml(D, TODAY);
  assert.ok(!/NaN|undefined|Infinity|\[object Object\]/.test(html));
  assert.equal((html.match(/class="rd-cal__grid" aria-hidden="true"/g) ?? []).length, 2, 'this month and next');
  assert.match(html, /Checked Mon 28 Sep/);
  assert.match(html, /<span class="chip">moved<\/span>/);
  assert.match(html, /data-listing="L03"/);
  assert.match(html, /121%/);
  const empty = auctionsHtml({ ...D, calendar: [], pipeline: [], results: [], playbook: [] }, TODAY);
  assert.match(empty, /Nothing dated in the next four months/);
  assert.match(empty, /No lot is being tracked/);
  assert.match(empty, /No results recorded yet/);
});
