// The carry-over blob. These figures cross between two Supabase accounts
// that can never be open at once, so the file IS the transfer: if it is
// wrong, there is no second source to check against without switching
// accounts back. Everything here exists to make a bad file fail loudly
// before it reaches a database rather than quietly after.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMAT, GROUPS, isKnownGroup, canonical, checksum, validateBlob,
  toRows, dollarTag, loadSql, verifySql, newBatchId,
} from '../../tools/carry-lib.mjs';

const HOUSEHOLD = '8b1b26a8-6ac3-4707-adcf-a9976b830a65';

const row = (o = {}) => ({
  source_ref: 'r1', label: 'Council tax', amount: 148.5,
  cadence: 'monthly', raw: { id: 1, name: 'Council tax' }, ...o,
});
const blob = (groups = { ongoing_bills: [row()] }, extra = {}) => ({
  format: FORMAT,
  source_system: 'rec',
  captured_at: '2026-09-14T15:00:00Z',
  groups,
  ...extra,
});

// --- Canonical form and checksum -------------------------------------

test('canonical form does not depend on key order', () => {
  assert.equal(canonical({ b: 1, a: 2 }), canonical({ a: 2, b: 1 }));
  assert.equal(canonical({ x: { q: 1, p: 2 } }), canonical({ x: { p: 2, q: 1 } }));
});

test('canonical form DOES depend on array order, because order is data', () => {
  assert.notEqual(canonical([1, 2]), canonical([2, 1]));
});

test('two extracts of the same rows check out the same', () => {
  const a = { ongoing_bills: [row({ raw: { a: 1, b: 2 } })] };
  const b = { ongoing_bills: [row({ raw: { b: 2, a: 1 } })] };
  assert.equal(checksum(a), checksum(b));
});

test('changing a single figure changes the checksum', () => {
  assert.notEqual(
    checksum({ ongoing_bills: [row({ amount: 148.5 })] }),
    checksum({ ongoing_bills: [row({ amount: 148.6 })] }),
  );
});

test('a dropped row changes the checksum, so truncation is detectable', () => {
  assert.notEqual(
    checksum({ ongoing_bills: [row({ source_ref: 'a' }), row({ source_ref: 'b' })] }),
    checksum({ ongoing_bills: [row({ source_ref: 'a' })] }),
  );
});

test('null and undefined do not collapse into each other silently', () => {
  assert.equal(canonical(null), 'null');
  assert.equal(canonical(undefined), 'null');
  assert.equal(canonical(0), '0');
  assert.equal(canonical(''), '""');
});

// --- Validation ------------------------------------------------------

test('a well-formed blob validates and reports its counts', () => {
  const r = validateBlob(blob({
    ongoing_bills: [row({ source_ref: 'a' }), row({ source_ref: 'b' })],
    gift_cards: [row({ source_ref: 'g1' })],
  }));
  assert.ok(r.ok, r.errors.join('; '));
  assert.equal(r.total, 3);
  assert.deepEqual(r.counts, { ongoing_bills: 2, gift_cards: 1 });
  assert.match(r.checksum, /^sha256:[0-9a-f]{64}$/);
});

test('a checksum that disagrees with the contents is refused', () => {
  const b = blob();
  b.checksum = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
  const r = validateBlob(b);
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => /Checksum does not match/.test(e)),
    'a truncated or edited file must not load');
});

test('a correct checksum passes', () => {
  const groups = { ongoing_bills: [row()] };
  assert.ok(validateBlob(blob(groups, { checksum: checksum(groups) })).ok);
});

test('a missing checksum warns but does not block - it is still readable', () => {
  const r = validateBlob(blob());
  assert.ok(r.ok);
  assert.ok(r.warnings.some((w) => /no checksum/.test(w)));
});

test('the wrong format is refused rather than guessed at', () => {
  assert.ok(!validateBlob(blob({ ongoing_bills: [row()] }, { format: 'something/2' })).ok);
  const r = validateBlob({ ...blob(), format: undefined });
  assert.ok(r.errors.some((e) => /format must be/.test(e)));
});

test('provenance is required: a blob with no source or capture time is refused', () => {
  for (const field of ['source_system', 'captured_at']) {
    const b = blob();
    delete b[field];
    const r = validateBlob(b);
    assert.ok(!r.ok, `${field} should be required`);
    assert.ok(r.errors.some((e) => e.startsWith(field)));
  }
});

test('an unreadable capture time is refused', () => {
  assert.ok(!validateBlob(blob({ ongoing_bills: [row()] }, { captured_at: 'last Tuesday' })).ok);
});

test('an unknown group is refused rather than loaded somewhere arbitrary', () => {
  const r = validateBlob(blob({ crypto_wallets: [row()] }));
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => /Unknown group/.test(e)));
  assert.ok(!isKnownGroup('crypto_wallets'));
  assert.ok(isKnownGroup('ongoing_bills'));
});

test('every known group says what it becomes once reviewed', () => {
  for (const [g, why] of Object.entries(GROUPS)) {
    assert.ok(why && why.length > 10, `${g} needs to say what it turns into`);
  }
});

test('a row with no source_ref is refused, because a re-load would duplicate it', () => {
  const r = validateBlob(blob({ ongoing_bills: [row({ source_ref: undefined })] }));
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => /source_ref/.test(e)));
});

test('a repeated source_ref within a group is refused, not silently merged', () => {
  const r = validateBlob(blob({ ongoing_bills: [row({ source_ref: 'x' }), row({ source_ref: 'x' })] }));
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => /repeats source_ref/.test(e)),
    'two rows sharing a key collapse into one on load and the count still looks right');
});

test('the same source_ref in DIFFERENT groups is fine - they are different things', () => {
  assert.ok(validateBlob(blob({
    ongoing_bills: [row({ source_ref: '1' })],
    gift_cards: [row({ source_ref: '1' })],
  })).ok);
});

test('a row needs a label a person can recognise', () => {
  assert.ok(!validateBlob(blob({ ongoing_bills: [row({ label: '' })] })).ok);
});

test('an amount must be a finite number or genuinely absent', () => {
  assert.ok(validateBlob(blob({ ongoing_bills: [row({ amount: null })] })).ok,
    'null means "no amount", which is a real answer');
  assert.ok(!validateBlob(blob({ ongoing_bills: [row({ amount: '148.50' })] })).ok,
    'a string amount would load as text and never sum');
  assert.ok(!validateBlob(blob({ ongoing_bills: [row({ amount: Infinity })] })).ok);
  assert.ok(!validateBlob(blob({ ongoing_bills: [row({ amount: NaN })] })).ok);
});

test('raw must be the original row, not a string describing it', () => {
  assert.ok(!validateBlob(blob({ ongoing_bills: [row({ raw: 'id=1' })] })).ok);
  assert.ok(validateBlob(blob({ ongoing_bills: [row({ raw: undefined })] })).ok);
});

test('an empty file is refused - nothing to carry is not a successful carry', () => {
  assert.ok(!validateBlob(blob({})).ok);
  assert.ok(!validateBlob(blob({ ongoing_bills: [] })).ok);
});

test('an empty GROUP warns but does not block, when other groups have rows', () => {
  const r = validateBlob(blob({ ongoing_bills: [row()], gift_cards: [] }));
  assert.ok(r.ok);
  assert.ok(r.warnings.some((w) => /gift_cards.*empty/.test(w)));
});

test('rubbish in is reported, not thrown', () => {
  for (const bad of [null, 'a string', 42, []]) {
    const r = validateBlob(bad);
    assert.ok(!r.ok);
    assert.ok(r.errors.length);
  }
});

// --- Rows and SQL ----------------------------------------------------

test('rows flatten with their group and keep the original verbatim', () => {
  const rows = toRows(blob({
    ongoing_bills: [row({ source_ref: 'a' })],
    gift_cards: [row({ source_ref: 'g', amount: null, cadence: null })],
  }));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].source_group, 'ongoing_bills');
  assert.deepEqual(rows[0].raw, { id: 1, name: 'Council tax' });
  assert.equal(rows[1].amount, null);
  assert.deepEqual(rows[1].raw, { id: 1, name: 'Council tax' });
});

test('a missing raw becomes an empty object, never undefined in SQL', () => {
  assert.deepEqual(toRows(blob({ ongoing_bills: [row({ raw: undefined })] }))[0].raw, {});
});

test('the dollar tag is chosen so it cannot appear in the payload', () => {
  assert.equal(dollarTag('nothing special'), '$carry$');
  assert.equal(dollarTag('contains $carry$ already'), '$carry1$');
  const nasty = '$carry$ $carry1$ $carry2$';
  const tag = dollarTag(nasty);
  assert.ok(!nasty.includes(tag), 'the tag must not occur in the text it quotes');
});

test('the load statement carries the data as JSON, not as generated literals', () => {
  const sql = loadSql(blob(), HOUSEHOLD, 'batch-1');
  assert.match(sql, /jsonb_to_recordset/);
  assert.match(sql, /insert into public\.carried_finance/);
  assert.match(sql, /on conflict \(household_id, source_system, source_group, source_ref\)/);
  assert.match(sql, /do update set/);
});

test('a quote or a dollar sign in the data cannot break the statement', () => {
  const sql = loadSql(blob({
    ongoing_bills: [row({ label: "Sean's bill -- drop table; $$", raw: { note: "it's '';" } })],
  }), HOUSEHOLD, 'batch-1');
  // The payload rides inside one dollar-quoted literal, so there is
  // exactly one opening and one closing tag and nothing escapes it.
  const tag = sql.match(/\$carry\d*\$/g);
  assert.equal(tag.length, 2, 'exactly one dollar-quoted region');
  assert.equal(tag[0], tag[1]);
  const between = sql.slice(sql.indexOf(tag[0]) + tag[0].length, sql.lastIndexOf(tag[1]));
  assert.doesNotMatch(between, /\$carry\d*\$/);
  assert.deepEqual(JSON.parse(between)[0].label, "Sean's bill -- drop table; $$");
});

test('a re-load updates the figures but NEVER reopens a reviewed line', () => {
  const sql = loadSql(blob(), HOUSEHOLD, 'b1');
  for (const col of ['label', 'amount', 'cadence', 'raw', 'captured_at', 'batch_id']) {
    assert.match(sql, new RegExp(`${col}\\s*=\\s*excluded`), `${col} should refresh`);
  }
  for (const col of ['review_status', 'reviewed_at', 'superseded_note']) {
    assert.doesNotMatch(sql, new RegExp(`\\b${col}\\s*=\\s*excluded`),
      `${col} must not be overwritten: re-importing must not drag a line the owner has already `
      + 'dealt with back onto their list');
  }
});

test('everything lands unreviewed, so it drives nothing on arrival', () => {
  assert.match(loadSql(blob(), HOUSEHOLD, 'b1'), /'pending'/);
});

test('the load is tagged with its batch, so one import is reviewable as a unit', () => {
  const sql = loadSql(blob(), HOUSEHOLD, 'batch-xyz');
  assert.match(sql, /'batch-xyz'::uuid/);
  assert.match(sql, new RegExp(`'${HOUSEHOLD}'::uuid`));
});

test('the verification query reports counts to compare against the blob', () => {
  const sql = verifySql(blob({ ongoing_bills: [row()], gift_cards: [row({ source_ref: 'g' })] }), 'b1');
  assert.match(sql, /"ongoing_bills":1/);
  assert.match(sql, /"gift_cards":1/);
  assert.match(sql, /group by source_group/);
  assert.match(sql, /still_unreviewed/);
});

test('a batch id is a plausible uuid', () => {
  assert.match(newBatchId(), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.notEqual(newBatchId(), newBatchId());
});

// --- End to end ------------------------------------------------------

test('seal, validate, load: the round trip a real carry-over takes', () => {
  const groups = {
    ongoing_bills: [row({ source_ref: 'b1', label: 'Energy', amount: 92 })],
    shopping_list: [row({ source_ref: 's1', label: 'Lawn mower', amount: 260, cadence: null })],
    investments_history: [row({ source_ref: '2026-01', label: 'January', amount: 1200 })],
  };
  const sealed = blob(groups, { checksum: checksum(groups) });
  const r = validateBlob(sealed);
  assert.ok(r.ok, r.errors.join('; '));
  assert.equal(r.total, 3);

  const sql = loadSql(sealed, HOUSEHOLD, 'b1');
  const payload = JSON.parse(sql.slice(sql.indexOf('$carry$') + 7, sql.lastIndexOf('$carry$')));
  assert.equal(payload.length, 3);
  assert.deepEqual(payload.map((p) => p.source_group).sort(),
    ['investments_history', 'ongoing_bills', 'shopping_list']);
  assert.ok(payload.every((p) => p.source_ref && p.label));
});
