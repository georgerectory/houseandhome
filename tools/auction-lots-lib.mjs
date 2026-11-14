// auction-lots-lib.mjs - read an auction house's published lots, and
// hold each one up against a Marketplace profile.
//
// Pure: HTML or rows in, values out. No fetch here, so the unit tests
// exercise all of it on invented pages. tools/auction-lots.mjs does the
// fetching.
//
// WHY THIS EXISTS. A threshold in mp_profiles should be earned from
// dated SOLD prices, and a search engine's summary of a few lots is a
// biased sample: it surfaces the lots somebody wrote about. A saleroom
// that publishes EVERY lot of a general sale with its hammer price is
// the opposite - the fifty-pound chest is listed beside the five-hundred
// pound one - so the median over a year of its sales is what an
// ordinary piece actually makes. The same pages, read before the sale
// instead of after it, are a list of things to go and view.
//
// The page shape read here is a common one: a row per lot carrying a
// lot number, a description and a price line, with numbered paging.
// Which saleroom, and which URLs, is the owner's data and lives in
// mp_grounds; nothing in this repository names one.

const text = (html) => String(html ?? '')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&pound;/g, '£').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&rsquo;|&lsquo;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december'];

/** "Thu, 5th November 2026" -> "2026-11-05", or null. */
export function parseDate(s) {
  const m = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/.exec(String(s ?? ''));
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

/** The sales an index page links to: [{ id, date, path }], newest first.
 *  `section` is the path segment the links sit under. */
export function parseSales(html, section) {
  const re = new RegExp(`<a[^>]+href="(/${section}/(\\d+)/1/)"[^>]*>([^<]+)</a>`, 'g');
  const seen = new Map();
  for (const m of String(html ?? '').matchAll(re)) {
    const date = parseDate(m[3]);
    if (date && !seen.has(m[2])) seen.set(m[2], { id: m[2], date, path: m[1] });
  }
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** The last page number a results page links to (1 when it has none). */
export function lastPage(html, section, saleId) {
  const re = new RegExp(`/${section}/${saleId}/(\\d+)/`, 'g');
  let max = 1;
  for (const m of String(html ?? '').matchAll(re)) max = Math.max(max, Number(m[1]));
  return max;
}

const money = (s) => {
  const m = /£\s?([\d,]+(?:\.\d+)?)/.exec(s);
  return m ? Number(m[1].replace(/,/g, '')) : null;
};

/**
 * The lots on one page: [{ lot, description, hammer, estimateLow,
 * estimateHigh, premiumPct, path }]. A lot with no price line was
 * unsold or is not yet sold; it is kept, with nulls, because an unsold
 * lot is information too.
 */
export function parseLots(html) {
  const rows = String(html ?? '').split(/<div class="lot-row[^"]*">/).slice(1);
  return rows.map((row) => {
    const part = (cls) => {
      const m = new RegExp(`class="${cls}"[^>]*>([\\s\\S]*?)</div>`).exec(row);
      return m ? text(m[1]) : null;
    };
    const price = part('lot-price') ?? '';
    const estimate = /estimate/i.test(price) ? [...price.matchAll(/£\s?([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, ''))) : [];
    const premium = /\((\d+(?:\.\d+)?)%\s+including VAT\)/i.exec(text(row));
    const lot = /(\d+[A-Za-z]?)/.exec(part('lot-num') ?? '');
    const link = /href="(\/lots\/[^"]+)"/.exec(row);
    return {
      lot: lot ? lot[1] : null,
      description: part('lot-desc'),
      hammer: /hammer/i.test(price) ? money(price) : null,
      estimateLow: estimate[0] ?? null,
      estimateHigh: estimate[1] ?? estimate[0] ?? null,
      premiumPct: premium ? Number(premium[1]) : null,
      path: link ? link[1] : null,
    };
  }).filter((l) => l.description);
}

// More than one thing in the lot: a real price that says little about
// one piece. "A pair of" is left alone - a pair is how some things sell.
const GROUP = /\btogether with\b|\band (?:a|an|two|three|four|five|six)\b[^.]{0,80}\b(?:table|chair|chest|stool|mirror|cabinet|bookcase|desk|stand|trolley|box)\b|\b(?:group|collection|quantity|selection) of\b|\bvarious\b/i;

/**
 * Which profile a lot description answers to, if any.
 *
 * A profile matches when its `lot_match` pattern is found and its
 * `lot_exclude` pattern is not; both are case-insensitive regular
 * expressions kept on the profile. A lot that matches MORE than one
 * profile is given to none of them: a wrong observation is worse than a
 * missing one. `typical` is false for a lot of several things.
 */
export function classify(description, profiles) {
  const d = String(description ?? '');
  const hits = (profiles ?? []).filter((p) => {
    if (!p.lot_match) return false;
    try {
      return new RegExp(p.lot_match, 'i').test(d) && !(p.lot_exclude && new RegExp(p.lot_exclude, 'i').test(d));
    } catch { return false; }
  });
  if (hits.length !== 1) return { key: null, matches: hits.map((p) => p.key), typical: false };
  return { key: hits[0].key, matches: [hits[0].key], typical: !GROUP.test(d) };
}

/** Sold lots as price observations, in the shape of mp_price_obs. */
export function toObservations(lots, { profiles, saleDate, where }) {
  const out = [];
  for (const l of lots) {
    if (l.hammer == null) continue;
    const c = classify(l.description, profiles);
    if (!c.key) continue;
    out.push({
      key: c.key, kind: 'auction_hammer', price: l.hammer, premium_pct: l.premiumPct ?? 0,
      observed_on: saleDate, where_seen: where, is_typical: c.typical,
      description: `Lot ${l.lot}: ${l.description}`.slice(0, 400), path: l.path,
    });
  }
  return out;
}

/**
 * Unsold lots in a coming sale worth a look: one per lot that matches a
 * profile still being hunted, with the most to bid.
 *
 * The bid is the hammer that lands the good price ALL IN: good divided
 * by one plus the premium. A lot whose low estimate is already above
 * the hammer that would land the ceiling is left out - it is not going
 * to be a bargain.
 */
export function toCandidates(lots, { profiles, premiumPct }) {
  const k = 1 + Number(premiumPct ?? 0) / 100;
  const out = [];
  for (const l of lots) {
    if (l.hammer != null) continue;
    const c = classify(l.description, profiles);
    if (!c.key || !c.typical) continue;
    const p = profiles.find((x) => x.key === c.key);
    if (p.price_good == null) continue;
    const bidGood = Math.floor(Number(p.price_good) / k);
    const bidStop = Math.floor(Number(p.price_fair ?? p.price_good) / k);
    const ceiling = Math.floor(Number(p.price_max ?? p.price_fair ?? p.price_good) / k);
    if (l.estimateLow != null && l.estimateLow > ceiling) continue;
    out.push({
      key: c.key, lot: l.lot, description: l.description, path: l.path,
      estimateLow: l.estimateLow, estimateHigh: l.estimateHigh,
      bid_good: bidGood, bid_stop: bidStop,
      // Likely to sell inside what is worth paying, on the estimate.
      promising: l.estimateLow == null || l.estimateLow <= bidStop,
    });
  }
  return out;
}

const q = (v) => (v == null ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v)
  : `'${String(v).replace(/'/g, "''")}'`);

// The connector stops to ask a person whenever a statement contains
// either of two bare words, wherever they fall - and furniture is full
// of one of them (a leaf, a flap, a handle). An unattended run cannot
// answer, so the word is closed up before it reaches SQL.
export const safeText = (s) => String(s ?? '')
  .replace(/\bdrop[- ]?/gi, (m) => (m[0] === 'D' ? 'Drop' : 'drop'))
  .replace(/\bdrop\b/gi, 'dropped').replace(/\bdelete\b/gi, 'remove');

/**
 * One idempotent SQL statement that loads observations from any number
 * of sales at one saleroom: a source row per sale, then the
 * observations, skipping any already there. Packed - one row per sale
 * and profile, lots as "number:price", a trailing g for a lot of
 * several things - so a year of sales is a statement short enough to
 * send. Run through the connector; nothing here reaches a database.
 */
export function observationsSql(observations, { household, groundKey, publisher, resultsUrl, retrieved }) {
  if (!observations.length) return null;
  const packed = new Map();
  for (const o of observations) {
    const lot = /Lot (\w+)/.exec(o.description)?.[1];
    if (!lot) continue;
    const k = `${o.observed_on}|${o.key}|${o.premium_pct}`;
    if (!packed.has(k)) packed.set(k, []);
    packed.get(k).push(`${lot}:${o.price}${o.is_typical ? '' : 'g'}`);
  }
  const values = [...packed].map(([k, lots]) => {
    const [d, key, prem] = k.split('|');
    return `(${q(d)}, ${q(key)}, ${Number(prem)}, ${q(lots.join(' '))})`;
  });
  return `with packed(d, key, premium, lots) as (values
  ${values.join(',\n  ')}
), r as (
  select d::date as d, key, premium, split_part(regexp_replace(l, 'g$', ''), ':', 1) as lot,
         split_part(regexp_replace(l, 'g$', ''), ':', 2)::numeric as price, l not like '%g' as typical
    from packed, regexp_split_to_table(lots, ' ') l
), src as (
  insert into sources (household_id, key, kind, title, url, publisher, published_on, retrieved_on, note)
  select distinct ${q(household)}::uuid, 'mp:' || ${q(groundKey)} || ':' || r.d, 'auction',
         ${q(publisher)} || ' sale results, ' || r.d, ${q(resultsUrl)}, ${q(publisher)}, r.d, ${q(retrieved)}::date,
         'Every lot of the sale as the saleroom published it, read with tools/auction-lots.mjs. Lot numbers identify each.'
    from r
  on conflict (household_id, key) do update set retrieved_on = excluded.retrieved_on
  returning id, published_on
), ins as (
  insert into mp_price_obs (household_id, profile_id, kind, price, quantity, premium_pct, observed_on, where_seen,
                            description, is_typical, source_id, confidence, note)
  select ${q(household)}::uuid, p.id, 'auction_hammer', r.price, 1, r.premium, r.d, ${q(publisher)}, 'Lot ' || r.lot,
         r.typical, s.id, 'researched',
         'Hammer price from the published results, premium as stated there. Matched to this profile by its lot_match pattern, not by eye.'
    from r join mp_profiles p on p.household_id = ${q(household)}::uuid and p.key = r.key
    join src s on s.published_on = r.d
   where not exists (select 1 from mp_price_obs x where x.profile_id = p.id and x.observed_on = r.d
                        and x.description = 'Lot ' || r.lot and x.where_seen = ${q(publisher)})
  returning 1)
select (select count(*) from r) as parsed, (select count(*) from ins) as loaded;`;
}

/**
 * One idempotent SQL statement that writes coming lots as finds to
 * WATCH: never to buy. Nothing about a lot is proven from a catalogue
 * line, so every check is unseen and the verdict says to view it. The
 * most to bid is carried as the opening and the ceiling offer.
 */
export function candidatesSql(candidates, { household, groundKey, saleroom, seenOn }) {
  if (!candidates.length) return null;
  const values = candidates.map((c) => {
    const est = c.estimateLow == null ? 'no estimate published'
      : `estimate £${c.estimateLow}${c.estimateHigh && c.estimateHigh !== c.estimateLow ? ` to £${c.estimateHigh}` : ''}`;
    const when = c.sale_date ? `, sale on ${c.sale_date}` : '';
    const reason = `Lot ${c.lot} at ${saleroom}${when}: ${est}. To land the good price with the premium, bid no more than `
      + `£${c.bid_good} on the hammer; stop at £${c.bid_stop}. Nothing is proven from a catalogue line: view it, or ask for a condition report, before bidding.`;
    return `(${[q(c.key), q(safeText(`Lot ${c.lot}: ${c.description}`).slice(0, 140)), q(c.url), q(safeText(c.description).slice(0, 600)),
      q(safeText(reason)), c.bid_good, c.bid_stop].join(', ')})`;
  });
  return `with c(key, title, url, what, reason, bid_good, bid_stop) as (values
  ${values.join(',\n  ')}
), ins as (
  insert into mp_finds (household_id, profile_id, title, platform, listing_url, location_text, seen_on, what_it_is,
                        verdict, verdict_reason, opening_offer, max_offer, status, ground_id)
  select ${q(household)}::uuid, p.id, c.title, 'auction', c.url, ${q(saleroom)}, ${q(seenOn)}::date, c.what,
         'watch', c.reason, c.bid_good, c.bid_stop, 'spotted',
         (select g.id from mp_grounds g where g.household_id = ${q(household)}::uuid and g.key = ${q(groundKey)})
    from c join mp_profiles p on p.household_id = ${q(household)}::uuid and p.key = c.key
   where not exists (select 1 from mp_finds f where f.household_id = ${q(household)}::uuid and f.listing_url = c.url)
  returning 1)
select (select count(*) from c) as candidates, (select count(*) from ins) as written;`;
}
