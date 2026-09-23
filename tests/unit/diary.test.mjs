// The dates, tidied for reading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upcoming, whenLabel } from '../../assets/js/engine/diary.js';

const row = (o) => ({ source: 'milestone', on_date: '2026-09-26', days_until: 3,
  title: 'T', description: null, location: null, open_items: 0, ...o });

test('what has passed is dropped, and the soonest comes first', () => {
  const out = upcoming([
    row({ days_until: 40, on_date: '2026-11-02' }),
    row({ days_until: -2, on_date: '2026-09-21' }),
    row({ days_until: 3 }),
  ]);
  assert.deepEqual(out.map((r) => r.days_until), [3, 40]);
});

test('one day is one row: the event wins, the milestone lends its workload', () => {
  // The open house is both a date the plan must hit and a date the agent
  // set. Showing it twice on a dashboard is how a countdown loses trust.
  const out = upcoming([
    row({ source: 'milestone', open_items: 6, description: 'From the plan' }),
    row({ source: 'event', location: '48 Ameysford Road', description: 'Bring a torch' }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].source, 'event', 'the event knows the time and the address');
  assert.equal(out[0].location, '48 Ameysford Road');
  assert.equal(out[0].open_items, 6, "and the milestone's pinned work is not lost");
});

test('a milestone alone keeps its own detail', () => {
  const out = upcoming([row({ open_items: 2, description: 'The gate' })]);
  assert.equal(out[0].description, 'The gate');
  assert.equal(out[0].open_items, 2);
});

test('withinDays clips the horizon', () => {
  const out = upcoming([row({ days_until: 3 }), row({ days_until: 475, on_date: '2028-01-11' })],
    { withinDays: 30 });
  assert.equal(out.length, 1);
});

test('days become English, and the units change as they get further off', () => {
  assert.equal(whenLabel(0), 'today');
  assert.equal(whenLabel(1), 'tomorrow');
  assert.equal(whenLabel(3), 'in 3 days');
  assert.equal(whenLabel(21), 'in 3 weeks');
  assert.equal(whenLabel(103), 'in 3 months');
  assert.equal(whenLabel(1200), 'in 3.3 years');
  assert.equal(whenLabel(null), 'no date');
  assert.equal(whenLabel(-1), 'passed');
});
