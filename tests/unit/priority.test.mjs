import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priorityScore, rank, explainInWords } from '../../assets/js/engine/priority.js';

test('the three axes multiply rather than add', () => {
  // If they added, a cosmetic job in the best room (5+1+1=7) would beat
  // a make-safe job in the worst (1+5+5=11 - no). Multiplying is what
  // makes a low score on ANY axis hold the item down.
  const cosmeticInBestRoom = priorityScore({ roomWeight: 5, themeWeight: 1, benefitWeight: 1 }).score;
  const safetyInWorstRoom = priorityScore({ roomWeight: 1, themeWeight: 5, benefitWeight: 5 }).score;
  assert.equal(cosmeticInBestRoom, 5);
  assert.equal(safetyInWorstRoom, 25);
  assert.ok(safetyInWorstRoom > cosmeticInBestRoom);
});

test('unblocking other work raises the score', () => {
  const alone = priorityScore({ roomWeight: 3, themeWeight: 3, benefitWeight: 3 }).score;
  const unblocks = priorityScore({ roomWeight: 3, themeWeight: 3, benefitWeight: 3, unblocks: 3 }).score;
  assert.equal(unblocks - alone, 15);
});

test('being blocked lowers the score but never removes the item', () => {
  const s = priorityScore({ roomWeight: 1, themeWeight: 1, benefitWeight: 1, blockedBy: 2 }).score;
  assert.ok(s >= 1, 'score floors at 1 so a blocked item stays on the list and keeps saving');
});

test('preservation work grows more urgent with age, up to a cap', () => {
  const fresh = priorityScore({ benefitType: 'preservation', ageMonths: 0 }).score;
  const old = priorityScore({ benefitType: 'preservation', ageMonths: 6 }).score;
  const ancient = priorityScore({ benefitType: 'preservation', ageMonths: 100 }).score;
  assert.ok(old > fresh);
  assert.equal(ancient - fresh, 25, 'decay pressure is capped at 25');
});

test('only preservation work decays', () => {
  const a = priorityScore({ benefitType: 'comfort', ageMonths: 100 }).score;
  const b = priorityScore({ benefitType: 'comfort', ageMonths: 0 }).score;
  assert.equal(a, b);
});

test('ranking is stable and one-based', () => {
  const ranked = rank([
    { id: 'b', roomWeight: 3, themeWeight: 3, benefitWeight: 3 },
    { id: 'a', roomWeight: 3, themeWeight: 3, benefitWeight: 3 },
    { id: 'c', roomWeight: 5, themeWeight: 5, benefitWeight: 5 },
  ]);
  assert.equal(ranked[0].id, 'c');
  assert.equal(ranked[0].priority, 1);
  // Equal scores break by id, so the order never wobbles between runs.
  assert.equal(ranked[1].id, 'a');
  assert.equal(ranked[2].id, 'b');
});

test('every score carries the arithmetic that produced it', () => {
  const { explain } = priorityScore({ roomWeight: 5, themeWeight: 4, benefitWeight: 3, unblocks: 1 });
  assert.equal(explain.base, 60);
  assert.equal(explain.unblocks_bonus, 5);
  assert.match(explainInWords(explain), /room 5\/5 x theme 4\/5 x benefit 3\/5 = 60/);
});

test('missing inputs fall back to neutral rather than throwing', () => {
  assert.equal(priorityScore({}).score, 27);
  assert.equal(priorityScore().score, 27);
});
