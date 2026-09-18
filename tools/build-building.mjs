#!/usr/bin/env node
// build-building.mjs - turn a gridline spec into the building JSON the site
// and the tests read.
//
// WHY A GENERATOR AND NOT HAND-WRITTEN JSON.
//
// A building is a few hundred coordinates that all have to agree. Typing
// them by hand guarantees that one day a room's rectangle and the wall
// beside it will disagree by a centimetre, and nothing will catch it,
// because both numbers look plausible. So the spec names GRIDLINES - the
// centreline and thickness of every wall - and a room says which four
// lines bound it. The room's rectangle is then COMPUTED from the inner
// faces of those walls. A room cannot drift from its own walls, because
// it does not carry its own coordinates.
//
// This is how a real drawing is set out, and it is the same argument the
// grid reference makes elsewhere in this system: derive it, never store
// it twice.
//
// The generated JSON is committed, because the site is a zero-build
// static site and must not need node to render. The geometry gate
// re-runs this and fails if the committed output has drifted, so the two
// cannot disagree either.
//
//   node tools/build-building.mjs [--check]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const BUILDINGS = ['48-ameysford-road'];
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');

/** Metres, rounded to the millimetre. Every coordinate in the output
 *  goes through this, so no float noise ever reaches a drawing. */
const mm = (v) => Math.round(Number(v) * 1000) / 1000;

const faceLow = (line) => mm(line.at + line.t / 2);   // inner face, looking from low side
const faceHigh = (line) => mm(line.at - line.t / 2);  // inner face, looking from high side

/**
 * One wall per gridline per level.
 *
 * A wall runs along its own axis between the CENTRELINES of the two
 * lines that bound it, so the four external walls of a storey form a
 * closed loop of centrelines and the corners meet rather than leaving a
 * notch the 3D builder would have to guess at.
 */
function wallsFor(levelId, gridForLevel) {
  const out = [];
  for (const axis of ['x', 'y']) {
    const lines = gridForLevel[axis] ?? {};
    const cross = gridForLevel[axis === 'x' ? 'y' : 'x'] ?? {};
    // A MARK is a position with no wall on it. The extension removes the
    // rear wing's east wall but the north wall still has to know where
    // the original brickwork stops and the new work begins, and that
    // boundary is a position, not a wall. Naming it keeps the number in
    // one place instead of writing 5.655 into three segment spans.
    const marks = gridForLevel.marks ?? {};
    const where = (name) => (typeof name === 'number' ? name
      : (cross[name]?.at ?? marks[name]));
    for (const [id, line] of Object.entries(lines)) {
      for (const seg of (line.segments ?? [{ span: line.span }])) {
        const span = seg.span ?? line.span;
        const from = where(span[0]);
        const to = where(span[1]);
        if (from == null || to == null) {
          throw new Error(`${levelId}/${axis}/${id}: span ${JSON.stringify(span)} names a line that does not exist`);
        }
        out.push({
          id: `${levelId}-${axis}-${id}${seg.suffix ?? ''}`,
          level: levelId,
          line: id,
          axis,
          a: axis === 'x' ? [mm(line.at), mm(from)] : [mm(from), mm(line.at)],
          b: axis === 'x' ? [mm(line.at), mm(to)] : [mm(to), mm(line.at)],
          kind: seg.kind ?? line.kind,
          thickness: mm(seg.t ?? line.t),
          provenance: seg.provenance ?? line.provenance ?? 'existing',
          structural: seg.structural ?? line.structural ?? (line.kind === 'external'),
          removable: seg.removable ?? line.removable ?? (line.kind !== 'external'),
          ...(seg.note || line.note ? { note: seg.note ?? line.note } : {}),
        });
      }
    }
  }
  return out;
}

/**
 * A rectangle from the inner faces of four named gridlines.
 *
 * A bound may instead be a plain number, for the one case a gridline
 * cannot describe: where two parts of a compound room meet with no wall
 * between them, because the wall above them stops short. Naming a line
 * there would put its thickness into the middle of a room and leave a
 * slot the width of a wall that nobody could stand in.
 */
function rectFrom(grid, { w, e, n, s }, where) {
  const face = (bound, axis, side) => {
    if (typeof bound === 'number') return mm(bound);
    const line = grid[axis]?.[bound];
    if (!line) throw new Error(`${where}: bound ${side} names a gridline that does not exist`);
    return side === 'w' || side === 'n' ? faceLow(line) : faceHigh(line);
  };
  return [face(w, 'x', 'w'), face(n, 'y', 'n'), face(e, 'x', 'e'), face(s, 'y', 's')];
}

function roomsFor(levelId, grid, rooms) {
  return rooms.filter((r) => r.level === levelId).map((r) => {
    const where = `${levelId}/room ${r.id}`;
    // A compound room (an L round a stairwell or an en-suite) is a union
    // of rectangles. `rect` stays as the bounding box so anything that
    // only wants an extent keeps working.
    const rects = (r.rects ?? [r.bounds]).map((b, i) => rectFrom(grid, b, `${where}[${i}]`));
    const rect = rects.length === 1 ? rects[0] : [
      mm(Math.min(...rects.map((q) => q[0]))), mm(Math.min(...rects.map((q) => q[1]))),
      mm(Math.max(...rects.map((q) => q[2]))), mm(Math.max(...rects.map((q) => q[3]))),
    ];
    const area = mm(rects.reduce((s, q) => s + (q[2] - q[0]) * (q[3] - q[1]), 0));
    const out = {
      id: r.id, level: levelId, name: r.name, rect,
      ...(rects.length > 1 ? { rects } : {}),
      areaM2: Math.round(area * 100) / 100,
      ...(r.was ? { was: r.was } : {}),
      ...(r.roomKey ? { roomKey: r.roomKey } : {}),
      ...(r.roomType ? { roomType: r.roomType } : {}),
      ...(r.ceilingHeight ? { ceilingHeight: r.ceilingHeight } : {}),
      ...(r.note ? { note: r.note } : {}),
    };
    // The clear size a drawing would print: the largest rectangle's own
    // dimensions, not the bounding box of an L.
    const big = rects.reduce((best, q) =>
      ((q[2] - q[0]) * (q[3] - q[1]) > (best[2] - best[0]) * (best[3] - best[1]) ? q : best));
    out.clearSize = [mm(big[2] - big[0]), mm(big[3] - big[1])];
    return out;
  });
}

/**
 * Openings are authored by the coordinate they sit at, not by distance
 * along a wall, because a coordinate can be read straight off a drawing
 * and a distance-along cannot. The conversion happens here, once.
 */
function openingsFor(levelId, walls, openings) {
  return openings.filter((o) => o.level === levelId).map((o) => {
    const wallId = `${levelId}-${o.axis}-${o.line}${o.segment ?? ''}`;
    const wall = walls.find((w) => w.id === wallId);
    if (!wall) throw new Error(`opening ${o.id}: no wall ${wallId}`);
    // Distance from the wall's own start point to the opening's centre.
    const along = o.axis === 'x' ? o.y : o.x;
    const start = o.axis === 'x' ? wall.a[1] : wall.a[0];
    const at = mm(Math.abs(along - start));
    const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
    if (at - o.width / 2 < -0.001 || at + o.width / 2 > len + 0.001) {
      throw new Error(`opening ${o.id}: runs off wall ${wallId} (at ${at}, width ${o.width}, wall ${mm(len)})`);
    }
    return {
      id: o.id, wall: wallId, type: o.type, at, width: mm(o.width),
      ...(o.leaf ? { leaf: o.leaf } : {}),
      ...(o.swing ? { swing: o.swing } : {}),
      ...(o.sill != null ? { sill: o.sill } : {}),
      ...(o.head != null ? { head: o.head } : {}),
      ...(o.provenance ? { provenance: o.provenance } : {}),
      ...(o.note ? { note: o.note } : {}),
    };
  });
}

/** Ridge height from the pitch and the span, so it is computed and can
 *  be audited against what the drawing says rather than typed to match. */
function resolveRoof(r) {
  const [x1, y1, x2, y2] = r.over;
  const spanAcross = r.ridgeAxis === 'x' ? (y2 - y1) : (x2 - x1);
  const rise = (spanAcross / 2) * Math.tan((r.pitchDeg * Math.PI) / 180);
  return { ...r, over: r.over.map(mm), spanAcross: mm(spanAcross), ridgeHeight: mm(r.eavesHeight + rise) };
}

function buildStage(spec, stage) {
  const levels = stage.levels;
  const walls = [];
  const rooms = [];
  for (const level of levels) {
    const grid = stage.grid[level.id];
    if (!grid) throw new Error(`stage ${stage.id}: level ${level.id} has no grid`);
    walls.push(...wallsFor(level.id, grid));
    rooms.push(...roomsFor(level.id, grid, stage.rooms));
  }
  const openings = [];
  for (const level of levels) openings.push(...openingsFor(level.id, walls, stage.openings));

  return {
    id: stage.id,
    schemaVersion: 2,
    building: spec.building.id,
    name: stage.name,
    sequence: stage.sequence,
    status: stage.status,
    ...(stage.derivedFrom ? { derivedFrom: stage.derivedFrom } : {}),
    summary: stage.summary,
    changes: stage.changes ?? [],
    derivation: stage.derivation ?? [],
    levels,
    rooms,
    walls,
    openings,
    stairs: (stage.stairs ?? []).map((s) => ({
      ...s,
      footprint: s.footprint.map(mm),
      ...(s.upperVoid ? { upperVoid: s.upperVoid.map(mm) } : {}),
    })),
    roofs: (stage.roofs ?? []).map(resolveRoof),
    chimneys: (stage.chimneys ?? []).map((c) => ({ ...c, footprint: c.footprint.map(mm) })),
    features: (stage.features ?? []).map((f) => ({ ...f, rect: f.rect.map(mm) })),
    assumptions: stage.assumptions ?? [],
  };
}

function buildVariant(spec, variant) {
  return {
    id: variant.id,
    schemaVersion: 2,
    building: spec.building.id,
    stage: variant.stage,
    name: variant.name,
    ...(variant.derivedFrom ? { derivedFrom: variant.derivedFrom } : {}),
    summary: variant.summary,
    changes: variant.changes ?? [],
    furniture: (variant.furniture ?? []).map((f) => ({
      ...f,
      rect: f.rect.map(mm),
      height: mm(f.height ?? 0.75),
      confidence: f.confidence ?? 'drafted',
    })),
  };
}

const written = [];
function emit(path, value) {
  const text = `${JSON.stringify(value, null, 1)}\n`;
  mkdirSync(dirname(path), { recursive: true });
  written.push([path, text]);
  return text;
}

for (const id of BUILDINGS) {
  const dir = resolve(root, 'data/buildings', id);
  const spec = await import(new URL(`file://${dir}/spec.mjs`));
  const stages = spec.stages.map((s) => buildStage(spec, s));
  const variants = spec.variants.map((v) => buildVariant(spec, v));

  emit(`${dir}/building.json`, { ...spec.building, schemaVersion: 2 });
  for (const s of stages) emit(`${dir}/stages/${s.id}.json`, s);
  for (const v of variants) emit(`${dir}/variants/${v.id}.json`, v);
  emit(`${dir}/index.json`, {
    id: spec.building.id,
    schemaVersion: 2,
    name: spec.building.name,
    generatedBy: 'tools/build-building.mjs',
    defaultStage: spec.building.defaultStage,
    stages: stages.map((s) => ({
      id: s.id, name: s.name, sequence: s.sequence, status: s.status,
      derivedFrom: s.derivedFrom ?? null, summary: s.summary,
      file: `stages/${s.id}.json`,
      variants: variants.filter((v) => v.stage === s.id).map((v) => ({
        id: v.id, name: v.name, derivedFrom: v.derivedFrom ?? null,
        summary: v.summary, furnitureCount: v.furniture.length,
        file: `variants/${v.id}.json`,
      })),
    })),
  });
}

const check = process.argv.includes('--check');
let drift = 0;
for (const [path, text] of written) {
  if (check) {
    let current = null;
    try { current = readFileSync(path, 'utf8'); } catch { /* not there yet */ }
    if (current !== text) {
      console.error(`DRIFT ${path.replace(`${root}/`, '')} - re-run: node tools/build-building.mjs`);
      drift += 1;
    }
  } else {
    writeFileSync(path, text);
  }
}
if (check) {
  if (drift) process.exit(1);
  console.log(`Building JSON matches the spec (${written.length} files).`);
} else {
  console.log(`Wrote ${written.length} files from the spec.`);
}
