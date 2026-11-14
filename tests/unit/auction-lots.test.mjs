// Reading a saleroom's published lots. The pages here are invented, in
// the shape the reader expects; no saleroom is named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDate, parseSales, lastPage, parseLots, classify, toObservations, toCandidates, observationsSql, candidatesSql, safeText,
  parseCatalogues, gridLotCount, parseGridLots, parseLotPage, triggerWords,
} from '../../tools/auction-lots-lib.mjs';

const row = (n, desc, price) => `<div class="lot-row"><a href="/lots/${n}/x/" class="lot-lnk">
  <div class="row-2-3"><div class="lot-num">LOT ${n}</div>
  <div class="lot-desc">${desc}</div>
  ${price ? `<div class="lot-price">${price}</div>` : ''}
  <div class="ld-bp-notice-d">( Plus <div class="bp-tt-d">Buyer&#8217;s Premium<div class="premium-notice-d">currently
    this is set at 25% plus VAT (30% including VAT) of the hammer price.</div></div> )</div></div></a></div>`;
const PAGE = `<a href="/sale-results/furniture/77/1/">Thu, 5th November 2026</a>
  <a href="/sale-results/furniture/70/1/">Thu, 8th October 2026</a><a href="/sale-results/furniture/77/1/">Thu, 5th November 2026</a>
  <div class="paging-nums"><a href="/sale-results/furniture/77/2/">2</a><a href="/sale-results/furniture/77/11/">&#62;|</a></div>
  ${row(101, 'A Victorian mahogany chest of two short and three long drawers, width 104cm<br />(faults).', 'Hammer price: &#163;1,050')}
  ${row(102, 'A Victorian pine chest of drawers, together with a towel rail.', 'Hammer price: &#163;40')}
  ${row(103, 'A modern mahogany chest of drawers.', 'Hammer price: &#163;20')}
  ${row(104, 'A Victorian mahogany chest of drawers.', null)}
  ${row(105, 'A George III mahogany chest on chest.', 'Estimate: &#163;300 - &#163;500')}`;

const PROFILES = [
  { key: 'chest_mahogany', lot_match: 'mahogany.*chest of.*drawers|mahogany chest\\b', lot_exclude: 'modern|reproduction|chest on chest',
    price_good: 80, price_fair: 130, price_max: 200 },
  { key: 'chest_pine', lot_match: 'pine chest', lot_exclude: 'modern', price_good: 60, price_fair: 110, price_max: 170 },
  { key: 'any_chest', lot_match: 'pine chest of drawers', lot_exclude: null },
];

test('dates and the sale list', () => {
  assert.equal(parseDate('Thu, 5th November 2026'), '2026-11-05');
  assert.equal(parseDate('Fri, 22nd January 2026'), '2026-01-22');
  assert.equal(parseDate('next week'), null);
  assert.deepEqual(parseSales(PAGE, 'sale-results/furniture'), [
    { id: '77', date: '2026-11-05', path: '/sale-results/furniture/77/1/' },
    { id: '70', date: '2026-10-08', path: '/sale-results/furniture/70/1/' }]);
  assert.equal(lastPage(PAGE, 'sale-results/furniture', '77'), 11);
  assert.equal(lastPage(PAGE, 'sale-results/furniture', '70'), 1);
});

test('lots: hammer, estimate, premium, and an unsold lot kept as unsold', () => {
  const lots = parseLots(PAGE);
  assert.equal(lots.length, 5);
  assert.deepEqual([lots[0].lot, lots[0].hammer, lots[0].premiumPct, lots[0].path], ['101', 1050, 30, '/lots/101/x/']);
  assert.ok(lots[0].description.endsWith('(faults).') && !lots[0].description.includes('<'));
  assert.equal(lots[3].hammer, null);
  assert.deepEqual([lots[4].hammer, lots[4].estimateLow, lots[4].estimateHigh], [null, 300, 500]);
});

test('a lot goes to one profile or to none', () => {
  assert.deepEqual(classify('A Victorian mahogany chest of two short and three long drawers', PROFILES),
    { key: 'chest_mahogany', matches: ['chest_mahogany'], typical: true });
  assert.equal(classify('A modern mahogany chest of drawers', PROFILES).key, null, 'excluded');
  assert.equal(classify('A George III mahogany chest on chest', PROFILES).key, null);
  const two = classify('A Victorian pine chest of drawers', PROFILES);
  assert.equal(two.key, null, 'a lot that matches two profiles is given to neither');
  assert.deepEqual(two.matches, ['chest_pine', 'any_chest']);
  assert.equal(classify('A Victorian mahogany chest of drawers, together with a towel rail', PROFILES).typical, false);
  assert.equal(classify('A pair of Victorian mahogany chests of drawers'.replace('chests', 'chest'), PROFILES).typical, true);
  assert.equal(classify('x', [{ key: 'bad', lot_match: '(' }]).key, null, 'a broken pattern matches nothing');
});

test('sold lots become observations; unsold and unmatched ones do not', () => {
  const obs = toObservations(parseLots(PAGE), { profiles: PROFILES.slice(0, 2), saleDate: '2026-11-05', where: 'A saleroom' });
  assert.deepEqual(obs.map((o) => [o.key, o.price, o.premium_pct, o.is_typical]),
    [['chest_mahogany', 1050, 30, true], ['chest_pine', 40, 30, false]]);
  const sql = observationsSql(obs, { household: 'hh', groundKey: 'saleroom', publisher: "Smith's Rooms",
    resultsUrl: 'https://x/results/', retrieved: '2026-11-14' });
  assert.ok(sql.includes("('2026-11-05', 'chest_mahogany', 30, '101:1050')"));
  assert.ok(sql.includes("('2026-11-05', 'chest_pine', 30, '102:40g')"), 'a lot of several things carries a g');
  assert.ok(sql.includes("'Smith''s Rooms'") && sql.includes('not exists') && sql.includes("'auction_hammer'"));
  assert.ok(!/\b(drop|delete)\b/i.test(sql), 'the connector prompts on these words');
  assert.equal(observationsSql([], {}), null);
});

test('a coming lot is a candidate with the most to bid, premium included', () => {
  const lots = [
    { lot: '1', description: 'A Victorian mahogany chest of drawers', hammer: null, estimateLow: 60, estimateHigh: 80, path: '/lots/1/' },
    { lot: '2', description: 'A Victorian mahogany chest of drawers', hammer: null, estimateLow: 300, estimateHigh: 500 },
    { lot: '3', description: 'A Victorian mahogany chest of drawers', hammer: null, estimateLow: 120, estimateHigh: 150 },
    { lot: '4', description: 'A Victorian mahogany chest of drawers', hammer: 90 },
    { lot: '5', description: 'A Victorian mahogany chest of drawers, together with a towel rail', hammer: null, estimateLow: 20 },
  ];
  const c = toCandidates(lots, { profiles: PROFILES.slice(0, 2), premiumPct: 30 });
  assert.deepEqual(c.map((x) => [x.lot, x.bid_good, x.bid_stop, x.promising]), [['1', 61, 100, true], ['3', 61, 100, false]]);
});

test('coming lots are written to watch, never to buy, and the SQL cannot stall an unattended run', () => {
  const c = [{ key: 'chest_mahogany', lot: '7', description: 'A Victorian mahogany chest with drop handles and a drop-leaf. Delete nothing',
    url: 'https://x/lots/7/', estimateLow: 60, estimateHigh: 80, bid_good: 61, bid_stop: 100, sale_date: '2026-12-03' }];
  const sql = candidatesSql(c, { household: 'hh', groundKey: 'saleroom', saleroom: 'A saleroom', seenOn: '2026-11-14' });
  assert.ok(sql.includes("'watch'") && !sql.includes("'buy'"));
  assert.ok(sql.includes('bid no more than £61') && sql.includes('stop at £100') && sql.includes('estimate £60 to £80'));
  assert.ok(sql.includes('f.listing_url = c.url'), 'a lot already written is not written twice');
  assert.ok(!/\b(drop|delete)\b/i.test(sql));
  assert.equal(safeText('drop-leaf, Drop handles, a drop'), 'dropleaf, Drophandles, a dropped');
  assert.equal(candidatesSql([], {}), null);
});

test('the shared catalogue platform: catalogues, the grid and a lot page', () => {
  const A = 'a'.repeat(32); const B = 'b'.repeat(32);
  const auctions = `<a href="/catalogue/${A}/${B}/homes-antiques/">x</a><a href="/catalogue/${A}/${B}/homes-antiques/">y</a>
    <a href="/catalogue/lot/${A}/${B}/homes-antiques-lot-1/">lot</a>`;
  assert.deepEqual(parseCatalogues(auctions), [`/catalogue/${A}/${B}/homes-antiques/`]);
  const grid = `Homes &amp; Antiques - 1,527 Lots
    <div id="lotX" class="grid-lot"><div class="catalogue-description">
    <h4><a href="/catalogue/lot/${A}/${B}/homes-antiques-lot-75/">Lot 75 </a></h4>
    <a href="/catalogue/lot/${A}/${B}/homes-antiques-lot-75/" class="no-hover"> <p style="--h: 45px"> A Regency mahogany ebony strung linen pr... </p>
    <p class="lotEst">Estimate £150 - £250</p></a></div></div>`;
  assert.equal(gridLotCount(grid), 1527);
  assert.deepEqual(parseGridLots(grid), [{ lot: '75', teaser: 'A Regency mahogany ebony strung linen pr...', path: `/catalogue/lot/${A}/${B}/homes-antiques-lot-75/` }]);
  const coming = parseLotPage(`<div>1 /4 Estimate £150 - £250 <a>Fees</a> A Regency mahogany linen press, the pair of panelled doors over a four drawer base
    <b>Watch Lot</b> Prev Lot Closed Auction Date: 7th Nov 2026 at 9am Room and Absentee Bids: 27.6% inc VAT* Online: 31.2% inc VAT*</div><script>Hammer £9</script>`);
  assert.deepEqual(coming, { description: 'A Regency mahogany linen press, the pair of panelled doors over a four drawer base',
    estimateLow: 150, estimateHigh: 250, hammer: null, saleDate: '2026-11-07', premiumPct: 27.6 });
  assert.equal(parseLotPage('<p>Hammer £1,170 Fees #A Victorian chest Watch Lot Auction Date: 5th Sep 2026</p>').hammer, 1170);
  assert.equal(parseLotPage('<p>nothing here</p>').description, null);
});

test('trigger words come from the profiles and leave the materials out', () => {
  const w = triggerWords([{ lot_match: 'mahogany[^.]{0,60}chest of[^.]{0,40}drawers|pine chest\\b' }, { lot_match: 'overmantel|giltwood[^.]{0,40}mirror' }]);
  assert.ok(w.includes('chest') && w.includes('drawers') && w.includes('overmantel') && w.includes('table'));
  assert.ok(!w.includes('mahogany') && !w.includes('pine'));
});
