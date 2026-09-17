// floorplan.js - the building model read as a plan. Pure: data in,
// values out. No DOM, no fetch.
//
// THE GRID IS PRESENTATION, NOT A SECOND COORDINATE SYSTEM.
//
// Everything in this system is positioned in metres, because that is
// what a building is measured in and what the 3D model already uses. A
// grid reference like "D4" is COMPUTED from a metric point every time it
// is shown, and is never stored on a row. That is deliberate: a stored
// reference is a number that silently goes wrong the moment the cell
// size changes or the plan origin moves, and then two mechanisms
// describe one position.
//
// Because the reference is derived, the floor plan, the register and the
// 3D model cannot disagree about where the cooker is - they are all
// reading the same two numbers.
//
// Plan space: x runs left to right, y runs top (front) to bottom (back),
// both in metres from the plan origin. A room rect is [x1, y1, x2, y2] -
// opposite corners, NOT an origin and a size.

export const DEFAULT_CELL = 1.0;

/** Spreadsheet-style column letters, so a wide building does not run out
 *  of names at Z: 0 -> A, 25 -> Z, 26 -> AA. */
export function columnName(n) {
  if (!Number.isInteger(n) || n < 0) return '';
  let out = '';
  let i = n;
  for (;;) {
    out = String.fromCharCode(65 + (i % 26)) + out;
    i = Math.floor(i / 26) - 1;
    if (i < 0) break;
  }
  return out;
}

export function columnIndex(name) {
  if (!name) return -1;
  let n = 0;
  for (const ch of String(name).toUpperCase()) {
    const v = ch.charCodeAt(0) - 64;
    if (v < 1 || v > 26) return -1;
    n = n * 26 + v;
  }
  return n - 1;
}

const gridOf = (building) => ({
  cell: building?.grid?.cell || DEFAULT_CELL,
  originX: building?.grid?.originX ?? 0,
  originY: building?.grid?.originY ?? 0,
});

/** The grid cell a metric point falls in, as zero-based col/row. A point
 *  exactly on a cell boundary belongs to the cell it starts, so a
 *  reference is never ambiguous. */
export function cellOf(x, y, building) {
  if (x == null || y == null || Number.isNaN(Number(x)) || Number.isNaN(Number(y))) return null;
  const g = gridOf(building);
  return {
    col: Math.floor((Number(x) - g.originX) / g.cell),
    row: Math.floor((Number(y) - g.originY) / g.cell),
  };
}

/** The human-readable reference for a metric point: column letter plus
 *  one-based row, e.g. "D4". Null for an unplaced thing, which is the
 *  honest answer rather than a made-up square. */
export function gridRef(x, y, building) {
  const c = cellOf(x, y, building);
  if (!c || c.col < 0 || c.row < 0) return null;
  return `${columnName(c.col)}${c.row + 1}`;
}

/** The metric bounds of a reference, for drawing or for hit-testing.
 *  The inverse of gridRef, so the two can be tested against each other. */
export function refBounds(ref, building) {
  const m = /^([A-Z]+)(\d+)$/i.exec(String(ref ?? '').trim());
  if (!m) return null;
  const col = columnIndex(m[1]);
  const row = parseInt(m[2], 10) - 1;
  if (col < 0 || row < 0) return null;
  const g = gridOf(building);
  return {
    x1: g.originX + col * g.cell,
    y1: g.originY + row * g.cell,
    x2: g.originX + (col + 1) * g.cell,
    y2: g.originY + (row + 1) * g.cell,
  };
}

// --- The building ----------------------------------------------------

export const levels = (building) => building?.levels ?? [];
export const levelCode = (building, id) => levelById(building, id)?.code ?? '';

/** A reference qualified by its level, e.g. "G-A7". A bare square is
 *  ambiguous in any building with more than one floor - the kitchen
 *  stopcock and a first-floor air conditioner can sit in the same square
 *  on different levels - so anything that names a position to a person
 *  uses this, and only the plan itself, which is already showing one
 *  level, uses the bare form. */
export function qualifiedRef(ref, levelId, building) {
  if (!ref) return null;
  const code = levelCode(building, levelId);
  return code ? `${code}-${ref}` : ref;
}
export const levelById = (building, id) => levels(building).find((l) => l.id === id) ?? null;

export const roomsOn = (building, levelId) =>
  (building?.rooms ?? []).filter((r) => r.level === levelId);
export const wallsOn = (building, levelId) =>
  (building?.walls ?? []).filter((w) => w.level === levelId);
export const featuresOn = (building, levelId) =>
  (building?.features ?? []).filter((f) => f.level === levelId);
export const furnitureOn = (building, levelId) =>
  (building?.furniture ?? []).filter((f) => f.level === levelId);
export const stairsOn = (building, levelId) =>
  (building?.stairs ?? []).filter((s) => s.level === levelId || s.to === levelId
    || (building?.rooms ?? []).some((r) => r.id === s.to && r.level === levelId));

/** A room is one rectangle or, where the house is not that tidy, a union
 *  of them. A landing wrapping a stairwell and a master wrapping an
 *  en-suite are both genuinely L-shaped, and calling either a rectangle
 *  would overstate the floor by several square metres. `rect` stays as
 *  the bounding box so anything that only wants an extent is unaffected. */
export const roomRects = (room) => (room ? (room.rects ?? [room.rect]) : []);

/** What a wall is actually made of, in metres across. The plan and the
 *  3D model both draw the wall solid, and they must use this one number
 *  or the drawing and the model are of two different houses. */
export function wallThickness(wall, building) {
  if (wall?.thickness != null) return wall.thickness;
  const d = building?.defaults ?? {};
  if (wall?.kind === 'internal') return d.wallInternal ?? 0.1;
  if (wall?.kind === 'party') return d.wallParty ?? 0.3;
  return d.wallExternal ?? 0.23;
}

/** Openings belong to a wall, so a level's openings are whichever sit on
 *  that level's walls. Resolved here rather than by each renderer. */
export function openingsOn(building, levelId) {
  const ids = new Set(wallsOn(building, levelId).map((w) => w.id));
  return (building?.openings ?? []).filter((o) => ids.has(o.wall));
}

/** An opening is positioned ALONG its wall by the distance to its
 *  CENTRE, not to its near edge - so a 0.74m door recorded at 4.85 runs
 *  4.48 to 5.22. Getting this backwards shifts every window and door by
 *  half its own width, which looks almost right and is not.
 *
 *  Returns null for an orphan rather than drawing it at the origin. */
export function openingSegment(opening, building) {
  const wall = (building?.walls ?? []).find((w) => w.id === opening?.wall);
  if (!wall) return null;
  const [ax, ay] = wall.a;
  const [bx, by] = wall.b;
  const len = Math.hypot(bx - ax, by - ay);
  if (!len) return null;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const width = opening.width ?? 0;
  const start = Math.max(0, Math.min(len, (opening.at ?? 0) - width / 2));
  const end = Math.max(start, Math.min(len, (opening.at ?? 0) + width / 2));
  return {
    id: opening.id,
    type: opening.type,
    a: [ax + ux * start, ay + uy * start],
    b: [ax + ux * end, ay + uy * end],
    wall,
  };
}

/** The extent of one level, padded, so a renderer can size a viewBox
 *  without knowing anything about buildings. Walls are included AT THEIR
 *  FULL THICKNESS, because an external wall sits outside the rooms it
 *  encloses and half of it would otherwise fall off the edge. */
export function bounds(building, levelId, pad = 0.3) {
  const xs = [];
  const ys = [];
  for (const r of roomsOn(building, levelId)) {
    for (const q of roomRects(r)) { xs.push(q[0], q[2]); ys.push(q[1], q[3]); }
  }
  for (const w of wallsOn(building, levelId)) {
    const t = wallThickness(w, building) / 2;
    xs.push(w.a[0] - t, w.b[0] + t);
    ys.push(w.a[1] - t, w.b[1] + t);
  }
  // A porch sits outside every wall it belongs to, so a plan that sized
  // itself on the walls alone would cut it in half.
  for (const f of featuresOn(building, levelId)) {
    xs.push(f.rect[0], f.rect[2]);
    ys.push(f.rect[1], f.rect[3]);
  }
  if (!xs.length) return null;
  return {
    x1: Math.min(...xs) - pad,
    y1: Math.min(...ys) - pad,
    x2: Math.max(...xs) + pad,
    y2: Math.max(...ys) + pad,
  };
}

/** Which room contains a point. Rects are axis-aligned and may abut, so
 *  the upper edges are exclusive and a point on a shared wall resolves
 *  to exactly one room. */
export function roomAt(building, levelId, x, y) {
  if (x == null || y == null) return null;
  return roomsOn(building, levelId).find((r) => roomRects(r).some((q) =>
    x >= q[0] && x < q[2] && y >= q[1] && y < q[3])) ?? null;
}

/** What to CALL a room. The survey named these rooms; the household
 *  names them by their template key, and that is the vocabulary
 *  everywhere else in the system. Where a plan room maps to a template
 *  room, the household's word wins, so the plan and the register do not
 *  read as two different houses. */
export const roomLabel = (room, roomNameByKey) =>
  (room ? (roomNameByKey?.[room.roomKey] ?? room.name) : null);

export const roomByKey = (building, key) =>
  (building?.rooms ?? []).find((r) => r.roomKey === key) ?? null;

/** The centre of the LARGEST rectangle, not of the bounding box. On an
 *  L-shaped room the bounding box's centre can fall outside the room
 *  entirely, which is where the name would then be printed. */
export const roomCentre = (room) => {
  const rects = roomRects(room);
  if (!rects.length) return null;
  const big = largestRect(rects);
  return { x: (big[0] + big[2]) / 2, y: (big[1] + big[3]) / 2 };
};

export const largestRect = (rects) => rects.reduce((best, q) =>
  ((q[2] - q[0]) * (q[3] - q[1]) > (best[2] - best[0]) * (best[3] - best[1]) ? q : best));

export const roomArea = (room) => roomRects(room)
  .reduce((s, q) => s + Math.abs((q[2] - q[0]) * (q[3] - q[1])), 0);

// --- Placing things --------------------------------------------------

/**
 * Resolve one thing to a position on the plan.
 *
 * Three outcomes, and the difference between them matters:
 *   placed    it has real coordinates, so it has a grid reference
 *   inferred  it has no coordinates, but its room is on this plan, so it
 *             is shown at the room's centre and SAID to be approximate
 *   unplaced  neither, so it appears in the register with no reference
 *
 * An inferred position is never presented as a measured one. That is the
 * whole point of separating them.
 */
export function place(thing, building, { roomKeyOf = (t) => t.room_key } = {}) {
  const key = roomKeyOf(thing);
  const room = key ? roomByKey(building, key) : null;
  const hasXY = thing.plan_x_m != null && thing.plan_y_m != null;

  if (hasXY) {
    const x = Number(thing.plan_x_m);
    const y = Number(thing.plan_y_m);
    const at = roomAt(building, room?.level ?? levels(building)[0]?.id, x, y);
    const level = (at ?? room)?.level ?? levels(building)[0]?.id ?? null;
    const ref = gridRef(x, y, building);
    return {
      thing, state: 'placed', level, x, y, ref,
      fullRef: qualifiedRef(ref, level, building),
      room: at ?? room,
    };
  }
  if (room) {
    const c = roomCentre(room);
    const ref = gridRef(c.x, c.y, building);
    return {
      thing, state: 'inferred', level: room.level, x: c.x, y: c.y, ref,
      fullRef: qualifiedRef(ref, room.level, building), room,
    };
  }
  return {
    thing, state: 'unplaced', level: null, x: null, y: null,
    ref: null, fullRef: null, room: null,
  };
}

export const placeAll = (things, building, opts) =>
  (things ?? []).map((t) => place(t, building, opts));

export const placedOn = (placements, levelId) =>
  placements.filter((p) => p.level === levelId && p.x != null);

/** How far below a room's centre an inferred pin sits, and how far apart
 *  several of them are spaced. Both in metres, because everything here
 *  is. The drop clears the room name; the pitch stops two inferred pins
 *  in one room landing on top of each other. */
export const INFERRED_DROP = 0.78;
export const INFERRED_PITCH = 0.42;

/**
 * Fan inferred pins out inside their room.
 *
 * An inferred pin is drawn at the room's centre, which is exactly where
 * the room's name is and exactly where every other inferred pin in that
 * room would be. Neither is wrong about the position - the position is
 * "somewhere in this room" - but a pile of markers under a label reads
 * as broken. So they are laid out in a row below the centre, clamped
 * inside the room so a fan never escapes the wall it belongs to.
 *
 * PLACED pins are untouched: those are real coordinates and moving one
 * to make a drawing tidier would be a lie.
 */
export function spreadInferred(placements) {
  const byRoom = new Map();
  for (const p of placements) {
    if (p.state !== 'inferred' || !p.room) continue;
    if (!byRoom.has(p.room.id)) byRoom.set(p.room.id, []);
    byRoom.get(p.room.id).push(p);
  }
  const out = placements.map((p) => ({ ...p }));
  const index = new Map(out.map((p) => [p.thing, p]));
  for (const group of byRoom.values()) {
    const room = group[0].room;
    const cx = (room.rect[0] + room.rect[2]) / 2;
    const cy = (room.rect[1] + room.rect[3]) / 2;
    const span = (group.length - 1) * INFERRED_PITCH;
    group.forEach((p, i) => {
      const target = index.get(p.thing);
      const x = cx - span / 2 + i * INFERRED_PITCH;
      const y = cy + INFERRED_DROP;
      // Clamp inside the room, leaving the pin's own radius of margin,
      // so a wide fan in a narrow room stays where it belongs.
      target.x = Math.max(room.rect[0] + 0.22, Math.min(room.rect[2] - 0.22, x));
      target.y = Math.max(room.rect[1] + 0.22, Math.min(room.rect[3] - 0.22, y));
    });
  }
  return out;
}

/** Template rooms with no footprint in this building. Surfaced rather
 *  than hidden: an item in a room the plan does not have is not an
 *  error, and pretending otherwise would put it in the wrong square. */
export function roomsNotOnPlan(roomKeys, building) {
  const known = new Set((building?.rooms ?? []).map((r) => r.roomKey).filter(Boolean));
  return (roomKeys ?? []).filter((k) => !known.has(k));
}

// --- Grid axis -------------------------------------------------------

/** The column and row labels covering a bounds, for drawing the axis.
 *  Derived from the same origin and cell size as every reference, so a
 *  label can never disagree with the reference it sits above. */
export function axis(bnds, building) {
  if (!bnds) return { cols: [], rows: [] };
  const g = gridOf(building);
  const first = (v, o) => Math.floor((v - o) / g.cell);
  const last = (v, o) => Math.ceil((v - o) / g.cell);
  const cols = [];
  for (let c = first(bnds.x1, g.originX); c < last(bnds.x2, g.originX); c += 1) {
    if (c >= 0) cols.push({ index: c, label: columnName(c), x1: g.originX + c * g.cell, x2: g.originX + (c + 1) * g.cell });
  }
  const rows = [];
  for (let r = first(bnds.y1, g.originY); r < last(bnds.y2, g.originY); r += 1) {
    if (r >= 0) rows.push({ index: r, label: String(r + 1), y1: g.originY + r * g.cell, y2: g.originY + (r + 1) * g.cell });
  }
  return { cols, rows };
}
