// Road Ahead's shortlist: the owner's own list, still on the market,
// likeliest first, as a name, a link, a description and a price. The
// order is worked out, never typed; then the section drawn from the demo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shortlist, reactionRank, linkLabel } from '../../assets/js/engine/road-ahead/page/shortlist.js';
import { resolve } from '../../assets/js/engine/road-ahead/page/resolve.js';
import { registerRows } from '../../assets/js/engine/road-ahead/page/model.js';
import { shortlistHtml } from '../../assets/js/pages/road/shortlist.js';

const D = JSON.parse(readFileSync(new URL('../../data/fixtures/road-ahead.json', import.meta.url), 'utf8'));
const TODAY = '2026-10-01';

// A register row as registerRows() gives it: the listing, its inputs and its numbers now.
const R = (code, row = {}, grade = 'Strong', likely = 300000) => ({
  row: { code, name: `${code} Lane`, purpose: 'candidate', status: 'chase', links: [], ...row },
  L: likely == null ? null : { likely_buy: likely },
  now: grade == null ? null : { grade },
});
const codes = (rows, today = TODAY, opts) => shortlist(rows, today, opts).rows.map((s) => s.code);

test('the shortlist is the owner\'s own list, still on the market', () => {
  const rows = [
    R('A'), R('B', { status: 'offer' }), R('C', { status: 'watch' }), R('D', { status: 'dropped' }),
    R('E', { purpose: 'benchmark' }), R('F', { auction_on: '2026-09-28' }), R('G', { auction_on: TODAY }),
    R('H', { status: 'viewing', auction_on: '2026-11-19' }),
  ];
  assert.deepEqual(codes(rows).sort(), ['A', 'B', 'G', 'H'],
    'watched, dropped and benchmark listings are not on it, nor an auction already held; one held today still is');
});

test('likeliest first: how far along, then the money, then the owner\'s reaction, then the date', () => {
  assert.deepEqual(codes([R('A', {}, 'Strong'), R('B', { status: 'offer' }, 'Over budget')]), ['B', 'A'],
    'an offer made comes before a listing only being chased, whatever the money says');
  assert.deepEqual(codes([R('A', {}, 'Over budget'), R('B', {}, 'Strong (stretch)'), R('C', {}, 'Strong'),
    R('D', {}, 'Worth pursuing'), R('E', {}, null, null)]), ['C', 'B', 'D', 'A', 'E'],
  'in reach before a stretch, over budget last, one not appraised after that');
  assert.deepEqual(codes([R('A', {}), R('B', { reaction: 'liked' }), R('C', { reaction: 'favourite' })]), ['C', 'B', 'A']);
  assert.deepEqual(codes([R('A', {}, 'Strong'), R('B', { reaction: 'favourite' }, 'Over budget')]), ['A', 'B'],
    'a favourite the money no longer reaches comes after one it does');
  assert.deepEqual(codes([R('B'), R('A'), R('C', { auction_on: '2026-11-19' }), R('D', { auction_on: '2026-11-05' })]),
    ['D', 'C', 'A', 'B'], 'the soonest auction first, then a private sale, then by code');
});

test('a favourite, then one liked: the owner\'s words, read plainly', () => {
  assert.equal(reactionRank('favourite'), 0);
  assert.equal(reactionRank('The demo favourite'), 0);
  assert.equal(reactionRank('liked'), 1);
  assert.equal(reactionRank('Like it'), 1);
  assert.equal(reactionRank('disliked'), 2);
  assert.equal(reactionRank(null), 2);
});

test('each row: the first link by its site, the description, how it is sold and the price', () => {
  const houses = [{ code: 'FBK', name: 'Fairbank & Co' }];
  const [a, b, c, d] = shortlist([
    R('A', { links: ['https://www.example.org/listing/1', 'https://example.org/2'], property_type: '4-bed detached',
      sale_method: 'auction', auction_on: '2026-11-12', house_code: 'FBK', lot: '7', minutes_from_home: 15, guide_price: 240000 },
    'Strong', 265000),
    R('B', { links: ['https://auctions.example.com/catalogue.pdf'], sale_method: 'private', minutes_from_home: 35,
      asking_price: '310000.00' }, 'Strong (stretch)', 295000),
    R('C', { sale_method: 'mmoa', guide_price: 200000, asking_price: 210000 }, 'Over budget', 200000),
    R('D', { sale_method: 'auction', auction_on: '2027-01-14' }, null, null),
  ], TODAY, { houses }).rows;
  assert.deepEqual(a.link, { href: 'https://www.example.org/listing/1', label: 'example.org' });
  assert.equal(a.description, '4-bed detached');
  assert.equal(a.sale, 'Auction Thu 12 Nov, Fairbank & Co lot 7 · 15 min from home');
  assert.deepEqual(a.price, { amount: 240000, kind: 'guide' });
  assert.equal(a.likely, 265000);
  assert.equal(b.link.label, 'auctions.example.com (PDF)');
  assert.equal(b.sale, 'Private sale · 35 min from home');
  assert.deepEqual(b.price, { amount: 310000, kind: 'asking' }, 'a numeric column read as text is still a number');
  assert.equal(c.sale, 'Modern method of auction');
  assert.deepEqual(c.price, { amount: 200000, kind: 'guide' }, 'a guide before an asking price');
  assert.equal(d.link, null);
  assert.equal(d.price, null);
  assert.equal(d.likely, null);
  assert.equal(d.sale, 'Auction Thu 14 Jan 2027', 'another year is named');
  assert.equal(linkLabel('not a link'), 'not a link');
});

test('a short list: the top six, and how many more the Register has', () => {
  const rows = Array.from({ length: 9 }, (_, i) => R(`L0${i + 1}`));
  const s = shortlist(rows, TODAY);
  assert.equal(s.rows.length, 6);
  assert.equal(s.more, 3);
  assert.equal(shortlist(rows, TODAY, { top: 3 }).rows.length, 3);
  assert.equal(shortlist([], TODAY).more, 0);
});

test('the section draws the demo: four columns, a row for each listing chased', () => {
  const ctx = resolve(D, 'base');
  const rows = registerRows(D.register, ctx, D.rules);
  const html = shortlistHtml(rows, D, D.meta.generated);
  const chased = D.register.filter((r) => ['chase', 'viewing', 'legal', 'survey', 'bid', 'offer'].includes(r.status)
    && (r.auction_on == null || r.auction_on >= D.meta.generated));
  assert.ok(chased.length > 0, 'the demo chases something');
  assert.equal((html.match(/data-short="/g) ?? []).length, Math.min(6, chased.length));
  for (const h of ['Name', 'Link', 'Description', 'Price']) assert.match(html, new RegExp(`<th scope="col" role="columnheader"[^>]*>${h}</th>`));
  assert.match(html, /rel="noopener noreferrer" target="_blank"/);
  assert.doesNotMatch(html, /undefined|NaN|\[object/);
  const evil = shortlistHtml([R('X', { name: '<b>x</b>', property_type: '<i>y</i>' })], D, TODAY);
  assert.doesNotMatch(evil, /<b>|<i>/, 'the owner\'s text is escaped');
  assert.match(shortlistHtml([], D, TODAY), /Nothing on your list/);
});
