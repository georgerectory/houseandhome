// format.js - the shared formatters, and the one security boundary.
//
// WHY THIS FILE EXISTS. `escape()` is the only thing standing between a
// database value and `innerHTML`. Fourteen modules import it, every page
// interpolates user-controlled text through it, and it had no test at
// all - so a regression that silently stopped escaping would have
// shipped green. Everything else here is cheap to pin and pins itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  escape, money, preciseMoney, titleCase, isTrusted, TRUSTED,
} from '../../assets/js/core/format.js';

test('escape neutralises every character that can break out of markup', () => {
  // The five that matter, each on its own, so a partial regression is
  // caught rather than averaged away.
  assert.equal(escape('&'), '&amp;');
  assert.equal(escape('<'), '&lt;');
  assert.equal(escape('>'), '&gt;');
  assert.equal(escape('"'), '&quot;');
  assert.equal(escape("'"), '&#39;');
});

test('escape defeats the attacks it exists to stop', () => {
  // A script tag in a work item title.
  assert.equal(
    escape('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;');

  // Breaking out of an attribute, which is the one a naive escaper that
  // only handles < and > lets straight through.
  assert.equal(
    escape('" onerror="alert(1)'),
    '&quot; onerror=&quot;alert(1)');
  assert.equal(
    escape("' onclick='alert(1)"),
    '&#39; onclick=&#39;alert(1)');

  // An img with an inline handler, whole.
  assert.equal(
    escape('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;');

  // Nothing in the output can still open a tag or close an attribute.
  for (const nasty of [
    '<svg/onload=alert(1)>',
    '</textarea><script>x</script>',
    'javascript:alert(1)',
    '<a href="#" onmouseover="x">link</a>',
  ]) {
    const out = escape(nasty);
    assert.ok(!out.includes('<'), `${nasty} left a < in the output`);
    assert.ok(!out.includes('>'), `${nasty} left a > in the output`);
    assert.ok(!out.includes('"'), `${nasty} left a " in the output`);
    assert.ok(!out.includes("'"), `${nasty} left a ' in the output`);
  }
});

test('escape does not double-escape, and survives null', () => {
  // & is escaped once. Escaping twice would turn &amp; into &amp;amp;
  // and corrupt every apostrophe on the site.
  assert.equal(escape('a & b'), 'a &amp; b');
  assert.equal(escape(escape('&')), '&amp;amp;',
    'escape is not idempotent by design - callers must escape exactly once');

  // Every caller interpolates possibly-absent database values.
  assert.equal(escape(null), '');
  assert.equal(escape(undefined), '');
  assert.equal(escape(0), '0');
  assert.equal(escape(false), 'false');
});

test('escape leaves ordinary text completely alone', () => {
  // If it mangled normal prose the whole site would read wrong, and
  // that is the failure nobody would attribute to the escaper.
  const plain = 'Strip every internal face back to the brick - 241 m2, 4 skips.';
  assert.equal(escape(plain), plain);
  assert.equal(escape('Reclaimed 9 x 4 3/8 x 2 5/8in imperial red'),
    'Reclaimed 9 x 4 3/8 x 2 5/8in imperial red');
});

test('every page that renders database text imports escape', () => {
  // The boundary only holds where it is actually reached. A structural
  // check, not a behavioural one: it catches a NEW page that builds a
  // template literal out of row data and forgets.
  //
  // Not shell.js - it interpolates only its own hard-coded nav and two
  // integers, and puts the username through setAttribute, which does
  // not parse markup. The risk is in pages/, which render titles,
  // summaries and room names straight from the database.
  const pages = ['index', 'roadmap', 'backlog', 'money', 'shopping', 'handbook'];
  for (const p of pages) {
    const src = readFileSync(`assets/js/pages/${p}.js`, 'utf8');
    assert.match(src, /import \{[^}]*\bescape\b[^}]*\} from ['"]\.\.\/core\/format\.js['"]/s,
      `pages/${p}.js renders row data and must import escape from core/format.js`);
  }
});

test('money and preciseMoney round the way the ledger does', () => {
  assert.equal(money(0), '£0');
  assert.equal(money(1234.56), '£1,235');
  assert.equal(money(null), '—');
  assert.equal(money(undefined), '—');

  // The allocation settles in integer micro-pounds and every open item
  // gets a non-zero share, so a share smaller than a penny is a real
  // number that must not render as "£0.00" - it would read as "this
  // item got nothing", which is the opposite of the guarantee.
  assert.equal(preciseMoney(0), '£0.00');
  assert.equal(preciseMoney(0.004), '0.40p');
  assert.match(preciseMoney(0.0001), /p$/, 'a sub-penny share renders in pence, not pounds');
  assert.equal(preciseMoney(1234.56), '£1,234.56');
  assert.notEqual(preciseMoney(1234.56), money(1234.56),
    'the precise form must keep the pence the rounded form drops');
});

test('the trusted set is confirmed and actual, and nothing else', () => {
  // The whole confidence model rests on this one membership test.
  for (const yes of ['confirmed', 'actual']) {
    assert.ok(TRUSTED.has(yes), `${yes} must be trusted`);
    assert.ok(isTrusted(yes));
  }
  for (const no of ['drafted', 'researched', 'carried_over', 'quoted', '', null]) {
    assert.ok(!TRUSTED.has(no), `${no} must NOT be trusted`);
    assert.ok(!isTrusted(no));
  }
  assert.equal(TRUSTED.size, 2, 'a third trusted state would change every total on the site');
});

test('titleCase turns a database key into a label', () => {
  assert.equal(titleCase('make_dry'), 'Make Dry');
  assert.equal(titleCase('before_purchase'), 'Before Purchase');
  assert.equal(titleCase(null), '');
});
