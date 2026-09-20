// A checklist is a work item read a different way. These pin the three
// things the parser understands and, more importantly, the two it must
// not confuse: a sentence in capitals is not a heading, and a line that
// is not a checkbox is not silently dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDetails, itemsOf, checklistFor, totalItems, tierOf, TIER_LABEL,
} from '../../assets/js/engine/checklist.js';

const row = (o = {}) => ({
  id: 'w1', title: 'A section', summary: 'why', status: 'ready',
  sort_order: 10, tags: ['viewing'], details: '', ...o,
});

test('checkbox lines become tickable items and gather into one list', () => {
  const blocks = parseDetails('- [ ] First\n- [ ] Second\n- [x] Already done');
  assert.equal(blocks.length, 1, 'consecutive boxes are one list, not three');
  assert.equal(blocks[0].kind, 'list');
  assert.deepEqual(blocks[0].items.map((i) => i.text),
    ['First', 'Second', 'Already done']);
  assert.deepEqual(blocks[0].items.map((i) => i.done), [false, false, true]);
});

test('an ALL-CAPS line is a heading; a sentence in capitals is not', () => {
  // The distinction that matters. Both of these appear verbatim in the
  // real viewing checklist and they must render differently.
  const blocks = parseDetails([
    'FLOORS - the expensive unknown',
    '- [ ] Bounce along the floor',
    'TICK EVERY ONE. A no on any line is a conversation with the broker.',
  ].join('\n'));

  assert.equal(blocks[0].kind, 'heading');
  assert.equal(blocks[0].text, 'FLOORS - the expensive unknown');
  assert.equal(blocks[1].kind, 'list');
  assert.equal(blocks[2].kind, 'note',
    'a capitalised SENTENCE ends in a full stop and is prose, not a heading');
});

test('a long capitalised line is prose however it is punctuated', () => {
  const long = 'IF THE HOUSE HAS BEEN EMPTY TWO YEARS OR MORE THEN RENOVATION '
    + 'THROUGH A REGISTERED CONTRACTOR MAY QUALIFY FOR FIVE PER CENT VAT';
  assert.equal(parseDetails(long)[0].kind, 'note',
    'a whole paragraph in capitals is still a paragraph');
});

test('a bare line is kept, not dropped', () => {
  // The failure that would lose content silently.
  const blocks = parseDetails('- [ ] One\nSome explanation here.\n- [ ] Two');
  assert.deepEqual(blocks.map((b) => b.kind), ['list', 'note', 'list']);
  assert.equal(blocks[1].text, 'Some explanation here.');
  assert.equal(blocks[0].items.length, 1);
  assert.equal(blocks[2].items.length, 1,
    'a note between two boxes splits the list rather than swallowing the second');
});

test('blank input and blank lines produce nothing rather than empty blocks', () => {
  assert.deepEqual(parseDetails(''), []);
  assert.deepEqual(parseDetails(null), []);
  assert.deepEqual(parseDetails('\n\n   \n'), []);
  assert.equal(itemsOf(null).length, 0);
});

test('a checklist reads in authored order, not priority order', () => {
  // A house is walked top to bottom. That has nothing to do with what
  // the priority engine thinks is most valuable, so sort_order wins.
  const items = [
    row({ id: 'c', title: 'Third', sort_order: 30, priority: 1 }),
    row({ id: 'a', title: 'First', sort_order: 10, priority: 99 }),
    row({ id: 'b', title: 'Second', sort_order: 20, priority: 50 }),
    row({ id: 'x', title: 'Other list', sort_order: 5, tags: ['shopping'] }),
    row({ id: 'd', title: 'Dropped', sort_order: 1, status: 'dropped' }),
  ];
  const sections = checklistFor(items, 'viewing');
  assert.deepEqual(sections.map((s) => s.title), ['First', 'Second', 'Third']);
});

test('sections carry their own item count and the total adds up', () => {
  const items = [
    row({ id: 'a', sort_order: 10, details: '- [ ] One\n- [ ] Two' }),
    row({ id: 'b', sort_order: 20, details: 'HEADING\n- [ ] Three' }),
  ];
  const sections = checklistFor(items, 'viewing');
  assert.deepEqual(sections.map((s) => s.count), [2, 1]);
  assert.equal(totalItems(sections), 3);
  assert.equal(totalItems([]), 0);
});

test('a tier tag says whether a line stops the purchase or just prices it', () => {
  assert.equal(tierOf({ tags: ['viewing', 'tier:financing'] }), 'financing');
  assert.equal(tierOf({ tags: ['viewing'] }), null);
  assert.equal(tierOf({}), null);
  // Every tier used by the real checklist has a label, or the page
  // would render a bare slug at somebody on a driveway.
  for (const t of ['financing', 'redflag', 'scope', 'measure', 'agent', 'offer']) {
    assert.ok(TIER_LABEL[t], `tier ${t} has no label`);
  }
});
