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
const KIND = { sold: 'sold', asking: 'asking', guide: 'guide', estimate: 'estimate', auction: 'guide', sstc: 'asking', listed: 'asking' };
const CONF = { STATED: 'researched', VERIFIED: 'researched', ESTIMATE: 'drafted', CHECK: 'drafted' };

// Keys a reply may invent for figures the household already holds under
// another name: map to the existing key, or skip (null) when the existing
// key is the owner's and a restatement adds nothing.
export const ALIASES = {
  'income.gross': 'income.gross_salary_now', 'income.net': 'income.net_pay_now',
  'income.student_loan': 'income.student_loan_monthly', 'rent.used_in_model': 'costs.bridge_rent',
  'fees.agent_pct_whiteley': 'p004.agent_fee_pct', 'mortgage.term_months': null, 'cash.dec2026': null, 'sdlt.ftb': null,
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
  // Prose blocks (BRIEF, VERDICT) may come without a fence.
  for (const name of ['BRIEF', 'VERDICT', 'QUESTIONS_FROM_RECALL', 'NOT_FOUND']) {
    if (out[name]) continue;
    const p = new RegExp(`${name}[^\\n]*\\n([\\s\\S]*?)(?:\\n#{1,3} |\\n[A-Z_]{4,}\\b|$)`).exec(text);
    if (p) out[name] = p[1].trim();
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

  for (const c of csv(b.COMPARABLES ?? '')) {
    const code = LISTING_FOR[(c.for || '').toUpperCase()];
    // A comparable without a price is not a comparable (and the column refuses it).
    if (!code || !c.address || num(c.price) == null) continue;
    out.push(`insert into ra_comparables (household_id, listing_id, address, property_type, price, kind, when_text, on_date, source, url, notes, confidence)
select ${H}, l.id, ${q(c.address)}, ${q([c.type, c.beds && `${c.beds}-bed`, c.m2 && `${c.m2} m2`].filter(Boolean).join(', '))}, ${num(c.price) ?? 'null'}, ${q(KIND[(c.kind || 'sold').toLowerCase()] ?? 'asking')}, ${q(c.date)}, ${/^\d{4}-\d{2}-\d{2}$/.test(c.date) ? q(c.date) : 'null'}, ${q(source)}, ${q(c.source_url)}, ${q([c.days_on_market && `${c.days_on_market} days`, c.price_cuts && `cuts: ${c.price_cuts}`, /auction|sstc/i.test(c.kind || '') && c.kind.toLowerCase()].filter(Boolean).join('; ') || null)}, ${q((c.confidence || '').toUpperCase() === 'LOW' ? 'drafted' : 'researched')}
  from ra_listings l where l.household_id = ${H} and l.code = ${q(code)}
   and not exists (select 1 from ra_comparables x where x.listing_id = l.id and x.address = ${q(c.address)} and coalesce(x.price, 0) = ${num(c.price) ?? 0});`);
    counts.comparables = (counts.comparables ?? 0) + 1;
  }

  const evidence = [];
  for (const e of csv(b.EVIDENCE ?? '')) evidence.push([e.topic || 'Research', e.claim, e.figure, [e.source_url, e.source_date, e.label].filter(Boolean).join(' | ')]);
  for (const r of csv(b.RECALL_LEDGER ?? '').filter((x) => !/^houseandhome DB/i.test(x.chat_title || ''))) evidence.push([`Recall: ${r.topic || 'general'}`, `${r.fact}${r.status === 'superseded' ? ' (superseded)' : ''}`, r.figure, `${r.chat_title || 'past chat'} ${r.chat_date || ''} | ${r.label || ''}`.trim()]);
  for (const r of csv(b.ROADS_RECALLED ?? '')) evidence.push([`Road recall ${r.code}`, `${r.name} (${r.status}${r.why_retired ? `: ${r.why_retired}` : ''}). ${r.house_type || ''} ${r.where || ''}. Buy ${r.price || '?'} ${r.buy_month || ''}, works ${r.works || '?'}, finished ${r.finished_value || '?'}, sell ${r.sell_month || '-'}; next ${r.next_step || '-'}`, r.price, r.source_chats || 'past chats']);
  // VILLAGES: one row per village, kept whole as one variable and one evidence line each.
  const villages = csv(b.VILLAGES ?? '').map(typed).filter((v) => v.village);
  if (villages.length) {
    setVar('area.west_villages', 'Villages, Shaftesbury to Yeovil (research)', villages, 'One row per village: prices, character, services, risks.');
    for (const v of villages) evidence.push([`Village: ${v.village}`, Object.entries(v).filter(([k, x]) => k !== 'village' && x !== '' && x != null).map(([k, x]) => `${k} ${x}`).join('; ').slice(0, 1500), v.detached_median ?? null, v.source_url || source]);
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
select ${H}, 'E' || (base.n + v.i), ${q(date.slice(0, 7))}, v.topic, v.claim, v.figure, v.src, 'Routes research'
  from base, (values
${evidence.map(([t, c, f, s], i) => `  (${i + 1}, ${q(t)}, ${q(c || '(blank)')}, ${q(f)}, ${q(s)})`).join(',\n')}
  ) v(i, topic, claim, figure, src);`);
    counts.evidence = evidence.length;
  }

  for (const c of csv(b.CONTRADICTIONS ?? '')) {
    if (!c.topic) continue;
    out.push(`insert into contradictions (household_id, key, topic, source_a, position_a, source_b, position_b, what_it_changes, status)
select ${H}, ${q(`r-${slug(c.topic)}`)}, ${q(c.topic)}, ${q(c.source_a)}, ${q(c.position_a || '-')}, ${q(c.source_b)}, ${q(c.position_b || '-')}, ${q(c.what_it_changes)}, 'open'
 where not exists (select 1 from contradictions x where x.key = ${q(`r-${slug(c.topic)}`)});`);
    counts.contradictions = (counts.contradictions ?? 0) + 1;
  }

  const log = csv(b.SEARCH_LOG ?? '');
  if (log.length) {
    out.push(`insert into source_documents (household_id, title, kind, as_of, author, source_note, status)
select ${H}, ${q(`Routes research reply (${log.length} searches)`)}, 'report', ${q(date)}, 'Claude (web research)', ${q(`${source}. Search log of ${log.length} queries held by the owner.`)}, 'current'
 where not exists (select 1 from source_documents where title = ${q(`Routes research reply (${log.length} searches)`)} and as_of = ${q(date)});`);
    counts.searches = log.length;
  }
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
