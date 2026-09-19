// building.js - stages, variants, and the difference between two of them.
//
// Pure: data in, values out. No DOM, no fetch.
//
// A BUILDING is the property. A STAGE is a structural state of it - the
// house as bought, the house after the extension - and owns levels,
// walls, openings, rooms, stairs, roof, chimneys and features. A VARIANT
// is a furniture arrangement belonging to one stage, and owns nothing
// structural. Every stage has an empty variant, so "no furniture" is a
// real thing you can inspect and fork rather than a rendering flag.
//
// composeBuilding() flattens the three into exactly the shape
// floorplan.js and model3d.js already take, so neither of them has to
// learn what a stage is.
//
// A FORK IS A COPY. A new stage or variant carries `derivedFrom` and a
// `changes` narrative, but its geometry is its own: there is no delta to
// merge and no merge to get wrong. The narrative is for people. The
// geometric difference is COMPUTED by stageDiff(), so the two can never
// drift - if someone writes "adds a bedroom" and the geometry does not,
// the diff says so.

import { roomArea, roomRects, wallThickness } from './floorplan.js';

/** One object carrying the property's identity, the stage's structure
 *  and the variant's furniture. */
export function composeBuilding(building, stage, variant) {
  if (!building || !stage) return null;
  return {
    id: `${building.id}/${stage.id}${variant ? `/${variant.id}` : ''}`,
    schemaVersion: 2,
    name: building.name,
    addressLine: building.addressLine,
    note: building.note,
    bought: building.bought,
    surveyed: building.surveyed,
    orientation: building.orientation,
    sources: building.sources ?? [],
    statedDimensions: building.statedDimensions ?? [],
    grid: building.grid,
    defaults: building.defaults,
    envelope: building.envelope,
    // The plot belongs to the SITE, so it is the same in every stage and
    // every variant: an extension changes the house, not the boundary.
    plot: building.plot ?? null,

    stage: {
      id: stage.id, name: stage.name, status: stage.status, sequence: stage.sequence,
      derivedFrom: stage.derivedFrom ?? null, summary: stage.summary,
      changes: stage.changes ?? [], derivation: stage.derivation ?? [],
    },
    variant: variant ? {
      id: variant.id, name: variant.name, derivedFrom: variant.derivedFrom ?? null,
      summary: variant.summary, changes: variant.changes ?? [],
    } : null,

    levels: stage.levels ?? [],
    rooms: stage.rooms ?? [],
    walls: stage.walls ?? [],
    openings: stage.openings ?? [],
    stairs: stage.stairs ?? [],
    roofs: stage.roofs ?? [],
    chimneys: stage.chimneys ?? [],
    features: stage.features ?? [],
    furniture: variant?.furniture ?? [],
    assumptions: stage.assumptions ?? [],
  };
}

// --- Measuring one stage ---------------------------------------------

export const wallLength = (w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);

/** The developed area of a roof: its footprint opened out along the
 *  slope. A hipped roof's four planes cover the same plan area as a
 *  gabled one, so the pitch alone converts between them. */
export const roofArea = (r) => {
  const plan = Math.abs((r.over[2] - r.over[0]) * (r.over[3] - r.over[1]));
  return plan / Math.cos(((r.pitchDeg ?? 35) * Math.PI) / 180);
};

/** Gross internal area: measured inside the external walls, per level,
 *  which is the convention every agent and every design study uses and
 *  therefore the only figure worth comparing one against. It COUNTS the
 *  internal partitions, which is why it is always larger than the sum of
 *  the rooms. */
export function grossInternalArea(stage, building) {
  const d = building?.defaults ?? {};
  const t = d.wallExternal ?? 0.23;
  const w = (building?.envelope?.widthM ?? 0) - 2 * t;
  const dep = (building?.envelope?.depthM ?? 0) - 2 * t;
  if (w <= 0 || dep <= 0) return null;
  // A level only counts the footprint it actually has, so the as-bought
  // L is not credited with the square it has not been built into yet.
  return (stage.levels ?? []).reduce((sum, level) => {
    const rooms = (stage.rooms ?? []).filter((r) => r.level === level.id);
    if (!rooms.length) return sum;
    const rects = rooms.flatMap(roomRects);
    const partitions = (stage.walls ?? [])
      .filter((x) => x.level === level.id && x.kind !== 'external')
      .reduce((s, x) => s + wallLength(x) * wallThickness(x, building), 0);
    return sum + rects.reduce((s, q) => s + (q[2] - q[0]) * (q[3] - q[1]), 0) + partitions;
  }, 0);
}

export const stageArea = (stage) => (stage.rooms ?? []).reduce((s, r) => s + roomArea(r), 0);

export const newExternalWallLength = (stage) => (stage.walls ?? [])
  .filter((w) => w.provenance === 'new' && w.kind === 'external')
  .reduce((s, w) => s + wallLength(w), 0);

/** New outer wall measured ON PLAN - counted once, not once per storey.
 *  A drawing that says "12m of new outer wall" means the line you would
 *  trace on the ground, and a two-storey house builds that line twice.
 *  Comparing the two-storey total against a plan figure is how a model
 *  ends up looking twice as expensive as it is. */
export function newExternalWallPlanLength(stage) {
  const seen = new Set();
  let total = 0;
  for (const w of (stage.walls ?? [])) {
    if (w.provenance !== 'new' || w.kind !== 'external') continue;
    const key = `${w.a.map((n) => n.toFixed(3))}|${w.b.map((n) => n.toFixed(3))}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += wallLength(w);
  }
  return total;
}

// --- The difference between two stages -------------------------------

const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

/**
 * Walls are matched by the LINE they sit on, not by id and not by their
 * exact endpoints.
 *
 * Two stages are written independently, so an id that happens to repeat
 * proves nothing. But matching on exact endpoints is just as wrong the
 * other way: shortening the rear wall to let the master through reads as
 * demolishing the whole wall and building a different one, which would
 * put twelve metres of masonry into a demolition figure that should say
 * three. So a wall is identified by its level, its axis and its
 * centreline coordinate, and a change of extent is reported as a change
 * of extent.
 */
const wallLine = (w) => {
  const axis = Math.abs(w.a[0] - w.b[0]) < 0.001 ? 'x' : 'y';
  const coord = axis === 'x' ? w.a[0] : w.a[1];
  return `${w.level}|${axis}|${coord.toFixed(3)}`;
};

const groupByLine = (walls) => {
  const out = new Map();
  for (const w of walls ?? []) {
    const k = wallLine(w);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(w);
  }
  return out;
};

const totalLength = (ws) => ws.reduce((s, w) => s + wallLength(w), 0);

/**
 * What the extension actually does, measured off the geometry.
 *
 * This is what lets the roadmap say a job turns one model into the
 * other, and what puts a real quantity behind it: 12 metres of new outer
 * wall is a number the model can defend, not one somebody remembered.
 * Everything it yields is derived from geometry that is itself only
 * researched, so it is `drafted` and may not price anything.
 */
export function stageDiff(from, to) {
  if (!from || !to) return null;
  const fromLines = groupByLine(from.walls);
  const toLines = groupByLine(to.walls);
  const wallsAdded = [...toLines].filter(([k]) => !fromLines.has(k)).flatMap(([, ws]) => ws);
  const wallsRemoved = [...fromLines].filter(([k]) => !toLines.has(k)).flatMap(([, ws]) => ws);
  const wallsShortened = [...toLines]
    .filter(([k]) => fromLines.has(k))
    .map(([k, ws]) => ({ line: k, wasM: round(totalLength(fromLines.get(k))), isM: round(totalLength(ws)) }))
    .filter((d) => Math.abs(d.wasM - d.isM) > 0.01);

  // A renamed room is not a new room. The design study calls the dining
  // room a snug and the second bedroom a master; recording what each one
  // WAS is the difference between "the extension adds five rooms" and
  // "the extension adds nine", and only one of those is true.
  const idOf = (r) => r.was ?? r.id;
  const fromRooms = new Map((from.rooms ?? []).map((r) => [idOf(r), r]));
  const toRooms = new Map((to.rooms ?? []).map((r) => [idOf(r), r]));
  const roomsAdded = [...toRooms.values()].filter((r) => !fromRooms.has(idOf(r)));
  const roomsRemoved = [...fromRooms.values()].filter((r) => !toRooms.has(idOf(r)));
  const roomsRenamed = [...toRooms.values()]
    .filter((r) => r.was && fromRooms.has(r.was))
    .map((r) => ({ from: fromRooms.get(r.was).name, to: r.name }));
  const roomsResized = [...toRooms.values()].filter((r) => {
    const was = fromRooms.get(idOf(r));
    return was && Math.abs(roomArea(was) - roomArea(r)) > 0.01;
  }).map((r) => ({ room: r, wasM2: round(roomArea(fromRooms.get(idOf(r)))), isM2: round(roomArea(r)) }));

  const fromOpenings = new Set((from.openings ?? []).map((o) => `${o.wall}|${o.at}`));
  const openingsAdded = (to.openings ?? []).filter((o) => !fromOpenings.has(`${o.wall}|${o.at}`));

  const fromRoofs = new Set((from.roofs ?? []).map((r) => r.id));
  const roofsAdded = (to.roofs ?? []).filter((r) => !fromRoofs.has(r.id));
  const roofsRemoved = (from.roofs ?? []).filter((r) => !(to.roofs ?? []).some((q) => q.id === r.id));

  return {
    from: from.id,
    to: to.id,
    wallsAdded,
    wallsRemoved,
    wallsShortened,
    roomsAdded,
    roomsRemoved,
    roomsRenamed,
    roomsResized,
    openingsAdded,
    roofsAdded,
    roofsRemoved,
    areaAddedM2: round(stageArea(to) - stageArea(from)),
    newExternalWallM: round(newExternalWallLength(to)),
    newExternalWallPlanM: round(newExternalWallPlanLength(to)),
    demolitionWallM: round(wallsRemoved.reduce((s, w) => s + wallLength(w), 0)
      + wallsShortened.reduce((s, d) => s + Math.max(0, d.wasM - d.isM), 0)),
    newRoofAreaM2: round(roofsAdded.reduce((s, r) => s + roofArea(r), 0)),
    roomsCreated: roomsAdded.length,
  };
}

/** What changed between two arrangements of the same shell. A fork is a
 *  copy, so this is how "and then do these things to it" gets written
 *  down as something checkable rather than remembered. */
export function variantDiff(from, to) {
  if (!from || !to) return null;
  const a = new Map((from.furniture ?? []).map((f) => [f.id, f]));
  const b = new Map((to.furniture ?? []).map((f) => [f.id, f]));
  const same = (p, q) => p.rect.every((v, i) => Math.abs(v - q.rect[i]) < 0.005)
    && (p.rotationDeg ?? 0) === (q.rotationDeg ?? 0);
  return {
    added: [...b.values()].filter((f) => !a.has(f.id)),
    removed: [...a.values()].filter((f) => !b.has(f.id)),
    moved: [...b.values()].filter((f) => a.has(f.id) && !same(a.get(f.id), f))
      .map((f) => ({ item: f, from: a.get(f.id).rect, to: f.rect })),
    unchanged: [...b.values()].filter((f) => a.has(f.id) && same(a.get(f.id), f)).length,
  };
}
