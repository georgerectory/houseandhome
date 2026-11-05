// The research loader: invented reply, no owner figures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asDate, blocks, csv, jsonv, toSql } from '../../tools/ingest-research.mjs';

const reply = `
Some prose.

## VARIABLES
\`\`\`csv
key,label,value,low,high,unit,evidence(STATED|VERIFIED|ESTIMATE|CHECK),source_url,source_date,notes
mortgage.rate_2y_90_best,"Best 2-year, 90%",5.1%,,,rate,VERIFIED,https://example.org/a,2026-12-01,"fee £999, Coventry"
bad key,x,1,,,,ESTIMATE,,,
\`\`\`

COMPARABLES
\`\`\`
for,address,type,beds,m2,price,kind,date,days_on_market,price_cuts,source_url,confidence
P004,"1 Example Road, Town",detached,3,90,"£300,000",sold,2026-05-01,40,1,https://example.org/b,HIGH
NOWHERE,2 Elsewhere,flat,1,40,100000,sold,2026-01-01,,,,LOW
\`\`\`

EVIDENCE
\`\`\`
topic,claim,figure,source_url,source_date,label
Rates,"Average 2-year fix fell",5.5%,https://example.org/c,2026-12-01,VERIFIED
\`\`\`

VERDICT
Rent, then buy in 2028.
`;

test('blocks are found by name, fenced or not', () => {
  const b = blocks(reply);
  assert.ok(b.VARIABLES && b.COMPARABLES && b.EVIDENCE);
  assert.match(b.VERDICT, /Rent, then buy/);
});

test('quoted cells keep their commas; header annotations are dropped', () => {
  const rows = csv(blocks(reply).VARIABLES);
  assert.equal(rows[0].label, 'Best 2-year, 90%');
  assert.equal(rows[0].evidence, 'VERIFIED');
});

test('values become numbers where they are numbers', () => {
  assert.equal(jsonv('5.1%'), "'0.051'::jsonb");
  assert.equal(jsonv('£300,000'), "'300000'::jsonb");
  assert.equal(jsonv('2026-12'), `'"2026-12"'::jsonb`);
  assert.equal(jsonv('[1, 2]'), "'[1, 2]'::jsonb");
});

test('the SQL is one transaction, skips bad keys and unknown listings, and never overwrites a confirmed figure', () => {
  const { sql, counts } = toSql(reply, { household: '00000000-0000-0000-0000-000000000000', date: '2026-12-02' });
  assert.match(sql, /^-- Research ingest/);
  assert.match(sql, /\nbegin;\n/);
  assert.match(sql, /\ncommit;\n/);
  assert.equal(counts.variables, 1);
  assert.equal(counts.comparables, 1);
  assert.equal(counts.evidence, 2);
  assert.match(sql, /confidence <> 'confirmed'/);
  assert.match(sql, /Research differs from a confirmed figure/);
  assert.match(sql, /l\.code = 'L46'/);
  assert.doesNotMatch(sql, /Elsewhere/);
});

test('source dates become dates Postgres accepts', () => {
  assert.equal(asDate('2025', 'x'), '2025-01-01');
  assert.equal(asDate('2026-10', 'x'), '2026-10-01');
  assert.equal(asDate('2026-10-23', 'x'), '2026-10-23');
  assert.equal(asDate('2025-2026', '2026-11-04'), '2026-11-04');
});

test('an auction lot lands as a guide; a priceless row is skipped', () => {
  const { sql } = toSql('COMPARABLES\n```\nfor,address,price,kind,date\nP004,1 Lot Lane,200000,auction,2026-02\nP004,2 No Price,,sold,2026-01-01\n```\n', { household: 'h', date: '2026-11-04' });
  assert.match(sql, /'1 Lot Lane'.*'guide'/s);
  assert.doesNotMatch(sql, /2 No Price/);
});

test('villages load as one variable and an evidence line each; west roads map to their listings', () => {
  const { sql, counts } = toSql('VILLAGES\n```\nvillage,detached_median,source_url\nExampleton,350000,https://example.org/v\n```\nCOMPARABLES\n```\nfor,address,price,kind,date\nROAD_W2,1 Test Lane,400000,asking,2026-11-01\n```\n', { household: 'h', date: '2026-11-05' });
  assert.equal(counts.villages, 1);
  assert.match(sql, /area\.west_villages/);
  assert.match(sql, /Village: Exampleton/);
  assert.match(sql, /l\.code = 'L53'/);
});
