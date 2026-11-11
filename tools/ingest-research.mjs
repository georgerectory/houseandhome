#!/usr/bin/env node
// tools/ingest-research.mjs - turn a pasted research reply into SQL.
//
//   node tools/ingest-research.mjs <reply.md | folder of NAME.csv files> --household <uuid> [--source "label"] > load.sql
//
// The research prompt (the routes brief) asks a web-connected session to
// return fenced CSV blocks with fixed names. This reads them and prints
// ONE transaction that writes each block where it belongs:
//
//   VARIABLES        ra_variables  (new keys inserted; an existing key is
//                                   updated only if it is NOT confirmed -
//                                   a researched figure never overwrites
//                                   the owner's word: it raises a
//                                   contradiction instead)
//   LENDERS          ra_variables  lending.products (the dated set)
//   FORECASTS        ra_variables  forecast.<forecaster>_<area>
//   COMPARABLES      ra_comparables, on the listing the "for" column names
//   EVIDENCE, RECALL_LEDGER, ROADS_RECALLED, ROUTE_RESULTS, BRIEF,
//   QUESTIONS_FROM_RECALL, VERDICT
//                    ra_evidence (codes continue from the highest E-number)
//   CONTRADICTIONS   contradictions (open)
//   CHART_SERIES     ra_variables  research.chart_series
//   SEARCH_LOG       source_documents (one row: the count and the date)
//
// Labels map as everywhere else: STATED confirmed, VERIFIED researched,
// ESTIMATE and CHECK drafted. The SQL is printed, never run: the session
// reads it, runs it through the connector with standing permission, and
// reads it back. Nothing here is a figure about the owner; the reply is
// private and never enters the repository.
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

export const LISTING_FOR = {
  P004: 'L46', FOREST_VIEW: 'L45',
  ROAD_GE: 'L47', ROAD_H1: 'L48', ROAD_H2: 'L49', ROAD_H3: 'L50', ROAD_H4: 'L51',
  // The west roads (R-20, 5 Nov 2026): Shaftesbury to Yeovil.
  ROAD_W1: 'L52', ROAD_W2: 'L53', ROAD_W3: 'L54',
};
// A research reply restates the owner's figures but is not the owner's
// word, so nothing it carries lands above researched.
// ra_comparables.kind takes sold, asking, guide or estimate; an auction lot is a guide, sstc an asking price.
const KIND = { sold: 'sold', asking: 'asking', guide: 'guide', estimate: 'estimate', auction: 'guide', auction_guide: 'guide', sstc: 'asking', listed: 'asking', withdrawn: 'asking' };
const CONF = { STATED: 'researched', VERIFIED: 'researched', ESTIMATE: 'drafted', CHECK: 'drafted' };

// Keys a reply may invent for figures the household already holds under
// another name: map to the existing key, or skip (null) when the existing
// key is the owner's and a restatement adds nothing.
export const ALIASES = {
  'income.gross': 'income.gross_salary_now', 'income.net': 'income.net_pay_now',
  'income.student_loan': 'income.student_loan_monthly', 'rent.used_in_model': 'costs.bridge_rent',
  'fees.agent_pct_whiteley': 'p004.agent_fee_pct', 'mortgage.term_months': null, 'cash.dec2026': null, 'sdlt.ftb': null,
  // 6 Nov 2026 west reply: keys whose meaning differs from the stored one.
  'mortgage.lti_ftb_95': 'mortgage.lti_ftb_95_headline', // stored key is the affordability-bound multiple the routes use
  'road.h1_finished': 'road.h1_entry_evidence', 'road.h2_finished': 'road.h2_entry_evidence', // the reply put ENTRY prices here
  'boe.bank_rate': 'mortgage.bank_rate', 'mortgage.dip_loan': null,
  // 7 Nov 2026 wave 2: duplicates of figures already held under another key.
  'mortgage.dip_nationwide': null, 'tax.sdlt_ftb_rate_300_500k': null, 'mortgage.coventry_lti_ftb': 'mortgage.lti_ftb_95_coventry',
};

/** A folder of block files (NAME.csv, NAME.txt) as one reply text. */
export function folderAsReply(dir) {
  return readdirSync(dir).sort().map((f) => {
    const name = basename(f, extname(f)).toUpperCase();
    const body = readFileSync(join(dir, f), 'utf8').trim();
    return extname(f) === '.csv' ? `${name}\n\`\`\`csv\n${body}\n\`\`\`` : `${name}\n${body}\n`;
  }).join('\n\n');
}

/** Every fenced block that follows a heading or line naming it. */
export function blocks(text) {
  const out = {};
  const re = /([A-Z_]{4,})[^\n`]*\n+```[a-z]*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) out[m[1]] = m[2].trim();
  // Replies laid out as a report put each table under an appendix heading
  // ("## Appendix B: variables (final values)") rather than its NAME. Map those;
  // superseded tables are history and are not loaded.
  const APPENDIX = [[/search log/i, 'SEARCH_LOG'], [/variables/i, 'VARIABLES'], [/comparables/i, 'COMPARABLES'],
    [/listings|candidate/i, 'LISTINGS'], [/evidence/i, 'EVIDENCE'], [/contradictions/i, 'CONTRADICTIONS']];
  const ap = /\n#{2,4}\s*Appendix [A-Z]:\s*([^\n]*)\n[\s\S]*?```csv\n([\s\S]*?)```/g;
  while ((m = ap.exec(text))) {
    if (/supersed/i.test(m[1])) continue;
    const hit = APPENDIX.find(([r]) => r.test(m[1]));
    if (hit && !out[hit[1]]) out[hit[1]] = m[2].trim();
  }
  // Prose blocks (BRIEF, VERDICT) may come without a fence.
  for (const name of ['BRIEF', 'VERDICT', 'QUESTIONS_FROM_RECALL', 'NOT_FOUND']) {
    if (out[name]) continue;
    // The name alone on its line (optionally as a heading); the LAST such block wins,
    // because a contents list near the top can mention the same word.
    const re2 = new RegExp(`(?:^|\\n)(?:#{1,4}\\s*)?\\**${name}\\**\\s*\\n([\\s\\S]*?)(?=\\n#{1,3} |\\n\\**[A-Z_]{4,}\\**\\s*\\n|\\n---|$)`, 'g');
    let p2;
    let last = null;
    while ((p2 = re2.exec(text))) if (p2[1].trim()) last = p2[1].trim();
    if (last) out[name] = last;
  }
  return out;
}

/** CSV rows as objects; quoted fields may hold commas and doubled quotes. */
export function csv(src) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim() !== ''));
  if (!head) return [];
  const keys = head.map((h) => h.trim().replace(/\(.*\)$/, '').trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const q = (v) => (v == null || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const clean = (v) => String(v ?? '').replace(/[£,\s]/g, '');
const num = (v) => {
  const c = clean(v);
  if (c === '') return null;
  const pct = c.endsWith('%');
  const n = Number(pct ? c.slice(0, -1) : c);
  if (!Number.isFinite(n)) return null;
  return pct ? n / 100 : n;
};
/** A CSV cell as a jsonb literal: a number when it is one (5.29% becomes 0.0529), JSON when it parses, else a string. */
export const jsonv = (v) => {
  const n = num(v);
  if (n != null) return `'${n}'::jsonb`;
  const t = String(v ?? '').trim();
  if (/^[[{"]/.test(t)) { try { JSON.parse(t); return `${q(t)}::jsonb`; } catch { /* fall through */ } }
  return `${q(JSON.stringify(t))}::jsonb`;
};
/** A CSV row with its numeric cells as numbers (5.2% becomes 0.052; dates stay text). */
const typed = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => {
  const n = /^\d{4}-\d{2}/.test(v) ? null : num(v);
  return [k, n ?? v];
}));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

/** The SQL for one reply. */
/** A source date as Postgres will take it: 2025 -> 2025-01-01, 2026-10 -> 2026-10-01, anything else -> the run date. */
export function asDate(s, fallback) {
  const t = String(s ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}$/.test(t)) return `${t}-01`;
  if (/^\d{4}$/.test(t)) return `${t}-01-01`;
  return fallback;
}

export function toSql(text, { household, source = 'Research reply', date = new Date().toISOString().slice(0, 10) }) {
  const b = blocks(text);
  const H = q(household);
  const out = [`-- Research ingest: ${source}, ${date}. Generated by tools/ingest-research.mjs; read it before running.`,
    'begin;',
    `select set_config('house.change_why', ${q(`Research reply loaded: ${source}`)}, true), set_config('house.change_source', ${q(`tools/ingest-research.mjs, ${date}`)}, true);`];
  const counts = {};

  // Variables, set-based: one VALUES list, three statements.
  const vrows = [];
  for (const raw of csv(b.VARIABLES ?? '')) {
    const key = raw.key in ALIASES ? ALIASES[raw.key] : raw.key;
    if (!key || !/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(key)) continue;
    if (raw.value == null || String(raw.value).trim() === '') continue; // no figure, nothing to load
    const ev = (raw.evidence ?? 'ESTIMATE').toUpperCase();
    const src = [raw.source_url, raw.notes].filter(Boolean).join(' | ') || source;
    vrows.push(`(${q(key)}, ${q(raw.label || key)}, ${jsonv(raw.value)}, ${q(raw.unit)}, ${raw.low ? jsonv(raw.low) : 'null::jsonb'}, ${raw.high ? jsonv(raw.high) : 'null::jsonb'}, ${q(ev in CONF ? ev : 'ESTIMATE')}, ${q(CONF[ev] ?? 'drafted')}, ${q(src)}, ${q(asDate(raw.source_date, date))}, ${q(raw.notes)}, ${q(raw.value)})`);
  }
  if (vrows.length) {
    out.push(`-- The researched figures, once, in a temporary table.
create temp table _v on commit drop as select * from (values
${vrows.join(',\n')}
) v(key, label, value, unit, low, high, evidence, confidence, src, sdate, notes, shown);
-- New keys are inserted.
insert into ra_variables (household_id, key, label, value, unit, low, high, evidence, certainty, confidence, source, source_date, notes, status)
select ${H}, v.key, v.label, v.value, v.unit, v.low, v.high, v.evidence, 'M', v.confidence, v.src, v.sdate::date, v.notes, 'active' from _v v
 where not exists (select 1 from ra_variables x where x.household_id = ${H} and x.key = v.key);
-- An unconfirmed key of the same shape is updated; a confirmed one never is.
insert into ra_variables select x.* from ra_variables x join _v v on x.key = v.key
 where x.household_id = ${H} and x.status = 'active' and x.confidence <> 'confirmed' and jsonb_typeof(x.value) = jsonb_typeof(v.value) and x.value <> v.value
   and not (jsonb_typeof(x.value) = 'number' and abs((x.value)::text::numeric - (v.value)::text::numeric) <= 0.005 * abs((x.value)::text::numeric))
   and (x.source_date is null or v.sdate::date >= x.source_date) -- an older figure never replaces a newer one
on conflict (id) do update set
  value = (select w.value from _v w where w.key = ra_variables.key),
  low = coalesce((select w.low from _v w where w.key = ra_variables.key), ra_variables.low),
  high = coalesce((select w.high from _v w where w.key = ra_variables.key), ra_variables.high),
  evidence = (select w.evidence from _v w where w.key = ra_variables.key),
  confidence = (select w.confidence from _v w where w.key = ra_variables.key),
  source = (select w.src from _v w where w.key = ra_variables.key),
  source_date = (select w.sdate::date from _v w where w.key = ra_variables.key);
-- A confirmed figure the research disagrees with is put to the owner.
insert into contradictions (household_id, key, topic, source_a, position_a, source_b, position_b, what_it_changes, status)
select ${H}, 'r-' || regexp_replace(v.key, '[^a-z0-9]+', '_', 'g') || '-${date}', 'Research differs from a confirmed figure: ' || v.key, 'Owner (confirmed)', x.value::text, v.src, v.shown, 'Put to the owner; the confirmed figure stands until then', 'open'
  from ra_variables x join _v v on x.key = v.key
 where x.household_id = ${H} and x.status = 'active' and x.confidence = 'confirmed' and x.value <> v.value
   and not (jsonb_typeof(x.value) = 'number' and jsonb_typeof(v.value) = 'number' and abs((x.value)::text::numeric - (v.value)::text::numeric) <= 0.005 * abs((x.value)::text::numeric))
   and not exists (select 1 from contradictions c where c.key = 'r-' || regexp_replace(v.key, '[^a-z0-9]+', '_', 'g') || '-${date}');`);
    counts.variables = vrows.length;
  }

  // A modelled series (the reply's own estimate) lands drafted, not researched.
  const setVar = (key, label, value, note, ev = 'VERIFIED') => out.push(`with v(val) as (select ${q(JSON.stringify(value))}::jsonb),
ins as (insert into ra_variables (household_id, key, label, value, unit, evidence, certainty, confidence, source, source_date, notes, status)
  select ${H}, ${q(key)}, ${q(label)}, v.val, 'json', ${q(ev)}, 'M', ${q(CONF[ev])}, ${q(source)}, ${q(date)}, ${q(note)}, 'active' from v
   where not exists (select 1 from ra_variables x where x.household_id = ${H} and x.key = ${q(key)}) returning 1)
insert into ra_variables select x.* from ra_variables x where x.household_id = ${H} and x.key = ${q(key)} and x.status = 'active'
on conflict (id) do update set value = (select val from v), source = ${q(source)}, source_date = ${q(date)};`);

  const lenders = csv(b.LENDERS ?? '').map(typed);
  if (lenders.length) { setVar('lending.products', 'Lender products researched', lenders, 'One row per lender product, with source and date.'); counts.lenders = lenders.length; }
  for (const f of csv(b.FORECASTS ?? '').map(typed)) {
    if (!f.forecaster) continue;
    // One key per forecaster, area AND vintage: a June forecast must never overwrite November's.
    const vintage = slug(String(f.published || 'undated').slice(0, 7));
    setVar(`forecast.${slug(f.forecaster)}_${slug(f.area || 'uk')}_${vintage}`, `${f.forecaster} forecast, ${f.area || 'UK'} (${f.published || 'undated'})`, f, `Published ${f.published || 'date not given'}.`,
      /estimate|model/i.test(`${f.forecaster} ${f.source_url}`) ? 'ESTIMATE' : 'VERIFIED');
    counts.forecasts = (counts.forecasts ?? 0) + 1;
  }
  const chart = csv(b.CHART_SERIES ?? '').map(typed);
  if (chart.length) {
    // Column-wise, not row-wise: one array per series, about a third of the size.
    const series = Object.fromEntries(Object.keys(chart[0]).filter((k) => !k.startsWith('ref_')).map((k) => [k, chart.map((r) => r[k])]));
    const targets = Object.keys(chart[0]).filter((k) => k.startsWith('ref_')).map((k) => Number(k.slice(4)));
    setVar('research.chart_series', 'Buying power by route, month by month (research run)', { targets, ...series }, 'From the research reply; the site recomputes from routes.inputs.', 'ESTIMATE');
    counts.chart_rows = chart.length;
  }

  // A row may name its house by code (L55), by the reply's alias (P004), by
  // NEW (the one new house this reply adds) or by the house's name.
  const newHouses = csv(b.LISTINGS ?? '').filter((h) => /^new$/i.test(h.for || 'NEW') && (h.name || h.address));
  const newName = newHouses.length === 1 ? (newHouses[0].name || newHouses[0].address) : null;
  // A bare house name is accepted only where asked (LISTING_FACTS); an
  // unknown alias elsewhere is skipped rather than guessed.
  const houseRef = (raw, { names = false } = {}) => {
    const t = String(raw ?? '').trim();
    if (!t) return null;
    if (/^[LG][0-9]{2,3}$/i.test(t)) return t.toUpperCase();
    if (LISTING_FOR[t.toUpperCase()]) return LISTING_FOR[t.toUpperCase()];
    if (/^new$/i.test(t)) return newName;
    return names ? t : null;
  };
  const houseJoin = (alias) => `(l.code = ${alias} or (${alias} !~ '^[LG][0-9]+$' and lower(split_part(l.name, ',', 1)) = lower(split_part(${alias}, ',', 1))))`;
  const deferred = [];

  // Comparables, set-based: one VALUES list, one insert, deduplicated on listing, house and price.
  const comps = [];
  const compUrls = [];
  for (const c of csv(b.COMPARABLES ?? '')) {
    const code = houseRef(c.for);
    // A comparable without a price is not a comparable (and the column refuses it).
    if (!code || !c.address || num(c.price) == null) continue;
    const notes = [c.days_on_market && `${c.days_on_market} days`, c.price_cuts && `cuts: ${c.price_cuts}`, /auction|sstc|withdrawn/i.test(c.kind || '') && c.kind.toLowerCase()].filter(Boolean).join('; ') || null;
    if (/^https?:\/\//.test(c.source_url || '')) compUrls.push(`(${q(c.source_url)})`);
    comps.push(`(${q(code)}, ${q(c.address)}, ${q([c.type, c.beds && `${c.beds}-bed`, c.m2 && `${c.m2} m2`].filter(Boolean).join(', '))}, ${num(c.price)}, ${q(KIND[(c.kind || 'sold').toLowerCase()] ?? 'asking')}, ${q(c.date)}, ${/^\d{4}-\d{2}-\d{2}$/.test(c.date) ? q(c.date) : 'null'}, ${q(c.source_url)}, ${q(notes)}, ${q(/^low/i.test(c.confidence || '') ? 'drafted' : 'researched')}, ${num(c.beds) ?? 'null'}, ${num(c.m2) ?? 'null'})`);
  }
  if (comps.length) {
    deferred.push(`insert into sources (household_id, key, kind, title, url, publisher, retrieved_on)
select distinct on (u) ${H}, 'url:' || u, 'web', substring(u from '^https?://(?:www\\.)?([^/]+)'), u, substring(u from '^https?://(?:www\\.)?([^/]+)'), ${q(date)}::date
  from (values ${compUrls.length ? compUrls.join(', ') : '(null::text)'}) v(u) where u ~ '^https?://'
on conflict (household_id, key) do nothing;
insert into ra_comparables (household_id, listing_id, address, property_type, price, kind, when_text, on_date, source, url, notes, confidence, beds, floor_area_m2, source_id)
select distinct on (l.id, split_part(c.address, ',', 1), c.price) ${H}, l.id, c.address, c.ptype, c.price, c.kind, c.when_text, c.on_date::date, ${q(source)}, c.url, c.notes, c.conf,
       c.beds::int, nullif(c.m2::numeric, 0), (select s.id from sources s where s.household_id = ${H} and s.key = 'url:' || c.url)
  from (values
${comps.join(',\n')}
  ) c(code, address, ptype, price, kind, when_text, on_date, url, notes, conf, beds, m2)
  join ra_listings l on l.household_id = ${H} and ${houseJoin('c.code')}
 where not exists (select 1 from ra_comparables x where x.listing_id = l.id and split_part(x.address, ',', 1) = split_part(c.address, ',', 1) and coalesce(x.price, 0) = c.price);`);
    counts.comparables = comps.length;
  }

  // LISTINGS: real houses found for sale. New ones become candidate listings
  // (status 'unreviewed', so the owner decides what to chase); a house already
  // held (same name, or same postcode and first address line) only has its
  // price brought up to date, with the change noted.
  const SALE = { auction: 'auction', mmoa: 'mmoa', private: 'private', tender: 'tender' };
  const houses = csv(b.LISTINGS ?? '').filter((h) => h.name || h.address).map((h) => {
    const notes = [h.agent && `Agent ${h.agent}`, h.listed_date && `listed ${h.listed_date}`, h.days_on_market && `${h.days_on_market} days on market`,
      h.price_cuts && `cuts: ${h.price_cuts}`, h.epc && `EPC ${h.epc}`, h.heating && `heating ${h.heating}`, h.drainage && `drainage ${h.drainage}`,
      h.flood && `flood ${h.flood}`, h.broadband && `broadband ${h.broadband}`, h.notes].filter(Boolean).join('; ');
    const pk = /guide/i.test(h.price_kind || '') ? 'guide' : 'asking';
    return `(${q(h.name || h.address)}, ${q(h.address)}, ${q((h.postcode || '').toUpperCase() || null)}, ${q(h.type)}, ${num(h.beds) ?? 'null'}, ${num(h.baths) ?? 'null'}, ${num(h.m2) ?? 'null'}, ${num(h.plot_acres) ?? 'null'}, ${q(h.condition)}, ${num(h.price) ?? 'null'}, ${q(pk)}, ${q(SALE[(h.sale_method || '').toLowerCase()] ?? 'private')}, ${q(h.url)}, ${q(notes || null)})`;
  });
  if (houses.length) {
    // Cast every column: a column that is null in every row would otherwise be text.
    out.push(`create temp table _l on commit drop as select name::text, address::text, postcode::text, ptype::text, beds::int, baths::int, m2::numeric, acres::numeric,
  cond::text, price::numeric, pkind::text, method::text, url::text, notes::text from (values
${houses.join(',\n')}
) v(name, address, postcode, ptype, beds, baths, m2, acres, cond, price, pkind, method, url, notes);
-- New houses become candidate listings, numbered on from the highest L code.
with fresh as (
  select s.*, row_number() over (order by s.name) rn from _l s
   where not exists (select 1 from ra_listings x where x.household_id = ${H}
     and (lower(x.name) = lower(s.name) or (s.postcode is not null and x.postcode = s.postcode and split_part(lower(x.address), ',', 1) = split_part(lower(s.address), ',', 1))))),
base as (select coalesce(max(substring(code from 2)::int), 0) n from ra_listings where household_id = ${H} and code ~ '^L[0-9]+$')
insert into ra_listings (household_id, code, name, address, postcode, links, source, property_type, detached, beds, baths, floor_area_m2, plot_acres, condition, asking_price, guide_price, sale_method, purpose, status, confidence, checked_on, notes, fee, fee_pct)
select ${H}, 'L' || (base.n + fresh.rn), fresh.name, fresh.address, fresh.postcode, case when fresh.url is null then '{}'::text[] else array[fresh.url] end, ${q(source)},
       fresh.ptype, fresh.ptype ilike '%detached%' and fresh.ptype not ilike '%semi%', fresh.beds, fresh.baths, fresh.m2, fresh.acres, fresh.cond,
       case when fresh.pkind = 'asking' then fresh.price end, case when fresh.pkind = 'guide' then fresh.price end, fresh.method,
       'candidate', 'unreviewed', 'researched', ${q(date)}, fresh.notes, 0, 0
  from fresh, base;
-- A house already held: a new price is recorded, with the change noted; nothing else is touched.
insert into ra_listings select x.* from ra_listings x join _l s on x.household_id = ${H}
   and (lower(x.name) = lower(s.name) or (s.postcode is not null and x.postcode = s.postcode and split_part(lower(x.address), ',', 1) = split_part(lower(s.address), ',', 1)))
 where s.price is not null and x.status not in ('dropped', 'closed', 'lost')
   and s.price is distinct from (case when s.pkind = 'guide' then x.guide_price else x.asking_price end)
on conflict (id) do update set
  asking_price = coalesce((select case when w.pkind = 'asking' then w.price end from _l w where lower(w.name) = lower(ra_listings.name) limit 1), ra_listings.asking_price),
  guide_price = coalesce((select case when w.pkind = 'guide' then w.price end from _l w where lower(w.name) = lower(ra_listings.name) limit 1), ra_listings.guide_price),
  checked_on = ${q(date)},
  notes = concat_ws(' | ', ra_listings.notes, ${q(`${date}: price updated from research`)});`);
    counts.listings = houses.length;
  }
  out.push(...deferred); // comparables, now that any NEW house exists

  const evidence = [];
  for (const e of csv(b.EVIDENCE ?? '')) evidence.push([e.topic || 'Research', e.claim, e.figure, [e.source_url, e.source_date, e.label].filter(Boolean).join(' | ')]);
  for (const r of csv(b.RECALL_LEDGER ?? '').filter((x) => !/^houseandhome DB/i.test(x.chat_title || ''))) evidence.push([`Recall: ${r.topic || 'general'}`, `${r.fact}${r.status === 'superseded' ? ' (superseded)' : ''}`, r.figure, `${r.chat_title || 'past chat'} ${r.chat_date || ''} | ${r.label || ''}`.trim()]);
  for (const r of csv(b.ROADS_RECALLED ?? '')) evidence.push([`Road recall ${r.code}`, `${r.name} (${r.status}${r.why_retired ? `: ${r.why_retired}` : ''}). ${r.house_type || ''} ${r.where || ''}. Buy ${r.price || '?'} ${r.buy_month || ''}, works ${r.works || '?'}, finished ${r.finished_value || '?'}, sell ${r.sell_month || '-'}; next ${r.next_step || '-'}`, r.price, r.source_chats || 'past chats']);
  // VILLAGES: one row per village, kept whole as one variable and one evidence line each.
  // Empty cells are dropped so the stored rows stay small.
  const villages = csv(b.VILLAGES ?? '').map(typed).filter((v) => v.village)
    .map((v) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x != null)));
  if (villages.length) {
    setVar('area.west_villages', 'Villages, Shaftesbury to Yeovil (research)', villages, 'One row per village: prices, character, services, risks.');
    counts.villages = villages.length;
  }
  const results = csv(b.ROUTE_RESULTS ?? '');
  if (results.length) {
    // { sensitivity: { route: [425k, 450k, 475k, 500k months, cash+equity Apr 2029, Dec 2031] } }; route notes go to evidence.
    const grid = { columns: ['£425k', '£450k', '£475k', '£500k', 'cash+equity Apr 2029', 'cash+equity Dec 2031'] };
    for (const r of results) {
      (grid[r.sensitivity || 'central'] ??= {})[r.route] = [r.first_month_425k, r.first_month_450k, r.first_month_475k, r.first_month_500k, num(r.cash_and_equity_apr2029), num(r.cash_and_equity_dec2031)];
    }
    setVar('research.route_results', 'Route results by sensitivity (research run)', grid, 'Sensitivities as returned; route notes are on the evidence rows.', 'ESTIMATE');
    counts.route_results = results.length;
  }
  for (const r of results.filter((x) => (x.sensitivity || 'central') === 'central')) evidence.push([`Route result ${r.route}`, `${r.sensitivity}: £425k ${r.first_month_425k}, £450k ${r.first_month_450k}, £475k ${r.first_month_475k}, £500k ${r.first_month_500k}; Apr 2029 ${r.cash_and_equity_apr2029}; Dec 2031 ${r.cash_and_equity_dec2031}. ${r.notes || ''}`, r.first_month_450k, 'Research model run (ESTIMATE)']);
  for (const name of ['BRIEF', 'QUESTIONS_FROM_RECALL', 'VERDICT', 'NOT_FOUND']) if (b[name]) evidence.push([{ BRIEF: 'Brief (recalled)', VERDICT: 'Research verdict', QUESTIONS_FROM_RECALL: 'Questions from recall', NOT_FOUND: 'Research: not found' }[name], b[name].slice(0, 4000), null, source]);
  if (evidence.length) {
    out.push(`with base as (select coalesce(max(nullif(regexp_replace(code, '\\D', '', 'g'), '')::int), 0) n from ra_evidence where household_id = ${H})
insert into ra_evidence (household_id, code, period, topic, claim, figure, source, used_in)
select ${H}, 'E' || (base.n + v.i), ${q(date.slice(0, 7))}, v.topic, v.claim, v.figure, v.src,
       -- 'house: <name>' evidence is filed under that house's listing code.
       coalesce(case when v.topic ilike 'house:%' then (select l.code from ra_listings l where l.household_id = ${H}
         and (l.name ilike '%' || trim(substr(v.topic, 7)) || '%' or l.address ilike '%' || trim(substr(v.topic, 7)) || '%') order by l.code desc limit 1) end, ${q(source.slice(0, 60))})
  from base, (values
${evidence.map(([t, c, f, s], i) => `  (${i + 1}, ${q(t)}, ${q(c || '(blank)')}, ${q(f)}, ${q(s)})`).join(',\n')}
  ) v(i, topic, claim, figure, src);`);
    counts.evidence = evidence.length;
  }

  // Two rows on one topic get distinct keys (r-topic, r-topic_2, ...), or the second would clash.
  const seenKeys = {};
  const keyFor = (topic) => { const k = `r-${slug(topic)}`; seenKeys[k] = (seenKeys[k] ?? 0) + 1; return seenKeys[k] > 1 ? `${k}_${seenKeys[k]}` : k; };
  // The brain's tables (supabase/schema/92_brain.sql): a fact about one
  // house is a listing_facts row and a number about a place is a
  // market_stats row - never a variable key with a name in it. Each URL
  // becomes a sources row first, so every fact can say where it came from.
  const LABELS = ['STATED', 'VERIFIED', 'ESTIMATE', 'CHECK'];
  const label = (l) => { const u = String(l ?? '').toUpperCase(); return LABELS.includes(u) ? u : (u === 'LIKELY' ? 'CHECK' : 'ESTIMATE'); };
  const sourcesFrom = (table) => `insert into sources (household_id, key, kind, title, url, publisher, retrieved_on)
select distinct on (url) ${H}, 'url:' || url, 'web', substring(url from '^https?://(?:www\\.)?([^/]+)'), url,
       substring(url from '^https?://(?:www\\.)?([^/]+)'), sdate::date from ${table} where url ~ '^https?://'
on conflict (household_id, key) do nothing;`;

  const facts = csv(b.LISTING_FACTS ?? '').filter((f) => (f.listing || f.for) && f.attribute && String(f.value ?? '').trim() !== '')
    .map((f) => {
      const code = houseRef(f.listing || f.for, { names: true });
      const n = /^\d{4}-\d{2}/.test(f.value) ? null : num(f.value);
      const lab = label(f.label);
      return `(${q(code)}, ${q(slug(f.attribute))}, ${n == null ? q(f.value) : 'null'}, ${n ?? 'null'}, ${q(f.unit)}, ${q(f.source_url)}, ${q(asDate(f.source_date, date))}, ${q(lab)}, ${q(CONF[lab])}, ${q(f.notes)})`;
    });
  if (facts.length) {
    out.push(`create temp table _lf on commit drop as select code::text, attr::text, vtext::text, vnum::numeric, unit::text, url::text, sdate::text, lab::text, conf::text, note::text from (values
${facts.join(',\n')}
) v(code, attr, vtext, vnum, unit, url, sdate, lab, conf, note);
${sourcesFrom('_lf')}
-- A different researched value supersedes the current one; a confirmed fact is never replaced.
update listing_facts f set status = 'superseded', note = concat_ws(' | ', f.note, ${q(`Superseded by research, ${date}`)})
  from _lf v join ra_listings l on l.household_id = ${H} and ${houseJoin('v.code')}
 where f.listing_id = l.id and f.attribute = v.attr and f.status = 'active' and f.confidence <> 'confirmed'
   and (coalesce(f.value_text, '') <> coalesce(v.vtext, '') or coalesce(f.value_num, -1) <> coalesce(v.vnum, -1));
insert into listing_facts (household_id, listing_id, attribute, value_text, value_num, unit, as_of, source_id, label, confidence, note)
select ${H}, l.id, v.attr, v.vtext, v.vnum, v.unit, v.sdate::date,
       (select s.id from sources s where s.household_id = ${H} and s.key = 'url:' || v.url), v.lab, v.conf, v.note
  from _lf v join ra_listings l on l.household_id = ${H} and ${houseJoin('v.code')}
on conflict (listing_id, attribute) where status = 'active' do nothing;
insert into contradictions (household_id, key, topic, source_a, position_a, source_b, position_b, what_it_changes, status)
select ${H}, 'r-fact-' || l.code || '-' || v.attr || '-${date}', l.code || ' ' || v.attr || ': research differs from a confirmed fact',
       'Owner (confirmed)', coalesce(f.value_text, f.value_num::text), coalesce(v.url, ${q(source)}), coalesce(v.vtext, v.vnum::text),
       'Put to the owner; the confirmed fact stands until then', 'open'
  from _lf v join ra_listings l on l.household_id = ${H} and ${houseJoin('v.code')}
  join listing_facts f on f.listing_id = l.id and f.attribute = v.attr and f.status = 'active' and f.confidence = 'confirmed'
 where (coalesce(f.value_text, '') <> coalesce(v.vtext, '') or coalesce(f.value_num, -1) <> coalesce(v.vnum, -1))
on conflict do nothing;`);
    counts.listing_facts = facts.length;
  }

  const METRICS = ['sales_count', 'median_price', 'mean_price', 'median_price_m2', 'median_days_on_market', 'rent_monthly', 'hpi_index', 'avg_price', 'price_change'];
  const placeKind = (p) => (/^[A-Z]{1,2}\d{1,2}[A-Z]? \d$/i.test(p) ? 'postcode_sector' : /^[A-Z]{1,2}\d{1,2}[A-Z]?$/i.test(p) ? 'postcode_district' : 'village');
  const stats = csv(b.MARKET_STATS ?? '').map((m) => ({ ...m, metric: slug(m.metric), val: num(m.value) }))
    .filter((m) => m.place && METRICS.includes(m.metric) && m.val != null && m.period)
    .map((m) => {
      const lab = label(m.label);
      return `(${q(slug(m.place))}, ${q(m.place.trim())}, ${q(placeKind(m.place.trim()))}, ${q(m.metric)}, ${q(slug(m.segment || 'all'))}, ${q(String(m.period).trim())}, ${m.val}, ${num(m.n) ?? 'null'}, ${q(m.source_url)}, ${q(asDate(m.source_date, date))}, ${q(lab)}, ${q(CONF[lab])})`;
    });
  if (stats.length) {
    out.push(`create temp table _ms on commit drop as select pkey::text, pname::text, pkind::text, metric::text, seg::text, period::text, val::numeric, n::int, url::text, sdate::text, lab::text, conf::text from (values
${stats.join(',\n')}
) v(pkey, pname, pkind, metric, seg, period, val, n, url, sdate, lab, conf);
${sourcesFrom('_ms')}
insert into places (household_id, key, name, kind, label, confidence, note)
select distinct on (pkey) ${H}, pkey, pname, pkind, lab, conf, ${q(`From research, ${date}`)} from _ms order by pkey
on conflict (household_id, key) do nothing;
insert into market_stats (household_id, place_id, metric, segment, period, value, n, source_id, label, confidence)
select ${H}, p.id, v.metric, v.seg, v.period, v.val, v.n,
       (select s.id from sources s where s.household_id = ${H} and s.key = 'url:' || v.url), v.lab, v.conf
  from _ms v join places p on p.household_id = ${H} and p.key = v.pkey
on conflict do nothing;`);
    counts.market_stats = stats.length;
  }

  const cons = csv(b.CONTRADICTIONS ?? '').filter((c) => c.topic)
    .map((c) => `(${q(keyFor(c.topic))}, ${q(c.topic)}, ${q(c.source_a)}, ${q(c.position_a || '-')}, ${q(c.source_b)}, ${q(c.position_b || '-')}, ${q(c.what_it_changes)})`);
  if (cons.length) {
    out.push(`insert into contradictions (household_id, key, topic, source_a, position_a, source_b, position_b, what_it_changes, status)
select ${H}, k, t, sa, pa, sb, pb, w, 'open' from (values
${cons.join(',\n')}
) v(k, t, sa, pa, sb, pb, w)
 where not exists (select 1 from contradictions x where x.key = v.k);`);
    counts.contradictions = cons.length;
  }

  const log = csv(b.SEARCH_LOG ?? '');
  if (log.length) {
    out.push(`insert into source_documents (household_id, title, kind, as_of, author, source_note, status)
select ${H}, ${q(`Routes research reply (${log.length} searches)`)}, 'report', ${q(date)}, 'Claude (web research)', ${q(`${source}. Search log of ${log.length} queries held by the owner.`)}, 'current'
 where not exists (select 1 from source_documents where title = ${q(`Routes research reply (${log.length} searches)`)} and as_of = ${q(date)});`);
    counts.searches = log.length;
  }
  // Re-derive the engine links (comparable and evidence strengths) over what was just loaded.
  out.push(`select refresh_brain_links(${H});`);
  out.push('commit;');
  out.push(`-- Expected: ${JSON.stringify(counts)}`);
  return { sql: out.join('\n'), counts, found: Object.keys(b) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const i = process.argv.indexOf('--source');
  const household = process.argv[process.argv.indexOf('--household') + 1];
  if (!file || !process.argv.includes('--household')) {
    console.error('usage: node tools/ingest-research.mjs <reply.md> --household <uuid> [--source "label"]');
    process.exit(1);
  }
  const text = statSync(file).isDirectory() ? folderAsReply(file) : readFileSync(file, 'utf8');
  const { sql, counts, found } = toSql(text, { household, source: i > -1 ? process.argv[i + 1] : 'Research reply' });
  console.error(`blocks found: ${found.join(', ') || 'none'}; rows: ${JSON.stringify(counts)}`);
  console.log(sql);
}
