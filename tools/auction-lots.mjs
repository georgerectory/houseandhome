// auction-lots.mjs - fetch a saleroom's published lots, politely, and
// turn them into price observations or a list of lots worth viewing.
//
//   node tools/auction-lots.mjs results --base https://<saleroom> \
//        --section sale-results/furniture --since 2026-01-01 \
//        --profiles profiles.json --household <uuid> --ground <key> \
//        --where "<name>" --out <dir>
//
//   node tools/auction-lots.mjs catalogue --base https://<saleroom> \
//        --section online-catalogue/furniture --premium 30 \
//        --profiles profiles.json --household <uuid> --ground <key> \
//        --where "<name>" --out <dir>
//
// Each mode writes one SQL statement (observations.sql, candidates.sql)
// to be run through the Supabase connector. Both are idempotent.
//
// `profiles.json` is the hunted profiles as read from Supabase: key,
// lot_match, lot_exclude and the price ladder. The output goes to a
// directory OUTSIDE this repository: the lots are public but which
// saleroom, and what they are matched against, are the owner's.
//
// One request every two seconds, one saleroom at a time, and only a
// site whose robots rules allow it: check before pointing this at one.
// It reads what the saleroom itself publishes for buyers to read.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseSales, lastPage, parseLots, toObservations, toCandidates, observationsSql, candidatesSql,
} from './auction-lots-lib.mjs';

const [mode, ...rest] = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};
const base = arg('base');
const section = arg('section');
const out = arg('out');
if (!['results', 'catalogue'].includes(mode) || !base || !section || !out || !arg('profiles')) {
  console.error('usage: auction-lots.mjs results|catalogue --base <url> --section <path> --profiles <json> --out <dir> [...]');
  process.exit(2);
}
const profiles = JSON.parse(readFileSync(arg('profiles'), 'utf8'));
mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path) {
  await sleep(2000);
  const res = await fetch(new URL(path, base), { headers: { 'user-agent': 'houseandhome auction reader (one household, low volume)' } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.text();
}

/** Every page of one sale. */
async function saleLots(saleId, firstHtml) {
  const lots = parseLots(firstHtml);
  const pages = lastPage(firstHtml, section, saleId);
  for (let p = 2; p <= pages; p += 1) lots.push(...parseLots(await get(`/${section}/${saleId}/${p}/`)));
  return lots;
}

const index = await get(`/${section}/`);
const sales = parseSales(index, section);
const today = new Date().toISOString().slice(0, 10);

if (mode === 'results') {
  const since = arg('since', '1900-01-01');
  const wanted = sales.filter((s) => s.date >= since);
  const all = [];
  for (const s of wanted) {
    const lots = await saleLots(s.id, await get(s.path));
    const obs = toObservations(lots, { profiles, saleDate: s.date, where: arg('where', base) });
    all.push(...obs);
    writeFileSync(join(out, `lots-${s.date}.json`), JSON.stringify(lots, null, 1));
    console.log(`${s.date}: ${lots.length} lots, ${lots.filter((l) => l.hammer != null).length} sold, ${obs.length} matched a profile`);
  }
  const sql = observationsSql(all, {
    household: arg('household'), groundKey: arg('ground'), publisher: arg('where', base),
    resultsUrl: String(new URL(`/${section}/`, base)), retrieved: today,
  });
  if (sql) writeFileSync(join(out, 'observations.sql'), `${sql}\n`);
  console.log(`results: ${wanted.length} sales, ${all.length} observations${sql ? ` - run ${join(out, 'observations.sql')} through the connector` : ''}`);
} else {
  // The catalogue index IS the coming sale when there is only one; a
  // saleroom with several lists them the same way the results are.
  const pages = sales.length ? sales : [{ id: null, date: null, path: `/${section}/` }];
  const all = [];
  for (const s of pages) {
    const first = s.id ? await get(s.path) : index;
    const lots = s.id ? await saleLots(s.id, first) : parseLots(first);
    for (const c of toCandidates(lots, { profiles, premiumPct: Number(arg('premium', 30)) })) {
      all.push({ ...c, sale_date: s.date, url: c.path ? String(new URL(c.path, base)) : null });
    }
  }
  writeFileSync(join(out, 'candidates.json'), JSON.stringify(all, null, 1));
  const sql = candidatesSql(all, { household: arg('household'), groundKey: arg('ground'), saleroom: arg('where', base), seenOn: today });
  if (sql) writeFileSync(join(out, 'candidates.sql'), `${sql}\n`);
  console.log(`catalogue: ${all.length} lots match a hunted profile, ${all.filter((c) => c.promising).length} promising on the estimate`);
}
