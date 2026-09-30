// road-ahead-seed.mjs - the Rectory kit, loaded into Road Ahead's tables.
//
//   node tools/road-ahead-seed.mjs --household <uuid> [--extract <file>] [--out <dir>]
//
// Writes numbered SQL files to data/road-ahead/seed/ (gitignored: they
// carry the owner's figures). A session runs them through the Supabase
// connector in order - 01 is the auction fast lane - then runs
// 99_verify.sql and compares the counts it prints with the ones this
// command prints. Everything is an insert that does nothing when the row
// is already there, keyed on household plus code, so a second run
// changes nothing and nothing the owner has since changed is overwritten.
//
// The frozen kit-v5 scenario is written last, in parts small enough for
// one connector call each: the extract without its raw data files (those
// are rows now) and with the monthly cash trace kept for the base run
// only (the build plan's A3). road_ahead_export() hands it back, and
// `npm run test:checksums <file>` re-proves the engine on it.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateExtract } from './road-ahead-lib.mjs';
import { lit, num, bool, js, arr, day } from './road-ahead-sql.mjs';
import * as R from './road-ahead-seed-rows.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const HH = flag('household');
if (!/^[0-9a-f-]{36}$/.test(HH ?? '')) {
  console.error('usage: node tools/road-ahead-seed.mjs --household <uuid> [--extract <file>] [--out <dir>]');
  process.exit(2);
}
const X = JSON.parse(readFileSync(resolve(flag('extract') ?? join(ROOT, 'data', 'road-ahead', 'kit-extract.json')), 'utf8'));
const bad = validateExtract(X);
if (bad.length) { console.error(`not a valid extract:\n  ${bad.join('\n  ')}`); process.exit(1); }
const OUT = resolve(flag('out') ?? join(ROOT, 'data', 'road-ahead', 'seed'));
if (!OUT.startsWith(join(ROOT, 'data', 'road-ahead')) && !flag('out')) process.exit(1);

// ---------------------------------------------------------------
// SQL literals.
// ---------------------------------------------------------------
const ts = (t) => (t ? `(${lit(t)}::timestamp at time zone 'Europe/London')` : 'null');
const hh = `'${HH}'::uuid`;
const listingId = (code) => `(select id from public.ra_listings where household_id = ${hh} and code = ${lit(code)})`;
const propertyId = (ref) => (ref ? `(select id from public.properties where household_id = ${hh} and ref = ${lit(ref)})` : 'null');

function insert(table, cols, rows, conflict) {
  if (!rows.length) return '';
  const values = rows.map((r) => `  (${hh}, ${cols.map(([, f]) => f(r)).join(', ')})`).join(',\n');
  return `insert into public.${table} (household_id, ${cols.map(([c]) => c).join(', ')}) values\n${values}\n`
    + `on conflict ${conflict} do nothing;\n`;
}

// ---------------------------------------------------------------
// Rows.
// ---------------------------------------------------------------
const register = R.registerListings(X);
const mapping = R.appraisalListings(X, register);
const extraListings = mapping.map((m) => m.listing).filter(Boolean);
const older = R.olderListings(X, register);
const decisions = R.decisions(X, register);
const signals = R.signals(X, register);

const LISTING_COLS = [
  ['code', (r) => lit(r.code)], ['kit_ref', (r) => lit(r.kit_ref)], ['name', (r) => lit(r.name)],
  ['address', (r) => lit(r.address)], ['postcode', (r) => lit(r.postcode)], ['links', (r) => arr(r.links)],
  ['source', (r) => lit(r.source)], ['house_code', (r) => lit(r.house_code)], ['lot', (r) => lit(r.lot)],
  ['auction_on', (r) => day(r.auction_on)], ['auction_at', (r) => ts(r.auction_at)], ['sale_method', (r) => lit(r.sale_method)],
  ['property_type', (r) => lit(r.property_type)], ['detached', (r) => bool(r.detached)], ['beds', (r) => num(r.beds)],
  ['baths', (r) => num(r.baths)], ['floor_area_m2', (r) => num(r.floor_area_m2)], ['condition', (r) => lit(r.condition)],
  ['minutes_from_home', (r) => num(r.minutes_from_home)], ['guide_price', (r) => num(r.guide_price)],
  ['asking_price', (r) => num(r.asking_price)], ['fee', (r) => num(r.fee ?? 0)], ['fee_pct', (r) => num(r.fee_pct ?? 0)],
  ['purpose', (r) => lit(r.purpose)], ['status', (r) => lit(r.status)], ['status_reason', (r) => lit(r.status_reason)],
  ['reaction', (r) => lit(r.reaction)], ['flag', (r) => lit(r.flag)], ['category', (r) => lit(r.category)],
  ['notes', (r) => lit(r.notes)], ['property_id', (r) => propertyId(r.property_ref)], ['confidence', (r) => lit(r.confidence)],
  ['checked_on', (r) => day(r.checked_on)],
];

// Many rows as one statement: a VALUES list joined to its listing, each
// row added only if that listing has no appraisal of that protocol and date.
function appraisalsSql(rows) {
  if (!rows.length) return '';
  const values = rows.map((a) => `  (${[lit(a.code), lit(a.appraised_on), lit(a.protocol), lit(JSON.stringify(a.inputs)),
    lit(a.outputs == null ? null : JSON.stringify(a.outputs)), lit(JSON.stringify(a.fits)), lit(a.verdict), lit(a.override_grade),
    lit(a.override_reason), lit(JSON.stringify(a.next_checks)), lit(JSON.stringify(a.sources)), lit(JSON.stringify(a.labels)),
    lit(a.narrative == null ? null : JSON.stringify(a.narrative))].join(', ')})`).join(',\n');
  return `insert into public.ra_appraisals (household_id, listing_id, appraised_on, authored_by, protocol, engine_version,
  inputs, outputs, fits, verdict, override_grade, override_reason, next_checks, sources, labels, narrative)
select ${hh}, l.id, v.d::date, 'kit', v.p, ${lit(R.KIT)}, v.i::jsonb, v.o::jsonb, v.f::jsonb, v.verdict, v.og, v.orr,
  array(select jsonb_array_elements_text(v.nc::jsonb)), v.src::jsonb, v.lab::jsonb, v.nar::jsonb
  from (values
${values}
  ) v(code, d, p, i, o, f, verdict, og, orr, nc, src, lab, nar)
  join public.ra_listings l on l.household_id = ${hh} and l.code = v.code
 where not exists (select 1 from public.ra_appraisals x where x.listing_id = l.id
                    and x.protocol = v.p and x.appraised_on = v.d::date);\n`;
}

// Links by code, resolved to ids in one statement; a link already open
// between the pair, either way round, is not added again.
function linksSql(rows) {
  if (!rows.length) return '';
  const idOf = (type, col) => `case ${type} when 'decision' then (select id from public.decisions where household_id = ${hh} and code = ${col})
      when 'listing' then (select id from public.ra_listings where household_id = ${hh} and code = ${col})
      when 'signal' then (select id from public.ra_signals where household_id = ${hh} and code = ${col}) end`;
  const values = rows.map((r) => `  (${[r.ft, r.fc, r.tt, r.tc, r.kind, r.note].map(lit).join(', ')})`).join(',\n');
  return `with v(ft, fc, tt, tc, kind, note) as (values
${values}
), ids as (
  select v.*, ${idOf('v.ft', 'v.fc')} as fid,
    ${idOf('v.tt', 'v.tc')} as tid
  from v)
insert into public.knowledge_links (household_id, from_type, from_id, to_type, to_id, kind, note, confidence)
select ${hh}, ids.ft, ids.fid, ids.tt, ids.tid, ids.kind, ids.note, 'derived' from ids
 where ids.fid is not null and ids.tid is not null
   and not exists (select 1 from public.knowledge_links k where k.valid_to is null and k.kind = ids.kind
                    and ((k.from_id = ids.fid and k.to_id = ids.tid) or (k.from_id = ids.tid and k.to_id = ids.fid)));\n`;
}

const files = {};
const put = (name, header, body) => { files[name] = `-- ${header}\n-- Generated by tools/road-ahead-seed.mjs from the private kit extract. Private.\n\n${body}`; };

put('01_fast_lane.sql', 'The auction houses and the v5 register: the 21 October countdown first.',
  insert('ra_auction_houses', [['code', (r) => lit(r.code)], ['name', (r) => lit(r.name)], ['format', (r) => lit(r.format)],
    ['covers', (r) => lit(r.covers)], ['cadence', (r) => lit(r.cadence)], ['link', (r) => lit(r.link)], ['why', (r) => lit(r.why)]],
  R.auctionHouses(X), '(household_id, code)')
  + insert('ra_listings', LISTING_COLS, register, '(household_id, code)'));

put('02_variables.sql', 'Every variable, with both labels.', insert('ra_variables', [
  ['key', (r) => lit(r.key)], ['label', (r) => lit(r.label)], ['value', (r) => js(r.value)], ['unit', (r) => lit(r.unit)],
  ['low', (r) => js(r.low)], ['high', (r) => js(r.high)], ['evidence', (r) => lit(r.evidence)], ['certainty', (r) => lit(r.certainty)],
  ['confidence', (r) => lit(r.confidence)], ['confirmed_at', (r) => (r.confirmed_at ? `${lit(r.confirmed_at)}::timestamptz` : 'null')],
  ['source', (r) => lit(r.source)], ['source_date', (r) => day(r.source_date)], ['status', (r) => lit(r.status)],
  ['resolution', (r) => lit(r.resolution)]], R.variables(X), '(household_id, key)'));

put('03_scenarios_roads_rules.sql', 'Scenarios, roads (active and retired) and the rules.',
  insert('ra_scenarios', [['key', (r) => lit(r.key)], ['name', (r) => lit(r.name)], ['description', (r) => lit(r.description)],
    ['overrides', (r) => js(r.overrides)], ['works_factor', (r) => num(r.works_factor)], ['help', (r) => bool(r.help)],
    ['is_builtin', (r) => bool(r.is_builtin)], ['is_default', (r) => bool(r.is_default)], ['status', (r) => lit(r.status)],
    ['resolution', (r) => lit(r.resolution)], ['source', (r) => lit(r.source)], ['confidence', (r) => lit(r.confidence)]],
  R.scenarios(X), '(household_id, key)')
  + insert('ra_roads', [['code', (r) => lit(r.code)], ['name', (r) => lit(r.name)], ['kind', (r) => lit(r.kind)],
    ['rank_label', (r) => lit(r.rank_label)], ['family', (r) => lit(r.family)], ['near', (r) => bool(r.near)],
    ['stages', (r) => js(r.stages)], ['narrative', (r) => lit(r.narrative)], ['sort_order', (r) => num(r.sort_order)],
    ['status', (r) => lit(r.status)], ['retired_by', (r) => lit(r.retired_by)], ['resolution', (r) => lit(r.resolution)],
    ['source', (r) => lit(r.source)]], R.roads(X), '(household_id, code)')
  + insert('ra_rules', [['code', (r) => lit(r.code)], ['scope', (r) => lit(r.scope)], ['kind', (r) => lit(r.kind)],
    ['rule', (r) => lit(r.rule)], ['params', (r) => js(r.params)], ['severity', (r) => lit(r.severity)],
    ['source', (r) => lit(r.source)]], R.rules(X), '(household_id, code)'));

put('04_listings_more.sql', 'Listings from the Part N appraisals and the older register.',
  insert('ra_listings', LISTING_COLS, [...extraListings, ...older], '(household_id, code)'));

put('05_appraisals_register.sql', 'The v5 register, one appraisal per listing, the kit\'s published row kept as its output.',
  appraisalsSql(R.registerAppraisals(X, register)));

put('06_appraisals_part_n.sql', 'The Part N appraisals and their comparables.',
  appraisalsSql(R.partNAppraisals(X, mapping))
  + insert('ra_comparables', [['listing_id', (r) => listingId(r.code)], ['address', (r) => lit(r.address)],
    ['property_type', (r) => lit(r.property_type)], ['price', (r) => num(r.price)], ['kind', (r) => lit(r.kind)],
    ['when_text', (r) => lit(r.when_text)], ['on_date', (r) => day(r.on_date)], ['source', (r) => lit(r.source)]],
  R.comparables(X, mapping), '(household_id, address, price, when_text)'));

put('07_decisions_checkpoints.sql', 'The kit\'s decision log (domain road) and its checkpoints.',
  insert('decisions', [['property_id', (r) => propertyId(r.property_ref)], ['code', (r) => lit(r.code)], ['domain', () => "'road'"],
    ['topic', (r) => lit(r.topic)], ['title', (r) => lit(r.title)], ['decided', (r) => lit(r.decided)],
    ['rationale', (r) => lit(r.rationale)], ['decided_on', (r) => day(r.decided_on)], ['status', (r) => lit(r.status)],
    ['firmness', (r) => lit(r.firmness)], ['door', (r) => lit(r.door)], ['evidence', (r) => lit(r.evidence)],
    ['certainty', (r) => lit(r.certainty)], ['reopen_if', (r) => lit(r.reopen_if)], ['checkpoint', (r) => lit(r.checkpoint)],
    ['source', (r) => lit(r.source)]], decisions, '(household_id, code) where code is not null')
  // The pointer only where the kit itself marks the old decision superseded;
  // every supersedes relationship is a link (10_links.sql), and the
  // current-decisions view leaves out whatever a newer decision supersedes.
  + decisions.flatMap((d) => d.supersedes.filter((old) => decisions.find((x) => x.code === old)?.status === 'superseded')
    .map((old) => `update public.decisions set superseded_by_id =
  (select id from public.decisions where household_id = ${hh} and code = ${lit(d.code)})
 where household_id = ${hh} and code = ${lit(old)} and superseded_by_id is null;\n`)).join('')
  + insert('milestones', [['key', (r) => lit(r.key)], ['title', (r) => lit(r.title)], ['description', (r) => lit(r.description)],
    ['due_on', (r) => day(r.due_on)], ['sort_order', (r) => num(r.sort_order)]], R.checkpoints(X), '(household_id, key)'));

put('08_signals_evidence.sql', 'The owner\'s words (signals, reactions, patterns) and the evidence register.',
  insert('ra_signals', [['code', (r) => lit(r.code)], ['kind', (r) => lit(r.kind)], ['words', (r) => lit(r.words)],
    ['context', (r) => lit(r.context)], ['implies', (r) => lit(r.implies)], ['open_question', (r) => lit(r.open_question)],
    ['conflicts', (r) => arr(r.conflicts)], ['certainty', (r) => lit(r.certainty)], ['rating', (r) => lit(r.rating)],
    ['said_on', (r) => day(r.said_on)], ['notes', (r) => lit(r.notes)], ['source', (r) => lit(r.source)]], signals, '(household_id, code)')
  + insert('ra_evidence', [['code', (r) => lit(r.code)], ['period', (r) => lit(r.period)], ['topic', (r) => lit(r.topic)],
    ['claim', (r) => lit(r.claim)], ['figure', (r) => lit(r.figure)], ['source', (r) => lit(r.source)], ['used_in', (r) => lit(r.used_in)]],
  R.evidence(X), '(household_id, code)'));

put('09_auctions.sql', 'The auction calendar, results and playbook.',
  insert('ra_auction_calendar', [['house_code', (r) => lit(r.house_code)], ['kind', (r) => lit(r.kind)], ['on_date', (r) => day(r.on_date)],
    ['title', (r) => lit(r.title)], ['checked_on', (r) => day(r.checked_on)]], R.calendar(X), '(household_id, house_code, kind, on_date, title)')
  + insert('ra_auction_results', [['house_code', (r) => lit(r.house_code)], ['sold_on', (r) => day(r.sold_on)], ['lot', (r) => lit(r.lot)],
    ['property_type', (r) => lit(r.property_type)], ['guide', (r) => num(r.guide)], ['sold', (r) => num(r.sold)],
    ['outcome', (r) => lit(r.outcome)], ['lesson', (r) => lit(r.lesson)], ['source', (r) => lit(r.source)]],
  R.results(X), '(household_id, house_code, sold_on, lot)')
  + insert('ra_playbook', [['code', (r) => lit(r.code)], ['kind', (r) => lit(r.kind)], ['body', (r) => lit(r.body)],
    ['sort_order', (r) => num(r.sort_order)]], R.playbook(X), '(household_id, code)'));

put('10_links.sql', 'Relationships: decisions superseding and confirming, listings the same house, words about a listing.', linksSql([
  ...decisions.flatMap((d) => d.supersedes.map((old) => ({ ft: 'decision', fc: d.code, tt: 'decision', tc: old, kind: 'supersedes' }))),
  ...decisions.flatMap((d) => d.confirms.map((c) => ({ ft: 'decision', fc: d.code, tt: 'decision', tc: c, kind: 'relates_to', note: 'confirms' }))),
  ...decisions.flatMap((d) => d.about.map((code) => ({ ft: 'decision', fc: d.code, tt: 'listing', tc: code, kind: 'about' }))),
  ...older.filter((g) => g.duplicate_of).map((g) => ({ ft: 'listing', fc: g.code, tt: 'listing', tc: g.duplicate_of, kind: 'duplicate_of' })),
  ...signals.flatMap((s) => s.about.map((code) => ({ ft: 'signal', fc: s.code, tt: 'listing', tc: code, kind: 'about' }))),
]));

put('11_kit_runs.sql', 'The kit\'s published road results as the first accepted baseline (headlines only).',
  `insert into public.ra_road_runs (household_id, scenario_key, road_code, run_name, source, engine_version,
  summary, accepted_at, accepted_note)
select ${hh}, v.s, v.r, v.n, 'kit', ${lit(R.KIT)}, v.j::jsonb, ${lit(`${R.REGISTER_ON} 12:00`)}::timestamptz,
  'The Rectory kit v5.0 as published'
  from (values
${R.kitRuns(X).map((r) => `  (${[r.scenario_key, r.road_code, r.run_name, JSON.stringify(r.summary)].map(lit).join(', ')})`).join(',\n')}
  ) v(s, r, n, j)
 where not exists (select 1 from public.ra_road_runs x where x.household_id = ${hh} and x.source = 'kit'
                    and x.road_code = v.r and x.scenario_key = v.s and x.run_name = v.n);\n`);

// ---------------------------------------------------------------
// The frozen kit-v5 scenario, in parts.
// ---------------------------------------------------------------
const EXPORT_FORMAT = 'road-ahead-export/1';
const { data, ...rest } = X;
const frozen = structuredClone({ ...rest, format: EXPORT_FORMAT, traces: 'base' });
for (const road of Object.values(frozen.results.roads_v4)) {
  for (const [k, v] of Object.entries(road)) if (k !== 'base' && v && typeof v === 'object' && 'trace' in v) delete v.trace;
}
const { variables, results, ...head } = frozen;
const { roads_v4: roadsV4, ...otherResults } = results;
const parts = [
  ['head', `insert into public.ra_scenarios (household_id, key, name, description, overrides, is_builtin, status, frozen, source)
values (${hh}, 'kit-v5', 'Rectory kit v5.0, as published', 'The complete inputs and published results of the kit, frozen on 30 Sep 2026: road_ahead_export() returns them for the checksum gate.',
  '{}'::jsonb, true, 'frozen', ${js({ ...head, results: { ...otherResults, roads_v4: {} } })}, ${lit(R.KIT)})
on conflict (household_id, key) do nothing;\n`],
  ['variables', `update public.ra_scenarios set frozen = frozen || jsonb_build_object('variables', ${js(variables)})
 where household_id = ${hh} and key = 'kit-v5' and not frozen ? 'variables';\n`],
  ...Object.entries(roadsV4).map(([code, r]) => [`roads_v4.${code}`,
    `update public.ra_scenarios set frozen = jsonb_set(frozen, '{results,roads_v4,${code}}', ${js(r)})
 where household_id = ${hh} and key = 'kit-v5' and not (frozen #> '{results,roads_v4}') ? ${lit(code)};\n`]),
];
parts.forEach(([name, sql], i) => put(`2${i}_frozen_${name.replace(/\W/g, '_')}.sql`, `The frozen kit-v5 scenario: ${name}.`, sql));

// ---------------------------------------------------------------
// What the database should hold afterwards, and how to check it.
// ---------------------------------------------------------------
// jsonb prints keys shortest first, then bytewise, with ", " and ": ".
const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(', ')}]`;
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)));
    return `{${keys.map((k) => `${JSON.stringify(k)}: ${canon(v[k])}`).join(', ')}}`;
  }
  return JSON.stringify(v);
};
const md5 = (s) => createHash('md5').update(s).digest('hex');
const expect = {
  ra_auction_houses: R.auctionHouses(X).length, ra_listings: register.length + extraListings.length + older.length,
  ra_variables: R.variables(X).length, ra_scenarios: R.scenarios(X).length + 1, ra_roads: R.roads(X).length, ra_rules: R.rules(X).length,
  ra_appraisals: register.length + X.data.appraisals.appraisals.length, ra_comparables: new Set(R.comparables(X, mapping)
    .map((c) => `${c.address}|${c.price}|${c.when_text}`)).size,
  decisions_road: decisions.length, milestones_cp: R.checkpoints(X).length, ra_signals: signals.length, ra_evidence: R.evidence(X).length,
  ra_auction_calendar: R.calendar(X).length, ra_auction_results: R.results(X).length, ra_playbook: R.playbook(X).length,
  ra_road_runs_kit: R.kitRuns(X).length,
};
const frozenHashes = Object.fromEntries(Object.entries(frozen).map(([k, v]) => [k, md5(canon(v))]));
// Every seeded row, re-read: one digest per table over the rows as JSON,
// ids and timestamps left out and every foreign key shown as the code it
// points at, so the same query gives the same digest on the dry-run copy
// and on the live database. Counts alone would miss a wrong value. The
// rows are joined in bytewise order (collate "C"): the two databases sort
// text by different locales, and the digest must not depend on that.
const STRIP = "array['id','household_id','created_at','updated_at','listing_id','property_id','superseded_by_id']";
const digest = (what, from, row, where) => `select ${lit(what)} as what, count(*)::int as n,
       md5(coalesce(string_agg(j::text, '|' order by j::text collate "C"), '')) as digest
  from (select ${row} as j from ${from} where ${where}) x`;
const own = (alias) => `${alias}.household_id = ${hh}`;
put('99_verify.sql', 'Every seeded table re-read: counts and content digests, to compare between the dry run and live.', `set timezone to 'UTC';
${[
  digest('ra_auction_houses', 'public.ra_auction_houses t', `to_jsonb(t) - ${STRIP}`, own('t')),
  digest('ra_listings', 'public.ra_listings t left join public.properties p on p.id = t.property_id',
    `to_jsonb(t) - ${STRIP} || jsonb_build_object('property', p.ref)`, own('t')),
  digest('ra_variables', 'public.ra_variables t', `to_jsonb(t) - ${STRIP}`, own('t')),
  digest('ra_scenarios', 'public.ra_scenarios t', `to_jsonb(t) - ${STRIP} - 'frozen'`, own('t')),
  digest('ra_roads', 'public.ra_roads t', `to_jsonb(t) - ${STRIP}`, own('t')),
  digest('ra_rules', 'public.ra_rules t', `to_jsonb(t) - ${STRIP}`, own('t')),
  digest('ra_appraisals', 'public.ra_appraisals t join public.ra_listings l on l.id = t.listing_id',
    `to_jsonb(t) - ${STRIP} || jsonb_build_object('listing', l.code)`, own('t')),
  digest('ra_comparables', 'public.ra_comparables t left join public.ra_listings l on l.id = t.listing_id',
    `to_jsonb(t) - ${STRIP} || jsonb_build_object('listing', l.code)`, own('t')),
  digest('decisions_road', 'public.decisions t left join public.properties p on p.id = t.property_id left join public.decisions s on s.id = t.superseded_by_id',
    `to_jsonb(t) - ${STRIP} || jsonb_build_object('property', p.ref, 'superseded_by', s.code)`, `${own('t')} and t.domain = 'road' and t.code not like 'RA-%'`),
  digest('milestones_cp', 'public.milestones t', `to_jsonb(t) - ${STRIP}`, `${own('t')} and t.key ~ '^cp[0-9]+$'`),
  digest('ra_signals', 'public.ra_signals t', `to_jsonb(t) - ${STRIP}`, own('t')),
  digest('ra_evidence', 'public.ra_evidence t', `to_jsonb(t) - ${STRIP}`, own('t')),
  digest('ra_auction_calendar', 'public.ra_auction_calendar t', `to_jsonb(t) - ${STRIP}`, own('t')),
  digest('ra_auction_results', 'public.ra_auction_results t', `to_jsonb(t) - ${STRIP}`, own('t')),
  digest('ra_playbook', 'public.ra_playbook t', `to_jsonb(t) - ${STRIP}`, own('t')),
  digest('ra_road_runs_kit', 'public.ra_road_runs t', `to_jsonb(t) - ${STRIP} - 'accepted_at'`, `${own('t')} and t.source = 'kit'`),
  // A link as its kind and the codes it joins; a symmetric link sorted,
  // because the database stores it whichever way round the ids fall.
  `select 'links' as what, count(*)::int as n, md5(coalesce(string_agg(x, '|' order by x collate "C"), '')) as digest from (
  select k.kind || ':' || case when lk.is_symmetric then least(a, b) || '~' || greatest(a, b) else a || '>' || b end
         || ':' || coalesce(k.note, '') as x
    from public.knowledge_links k join public.link_kinds lk on lk.key = k.kind,
         lateral (select coalesce((select code from public.decisions where id = k.from_id), (select code from public.ra_listings where id = k.from_id),
                                  (select code from public.ra_signals where id = k.from_id)) as a,
                         coalesce((select code from public.decisions where id = k.to_id), (select code from public.ra_listings where id = k.to_id),
                                  (select code from public.ra_signals where id = k.to_id)) as b) c
   where ${own('k')} and k.valid_to is null and k.from_type in ('decision', 'listing', 'signal')
     and k.to_type in ('decision', 'listing', 'signal') and c.a is not null and c.b is not null) y`,
].join('\nunion all\n')}
order by what;
select e.key, md5(e.value::text) from public.ra_scenarios s, jsonb_each(s.frozen) e
 where s.household_id = ${hh} and s.key = 'kit-v5' order by e.key;\n`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const [name, sql] of Object.entries(files)) writeFileSync(join(OUT, name), sql);
writeFileSync(join(OUT, 'expected.json'), JSON.stringify({ counts: expect, frozen_md5: frozenHashes }, null, 2));

console.log(`wrote ${Object.keys(files).length} files to ${OUT}`);
for (const [name, sql] of Object.entries(files)) console.log(`  ${name.padEnd(40)} ${(sql.length / 1024).toFixed(1)} KB`);
console.log('\nexpected counts:');
for (const [k, v] of Object.entries(expect)) console.log(`  ${k.padEnd(22)} ${v}`);
console.log(`\nAP to listing: ${mapping.map((m) => `${m.ap} ${m.code}`).join(', ')}`);
console.log(`portal refs: ${[...register, ...older].filter((l) => l.property_ref).map((l) => `${l.code} ${l.property_ref}`).join(', ')}; `
  + `decisions: ${decisions.filter((d) => d.property_ref || d.about.length).map((d) => `${d.code} ${d.property_ref ?? d.about.join('+')}`).join(', ')}`);
if (!existsSync(OUT)) process.exit(1);
