// More than one house in play: the switcher picks one, and nothing of one
// house may appear on another's pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseProperty, scopeTo, switchable, ACTIVE_ONLY_VIEWS } from '../../assets/js/core/property-choice.js';
import { isOfferHouse } from '../../assets/js/pages/forest/sections.js';

const houses = [
  { id: 'a', ref: 'P-001', status: 'archived' },
  { id: 'b', ref: 'P-003', status: 'active' },
  { id: 'c', ref: 'P-004', status: 'candidate' },
];

test('the archive is never offered, and an unknown or archived ref falls back to the active house', () => {
  assert.deepEqual(switchable(houses).map((p) => p.ref), ['P-003', 'P-004']);
  assert.equal(chooseProperty(houses, 'P-001').property.ref, 'P-003');
  assert.equal(chooseProperty(houses, 'nope').property.ref, 'P-003');
  assert.equal(chooseProperty(houses, null).isDefault, true);
  const c = chooseProperty(houses, 'P-004');
  assert.equal(c.property.ref, 'P-004');
  assert.equal(c.isDefault, false);
});

const data = {
  rooms: [{ key: 'k1', property_id: 'b' }, { key: 'k2', property_id: 'c' }, { key: 'old' }],
  items: [{ title: 'fv job', property_id: 'b' }, { title: 'p4 job', property_id: 'c' }, { title: 'mine', property_id: null }],
  cost_rollup: [{ key: 'x', property_id: 'b' }],
  house_facts: [], document_sections: [], bills: [{ name: 'phone', property_id: null }],
  ...Object.fromEntries(ACTIVE_ONLY_VIEWS.map((k) => [k, [{ k }]])),
};

test('a candidate sees only its own rows and the household\'s, never the active house\'s', () => {
  const out = scopeTo(data, chooseProperty(houses, 'P-004'), 'b');
  assert.deepEqual(out.rooms.map((r) => r.key), ['k2']);
  assert.deepEqual(out.items.map((i) => i.title), ['p4 job', 'mine']);
  assert.deepEqual(out.cost_rollup, []);
  for (const k of ACTIVE_ONLY_VIEWS) assert.deepEqual(out[k], [], k);
});

test('the active house keeps its rows, including ones written before rows carried an id', () => {
  const out = scopeTo(data, chooseProperty(houses, 'P-003'), 'b');
  assert.deepEqual(out.rooms.map((r) => r.key), ['k1', 'old']);
  assert.equal(out.cost_rollup.length, 1);
  for (const k of ACTIVE_ONLY_VIEWS) assert.equal(out[k].length, 1, k);
});

test('the offer figures show only on the house they were worked for', () => {
  const vars = [{ key: 'offer.property_ref', value: 'P-003' }];
  assert.equal(isOfferHouse(vars, { ref: 'P-003' }), true);
  assert.equal(isOfferHouse(vars, { ref: 'P-004' }), false);
  assert.equal(isOfferHouse([], { ref: 'P-004' }, false), false);
});

test('search mode: with no active house nothing is the default, and the active-only views stay empty', () => {
  const none = houses.map((p) => (p.status === 'active' ? { ...p, status: 'archived' } : p));
  assert.deepEqual(switchable(none).map((p) => p.ref), ['P-004']);
  assert.equal(chooseProperty(none, null).isDefault, false);
  const c = chooseProperty(none, 'P-004');
  assert.equal(c.property.ref, 'P-004');
  assert.equal(c.isDefault, false);
  const out = scopeTo(data, c, null);
  assert.deepEqual(out.rooms.map((r) => r.key), ['k2']);
  for (const k of ACTIVE_ONLY_VIEWS) assert.deepEqual(out[k], [], k);
  // A retired offer.property_ref is not loaded, so no house claims the offer.
  assert.equal(isOfferHouse([], c.property, c.isDefault), false);
});
