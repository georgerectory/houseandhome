// survey/clearance.js - how much room is left in the room.
//
// A floor plan that shows furniture without showing the space around it
// answers the wrong question. "Does the table fit" is easy and almost
// never the thing anyone actually wants to know; "can two people get
// past it to the back door" is the thing, and it is not answerable by
// looking at rectangles.
//
// So the room is sampled onto a 5cm grid, everything solid is marked -
// furniture, chimney breasts, fitted wardrobes, the arc a door sweeps -
// and then two questions are asked of what is left:
//
//   1. WIDTH. A distance transform gives, for every free point, how far
//      it is from the nearest obstruction. The largest value is the
//      biggest circle that fits in the room, which is what "is it
//      poky" actually means.
//
//   2. ROUTE. Erode the free space by half a walking width and flood
//      fill from one doorway. If another doorway is not reached, you
//      cannot walk between them at that width. Repeating it down a
//      ladder of widths gives the widest route the room actually has,
//      which is the number that decides whether a kitchen works.
//
// Sampled, not solved. A 5cm grid can be one cell optimistic at a
// pinch-point, so every figure it produces is reported to the nearest
// 5cm and never to the millimetre.

import {
  roomRects, roomsOn, wallThickness, featuresOn, furnitureOn, stairsOn,
} from '../floorplan.js';
import { openingProbe } from './integrity.js';

export const CELL = 0.05;

/** What has to fit through. A kitchen needs more than a landing because
 *  two people pass in it with the oven door open. */
export const WALKING_WIDTH = {
  // 0.9 is the walkway a single-cook kitchen wants between a run and an
  // island. 1.0 is the ideal and almost no real kitchen has it, so
  // demanding it would mark every honest layout as broken and teach
  // everyone to ignore the check.
  kitchen: 0.9,
  dining: 0.9,
  living: 0.75,
  bedroom: 0.75,
  bathroom: 0.7,
  wc: 0.6,
  hallway: 0.75,
  landing: 0.75,
  boot_room: 0.75,
  office: 0.75,
  default: 0.75,
};

const LADDER = [1.5, 1.35, 1.2, 1.05, 1.0, 0.9, 0.85, 0.8, 0.75, 0.7, 0.6, 0.5, 0.4];

const round5 = (v) => Math.round(v / CELL) * CELL;
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * The floor a door has to sweep, as a rectangle.
 *
 * A quarter-circle is the honest shape, but a rectangle of the leaf's
 * width by its own length is what a door actually stops you putting a
 * chest of drawers in, and it is the shape every architect draws the
 * clearance to. A sliding, pocket or cased opening sweeps nothing.
 */
export function swingRect(opening, building) {
  if (opening.type !== 'door') return null;
  // A sliding, pocket, bifold or cased opening sweeps nothing: it folds
  // flat, runs inside the wall, or has no leaf at all.
  if (['sliding', 'pocket', 'cased', 'opening', 'bifold'].includes(opening.leaf)) return null;
  const probe = openingProbe(opening, building);
  if (!probe) return null;
  const leaf = opening.leaf === 'double' ? opening.width / 2 : opening.width;
  const [cx, cy] = probe.centre;
  const half = opening.width / 2;
  const t = wallThickness(probe.wall, building) / 2;
  const horizontal = Math.abs(probe.wall.a[1] - probe.wall.b[1]) < 0.001;
  // Which way it opens is a COMPASS BEARING, not "in" or "out". Which
  // side of an internal wall counts as inside is a matter of opinion and
  // north is not, so the data says north and the drawing and the
  // clearance check read the same word.
  //
  // Swept both sides when the opening does not say: reserving space that
  // might not be needed is the safe way to be wrong.
  const toward = opening.swing?.toward;
  const lo = (horizontal ? toward === 'south' : toward === 'east') ? 0 : leaf;
  const hi = (horizontal ? toward === 'north' : toward === 'west') ? 0 : leaf;
  return horizontal
    ? [cx - half, cy - t - lo, cx + half, cy + t + hi]
    : [cx - t - lo, cy - half, cx + t + hi, cy + half];
}

/**
 * The strip of wall an opening cuts through, as a rectangle.
 *
 * A room joined to itself around a corner - an L-shaped landing wrapping
 * a stairwell, a master reaching past an en-suite - is two rectangles
 * with a wall between them and a doorway through it. Without carving the
 * doorway out, the grid sees two sealed halves and reports a room you
 * cannot cross, which is the opposite of true.
 */
function throughRects(room, building, levelId) {
  const out = [];
  for (const o of (building.openings ?? [])) {
    const probe = openingProbe(o, building);
    if (!probe || probe.wall.level !== levelId) continue;
    const inBoth = probe.sides.every((p) => roomRects(room)
      .some((q) => p[0] >= q[0] && p[0] <= q[2] && p[1] >= q[1] && p[1] <= q[3]));
    if (!inBoth) continue;
    const t = wallThickness(probe.wall, building) / 2 + 0.1;
    const half = o.width / 2;
    const horizontal = Math.abs(probe.wall.a[1] - probe.wall.b[1]) < 0.001;
    const [cx, cy] = probe.centre;
    out.push(horizontal
      ? [cx - half, cy - t, cx + half, cy + t]
      : [cx - t, cy - half, cx + t, cy + half]);
  }
  return out;
}

function gridFor(room, building, blockers, through = []) {
  const rects = roomRects(room);
  const x1 = Math.min(...rects.map((q) => q[0]));
  const y1 = Math.min(...rects.map((q) => q[1]));
  const x2 = Math.max(...rects.map((q) => q[2]));
  const y2 = Math.max(...rects.map((q) => q[3]));
  const cols = Math.max(1, Math.ceil((x2 - x1) / CELL));
  const rows = Math.max(1, Math.ceil((y2 - y1) / CELL));
  // 0 solid (outside the room, or something standing in it), 1 free.
  const free = new Uint8Array(cols * rows);
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const x = x1 + (c + 0.5) * CELL;
      const y = y1 + (r + 0.5) * CELL;
      const inside = rects.some((q) => x >= q[0] && x <= q[2] && y >= q[1] && y <= q[3])
        || through.some((q) => x >= q[0] && x <= q[2] && y >= q[1] && y <= q[3]);
      const blocked = inside && blockers.some((b) =>
        x >= b.rect[0] && x <= b.rect[2] && y >= b.rect[1] && y <= b.rect[3]);
      free[c * rows + r] = inside && !blocked ? 1 : 0;
    }
  }
  return { x1, y1, cols, rows, free, at: (x, y) => ({
    c: Math.floor((x - x1) / CELL), r: Math.floor((y - y1) / CELL),
  }) };
}

/** Two-pass chamfer: distance in metres from every free cell to the
 *  nearest solid one. Cheap, and accurate enough at 5cm. */
function distanceTransform(g) {
  const { cols, rows, free } = g;
  const D = new Float32Array(cols * rows);
  const BIG = 1e6;
  for (let i = 0; i < D.length; i += 1) D[i] = free[i] ? BIG : 0;
  const d1 = 1;
  const d2 = Math.SQRT2;
  const at = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows ? 0 : D[c * rows + r]);
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      if (!free[c * rows + r]) continue;
      D[c * rows + r] = Math.min(D[c * rows + r],
        at(c - 1, r) + d1, at(c, r - 1) + d1, at(c - 1, r - 1) + d2, at(c + 1, r - 1) + d2);
    }
  }
  for (let c = cols - 1; c >= 0; c -= 1) {
    for (let r = rows - 1; r >= 0; r -= 1) {
      if (!free[c * rows + r]) continue;
      D[c * rows + r] = Math.min(D[c * rows + r],
        at(c + 1, r) + d1, at(c, r + 1) + d1, at(c + 1, r + 1) + d2, at(c - 1, r + 1) + d2);
    }
  }
  for (let i = 0; i < D.length; i += 1) D[i] = D[i] >= BIG ? 0 : D[i] * CELL;
  return D;
}

/**
 * The nearest cell to a doorway with room enough to stand in.
 *
 * A doorway's own threshold is always pinched - it is a hole in a wall,
 * and the wall is solid on both sides of it - so seeding a flood fill
 * there would report every room as impassable. What matters is whether
 * you can get from just inside one door to just inside another, so each
 * door is seeded at the closest point that actually has the width, and a
 * door with no such point within a metre is itself the obstruction.
 */
function seedNear(g, D, door, need) {
  const { cols, rows } = g;
  const start = g.at(door.x, door.y);
  const limit = Math.ceil(1.0 / CELL);
  for (let ring = 0; ring <= limit; ring += 1) {
    for (let dc = -ring; dc <= ring; dc += 1) {
      for (let dr = -ring; dr <= ring; dr += 1) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
        const c = start.c + dc;
        const r = start.r + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        if (D[c * rows + r] >= need) return { c, r };
      }
    }
  }
  return null;
}

/** Can you get from the first doorway to all the others without turning
 *  sideways? Flood fill over cells with at least `width/2` of clearance. */
function connectsAt(g, D, doors, width) {
  const need = width / 2;
  const { cols, rows } = g;
  const passable = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && D[c * rows + r] >= need;
  const starts = doors.map((d) => seedNear(g, D, d, need)).filter(Boolean);
  if (starts.length < doors.length) return false;
  if (starts.length < 2) return true;
  const seen = new Uint8Array(cols * rows);
  const queue = [starts[0]];
  seen[starts[0].c * rows + starts[0].r] = 1;
  while (queue.length) {
    const { c, r } = queue.pop();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (!passable(nc, nr) || seen[nc * rows + nr]) continue;
      seen[nc * rows + nr] = 1;
      queue.push({ c: nc, r: nr });
    }
  }
  return starts.every(({ c, r }) => seen[c * rows + r]);
}

const facingRects = (item) => {
  const c = item.clearance;
  if (!c) return [];
  const [x1, y1, x2, y2] = item.rect;
  const face = item.facing ?? 's';
  const pick = (side) => c[side] ?? c.all;
  const out = [];
  const push = (d, rect) => { if (d > 0) out.push({ depth: d, rect }); };
  const map = { front: face, back: { n: 's', s: 'n', e: 'w', w: 'e' }[face] };
  for (const [name, dir] of Object.entries(map)) {
    const d = pick(name) ?? (c.all ?? 0);
    if (!d) continue;
    if (dir === 'n') push(d, [x1, y1 - d, x2, y1]);
    if (dir === 's') push(d, [x1, y2, x2, y2 + d]);
    if (dir === 'w') push(d, [x1 - d, y1, x1, y2]);
    if (dir === 'e') push(d, [x2, y1, x2 + d, y2]);
  }
  if (c.all && !c.front && !c.back) {
    const d = c.all;
    out.length = 0;
    push(d, [x1, y1 - d, x2, y1]);
    push(d, [x1, y2, x2, y2 + d]);
    push(d, [x1 - d, y1, x1, y2]);
    push(d, [x2, y1, x2 + d, y2]);
  }
  return out;
};

const overlaps = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0.02
  && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0.02;

/**
 * One level, room by room.
 *
 * Every number here is measured off the same rectangles the floor plan
 * draws and the 3D model extrudes, so if the report says a 0.9m route
 * the drawing shows a 0.9m route.
 */
export function clearanceReport(building, levelId) {
  // Only the doors on THIS level, or a door downstairs would be found
  // opening onto a wardrobe in the bedroom above it.
  const swings = (building.openings ?? [])
    .map((o) => ({
      opening: o,
      rect: swingRect(o, building),
      level: (building.walls ?? []).find((w) => w.id === o.wall)?.level,
    }))
    .filter((s) => s.rect && s.level === levelId);

  return roomsOn(building, levelId).map((room) => {
    const items = furnitureOn(building, levelId).filter((f) => f.room === room.id);
    const built = featuresOn(building, levelId)
      .filter((f) => f.room === room.id && f.kind !== 'porch');
    const doorways = (building.openings ?? []).map((o) => {
      const probe = openingProbe(o, building);
      if (!probe || probe.wall.level !== levelId) return null;
      const inside = probe.sides.find((s) => roomRects(room)
        .some((q) => s[0] >= q[0] && s[0] <= q[2] && s[1] >= q[1] && s[1] <= q[3]));
      return inside && o.type === 'door' ? { id: o.id, x: inside[0], y: inside[1] } : null;
    }).filter(Boolean);

    // A door swing blocks FURNITURE, not feet. Treating the arc as solid
    // would seal every doorway and report a house you cannot walk
    // through, so the swings are checked against what is standing in
    // them (below) rather than against the route.
    // A stair is furniture you cannot move: its flight takes the floor
    // downstairs and its void takes the floor upstairs, and a landing
    // measured as though you could stand on the stairwell would be a
    // metre wider than it is.
    const stairBlocks = stairsOn(building, levelId).map((st) => {
      const isLower = (building.rooms ?? []).some((r) => r.id === st.from && r.level === levelId);
      return {
        rect: isLower ? st.footprint : (st.upperVoid ?? st.footprint),
        what: isLower ? 'the stair' : 'the stairwell',
        room: isLower ? st.from : st.to,
      };
    }).filter((s) => s.room === room.id);

    const blockers = [
      ...items.map((f) => ({ rect: f.rect, what: f.name })),
      ...built.map((f) => ({ rect: f.rect, what: f.kind.replace(/_/g, ' ') })),
      ...stairBlocks,
    ];

    const g = gridFor(room, building, blockers, throughRects(room, building, levelId));
    const D = distanceTransform(g);
    let widest = 0;
    let freeCells = 0;
    for (let i = 0; i < D.length; i += 1) {
      if (g.free[i]) freeCells += 1;
      if (D[i] > widest) widest = D[i];
    }
    const route = doorways.length
      ? (LADDER.find((w) => connectsAt(g, D, doorways, w)) ?? 0) : null;
    const need = WALKING_WIDTH[room.roomType] ?? WALKING_WIDTH.default;

    // What is standing in what. A door that opens onto a wardrobe is the
    // single most common thing a plan gets wrong and a model catches.
    const clashes = [];
    // And only the doors that actually reach into this room.
    const mine = swings.filter((s) => roomRects(room).some((q) => overlaps(s.rect, q)));
    for (const s of mine) {
      for (const f of items) {
        if (f.fixed !== false && overlaps(s.rect, f.rect)) {
          clashes.push({ kind: 'swing', message: `${s.opening.id} opens onto ${f.name}` });
        }
      }
    }
    for (const f of items) {
      for (const zone of facingRects(f)) {
        for (const other of items) {
          if (other === f) continue;
          // A chair belongs in the space its table needs kept clear, and
          // a stool belongs at the island. Saying so is how the check
          // tells a chair pulled up to a table from a chest of drawers
          // dumped in the walkway.
          if (other.belongsTo === f.id || f.belongsTo === other.id) continue;
          if (overlaps(zone.rect, other.rect)) {
            clashes.push({
              kind: 'clearance',
              message: `${other.name} is inside the ${zone.depth}m ${f.name} needs kept clear`,
            });
          }
        }
        const outside = !roomRects(room).some((q) =>
          zone.rect[0] >= q[0] - 0.02 && zone.rect[1] >= q[1] - 0.02
          && zone.rect[2] <= q[2] + 0.02 && zone.rect[3] <= q[3] + 0.02);
        if (outside) {
          clashes.push({
            kind: 'clearance',
            message: `${f.name} needs ${zone.depth}m clear and the wall is closer than that`,
          });
        }
      }
    }

    return {
      room: room.id,
      name: room.name,
      roomType: room.roomType,
      freeAreaM2: r2(freeCells * CELL * CELL),
      widestCircleM: r2(round5(widest * 2)),
      routeWidthM: route == null ? null : r2(route),
      requiredWidthM: need,
      doorways: doorways.length,
      furniture: items.length,
      status: route == null ? 'no-doors'
        : route >= need ? 'ok'
          : route >= need - 0.15 ? 'tight' : 'blocked',
      clashes,
    };
  });
}
