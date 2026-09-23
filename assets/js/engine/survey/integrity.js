// survey/integrity.js - is the geometry a building?
//
// Every check here asks something a person would ask standing in front
// of a drawing, and answers it in a way a test runner can fail on:
// do the rooms overlap, does the shell close, does that door fit the
// wall it is in, is there anything holding the first floor up, does the
// stair reach the landing, is the wardrobe inside the room.
//
// An ERROR is geometry that cannot be built. A WARNING is geometry that
// can be built and probably should not, or a thing the model has no way
// to know. Nothing here is fatal to the page: the Survey view shows the
// failures, because a drawing with a known fault is worth more than no
// drawing.

import {
  roomsOn, wallsOn, roomRects, wallThickness, roomArea, levels, roomAt,
} from '../floorplan.js';

const EPS = 0.005;
const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

const overlapArea = (a, b) => {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > EPS && h > EPS ? w * h : 0;
};

const within = (rect, outer, tol = EPS) => rect[0] >= outer[0] - tol && rect[1] >= outer[1] - tol
  && rect[2] <= outer[2] + tol && rect[3] <= outer[3] + tol;

/** Is this rectangle inside the UNION of those rectangles? Whole first,
 *  because that is the common case and it is exact; sampled only when it
 *  straddles a join, which is the only case a union can answer and a
 *  single rectangle cannot. */
function containedBy(rect, rects, tol = 0.02) {
  if (rects.some((q) => within(rect, q, tol))) return true;
  const step = 0.05;
  for (let x = rect[0] + tol; x <= rect[2] - tol; x += step) {
    for (let y = rect[1] + tol; y <= rect[3] - tol; y += step) {
      if (!rects.some((q) => x >= q[0] - tol && x <= q[2] + tol
        && y >= q[1] - tol && y <= q[3] + tol)) return false;
    }
  }
  return true;
}

/** The shortest distance from a point to a wall's centreline segment.
 *  Used to ask whether two walls actually meet or merely look as though
 *  they do. */
function distToSegment([px, py], w) {
  const [ax, ay] = w.a;
  const [bx, by] = w.b;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

const wallVector = (w) => {
  const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  return len ? [(w.b[0] - w.a[0]) / len, (w.b[1] - w.a[1]) / len, len] : [0, 0, 0];
};

/** Where an opening actually is, as a point, plus the two points just
 *  inside the rooms on either side of it. */
export function openingProbe(opening, building) {
  const wall = (building.walls ?? []).find((w) => w.id === opening.wall);
  if (!wall) return null;
  const [ux, uy, len] = wallVector(wall);
  if (!len) return null;
  const cx = wall.a[0] + ux * opening.at;
  const cy = wall.a[1] + uy * opening.at;
  const off = wallThickness(wall, building) / 2 + 0.08;
  return {
    wall,
    centre: [cx, cy],
    sides: [[cx - uy * off, cy + ux * off], [cx + uy * off, cy - ux * off]],
  };
}

export function auditIntegrity(building, opts = {}) {
  const out = [];
  const add = (severity, id, message, extra = {}) => out.push({ severity, id, message, ...extra });
  const env = building.envelope
    ? [0, 0, building.envelope.widthM, building.envelope.depthM] : null;

  // --- Per level -----------------------------------------------------
  const ordered = [...levels(building)].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));
  for (const [index, level] of ordered.entries()) {
    const rooms = roomsOn(building, level.id);
    const walls = wallsOn(building, level.id);

    // Rooms that overlap are two rooms claiming one floor. Compound
    // rooms are compared rectangle by rectangle, because an L-shaped
    // room's bounding box legitimately overlaps its neighbour.
    for (let i = 0; i < rooms.length; i += 1) {
      for (let j = i + 1; j < rooms.length; j += 1) {
        let worst = 0;
        for (const p of roomRects(rooms[i])) {
          for (const q of roomRects(rooms[j])) worst = Math.max(worst, overlapArea(p, q));
        }
        if (worst > 0.01) {
          add('error', 'room-overlap',
            `${rooms[i].name} and ${rooms[j].name} overlap by ${round(worst)} m2`,
            { level: level.id });
        }
      }
      if (env) {
        for (const q of roomRects(rooms[i])) {
          if (!within(q, env, 0.02)) {
            add('error', 'room-outside-envelope',
              `${rooms[i].name} extends outside the ${env[2]} x ${env[3]}m envelope`,
              { level: level.id });
            break;
          }
        }
      }
      if (roomArea(rooms[i]) < 0.5) {
        add('warning', 'room-tiny', `${rooms[i].name} is only ${round(roomArea(rooms[i]))} m2`,
          { level: level.id });
      }
    }

    // A dangling wall end means the shell does not close, and a shell
    // that does not close is a house with a gap in it that every
    // renderer will happily draw as if it were fine.
    for (const w of walls) {
      for (const end of [w.a, w.b]) {
        const meets = walls.some((o) => o !== w && distToSegment(end, o) < 0.06);
        if (!meets) {
          add('error', 'shell-open',
            `Wall ${w.id} has a free end at ${end.map((n) => round(n)).join(', ')}`,
            { level: level.id });
        }
      }
    }

    // The first floor has to stand on something. Sampled rather than
    // solved, because "mostly supported" is the honest answer for a room
    // that oversails a wall by a few centimetres.
    const below = ordered[index - 1];
    if (below) {
      const lowerRects = roomsOn(building, below.id).flatMap(roomRects);
      const lowerWalls = wallsOn(building, below.id);
      for (const room of rooms) {
        let sampled = 0;
        let unsupported = 0;
        for (const q of roomRects(room)) {
          for (let x = q[0] + 0.05; x < q[2]; x += 0.15) {
            for (let y = q[1] + 0.05; y < q[3]; y += 0.15) {
              sampled += 1;
              const onRoom = lowerRects.some((r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]);
              const onWall = !onRoom && lowerWalls.some((o) =>
                distToSegment([x, y], o) <= wallThickness(o, building) / 2 + 0.02);
              if (!onRoom && !onWall) unsupported += 1;
            }
          }
        }
        const pct = sampled ? unsupported / sampled : 0;
        if (pct > 0.02) {
          add(pct > 0.15 ? 'error' : 'warning', 'level-unsupported',
            `${room.name} oversails ${Math.round(pct * 100)}% of its floor with nothing under it`,
            { level: level.id });
        }
      }
    }

    // A room nobody can get into. Worth a warning rather than an error,
    // because a plant room reached through a hatch is a real thing.
    for (const room of rooms) {
      const served = (building.openings ?? []).some((o) => {
        const probe = openingProbe(o, building);
        if (!probe || probe.wall.level !== level.id) return false;
        return probe.sides.some((s) => roomAt(building, level.id, s[0], s[1])?.id === room.id);
      });
      if (!served) {
        add('warning', 'room-unreachable', `${room.name} has no door or opening onto it`,
          { level: level.id });
      }
    }

    if (opts.roomKeys) {
      for (const room of rooms) {
        if (room.roomKey && !opts.roomKeys.includes(room.roomKey)) {
          add('warning', 'roomkey-unknown',
            `${room.name} claims room key "${room.roomKey}", which is not in the household's taxonomy`,
            { level: level.id });
        }
      }
    }
  }

  // --- Openings ------------------------------------------------------
  for (const o of (building.openings ?? [])) {
    const wall = (building.walls ?? []).find((w) => w.id === o.wall);
    if (!wall) {
      add('error', 'orphan-opening', `Opening ${o.id} names wall ${o.wall}, which does not exist`);
      continue;
    }
    const [, , len] = wallVector(wall);
    if (o.at - o.width / 2 < -EPS || o.at + o.width / 2 > len + EPS) {
      add('error', 'opening-off-wall',
        `${o.id} runs off the end of ${wall.id} (${round(o.at)} +/- ${round(o.width / 2)} on a ${round(len)}m wall)`,
        { level: wall.level });
    }
    // A leaf's CLEAR width is narrower than the structural opening: the
    // frame takes about 20mm a side and the open leaf eats another 10.
    // 0.75m is what Part M looks for in new work, and it is also about
    // the width a wardrobe carcass or a mattress needs to turn through.
    if (o.type === 'door' && o.leaf !== 'cased' && o.leaf !== 'double' && o.width > 0) {
      const clear = o.width - 0.05;
      if (clear < 0.68) {
        add('warning', 'door-narrow',
          `${o.id} is ${round(o.width)}m, about ${round(clear)}m clear: under the 0.75m Part M looks for, and tight for a wardrobe or a mattress`,
          { level: wall.level });
      }
    }
    // IS THE DOORWAY ITSELF BLOCKED?
    //
    // Different question from the clearance check, which asks whether
    // you can get from one doorway to another. This asks whether a
    // fitting is standing IN the opening - a washer across a doorway
    // still leaves the room reachable round the other side, so
    // reachability never notices it, and it is exactly the sort of thing
    // a plan drawn at small scale hides.
    if (o.type === 'door' && o.width > 0) {
      const half = o.width / 2;
      // The threshold, plus 100mm into each room: a unit hard against
      // the opening is in the way even if it technically stops at the
      // wall face.
      const reach = wall.thickness / 2 + 0.1;
      const band = wall.axis === 'x'
        ? [wall.a[0] - reach, wall.a[1] + o.at - half, wall.a[0] + reach, wall.a[1] + o.at + half]
        : [wall.a[0] + o.at - half, wall.a[1] - reach, wall.a[0] + o.at + half, wall.a[1] + reach];
      for (const f of building.furniture ?? []) {
        if (f.level !== wall.level) continue;
        const across = overlapArea(f.rect, band);
        if (across <= 0.01) continue;
        // How much of the opening's own width it eats.
        const eaten = wall.axis === 'x'
          ? Math.min(f.rect[3], band[3]) - Math.max(f.rect[1], band[1])
          : Math.min(f.rect[2], band[2]) - Math.max(f.rect[0], band[0]);
        add('warning', 'door-blocked',
          `${f.name} stands in ${o.id}, across ${round(eaten)}m of a ${round(o.width)}m doorway`,
          { level: wall.level, opening: o.id });
      }
    }

    const head = o.head ?? (o.type === 'door' ? building.defaults?.doorHeight : building.defaults?.windowHead);
    const ceil = (levels(building).find((l) => l.id === wall.level)?.ceilingHeight) ?? 2.4;
    if (head != null && head > ceil + EPS) {
      add('error', 'opening-above-ceiling',
        `${o.id} has a head at ${round(head)}m in a room ${round(ceil)}m high`, { level: wall.level });
    }
  }

  // --- Stairs --------------------------------------------------------
  for (const s of (building.stairs ?? [])) {
    const fromRoom = (building.rooms ?? []).find((r) => r.id === s.from);
    const toRoom = (building.rooms ?? []).find((r) => r.id === s.to);
    const fromLevel = levels(building).find((l) => l.id === fromRoom?.level);
    const toLevel = levels(building).find((l) => l.id === toRoom?.level);
    if (!fromRoom || !toRoom) {
      add('error', 'stair-orphan', `Stair ${s.id} joins ${s.from} to ${s.to}, and one of them is missing`);
      continue;
    }
    const climb = (toLevel?.elevation ?? 0) - (fromLevel?.elevation ?? 0);
    const built = (s.risers ?? 0) * (s.rise ?? 0);
    if (Math.abs(built - climb) > 0.02) {
      add('error', 'stair-rise',
        `Stair ${s.id}: ${s.risers} risers at ${s.rise}m climb ${round(built, 3)}m, but the storey is ${round(climb, 3)}m`);
    }
    const run = Math.max(s.footprint[2] - s.footprint[0], s.footprint[3] - s.footprint[1]);
    const needed = ((s.risers ?? 1) - 1 - (s.winders ?? 0)) * (s.going ?? 0.22);
    if (needed > run + 0.05) {
      add('error', 'stair-run',
        `Stair ${s.id} needs ${round(needed)}m of run and its footprint gives ${round(run)}m`);
    }
    if (!roomRects(fromRoom).some((q) => within(s.footprint, q, 0.05))) {
      add('warning', 'stair-outside-room', `Stair ${s.id} is not wholly inside ${fromRoom.name}`);
    }
  }

  // --- Roof and chimneys ---------------------------------------------
  const top = ordered[ordered.length - 1];
  const topRects = top ? roomsOn(building, top.id).flatMap(roomRects) : [];
  for (const q of topRects) {
    const covered = (building.roofs ?? []).some((r) => within(q, r.over, 0.05));
    if (!covered) {
      add('error', 'roof-uncovered',
        `Part of the top floor at ${q.map((n) => round(n)).join(', ')} has no roof over it`);
    }
  }
  const ridge = (building.roofs ?? []).reduce((m, r) => Math.max(m, r.ridgeHeight ?? 0), 0);
  for (const c of (building.chimneys ?? [])) {
    if (c.topHeight != null && ridge && c.topHeight < ridge + 0.3) {
      add('warning', 'chimney-low',
        `${c.id} tops out at ${round(c.topHeight)}m against a ${round(ridge)}m ridge; a stack needs to clear it`);
    }
  }
  for (const r of (building.roofs ?? [])) {
    const eaves = r.eavesHeight ?? 0;
    const need = (top?.elevation ?? 0) + (top?.ceilingHeight ?? 0);
    if (eaves + 0.01 < need) {
      add('error', 'eaves-too-low',
        `${r.id} has eaves at ${round(eaves)}m but the top floor ceiling is at ${round(need)}m`);
    }
  }

  // --- Furniture -----------------------------------------------------
  for (const f of (building.furniture ?? [])) {
    const room = (building.rooms ?? []).find((r) => r.id === f.room);
    if (!room) {
      add('error', 'furniture-orphan', `${f.name} names room "${f.room}", which does not exist`);
      continue;
    }
    // An L-shaped room is a union, so a bed can straddle the join
    // legitimately. Testing against each rectangle in turn would call
    // that a mistake, so the item is sampled against the union.
    if (!containedBy(f.rect, roomRects(room))) {
      add('error', 'furniture-outside-room', `${f.name} does not fit inside ${room.name}`,
        { level: f.level });
    }
  }
  const furniture = building.furniture ?? [];
  for (let i = 0; i < furniture.length; i += 1) {
    for (let j = i + 1; j < furniture.length; j += 1) {
      if (furniture[i].level !== furniture[j].level) continue;
      const a = overlapArea(furniture[i].rect, furniture[j].rect);
      if (a > 0.02) {
        add('error', 'furniture-overlap',
          `${furniture[i].name} and ${furniture[j].name} occupy the same ${round(a)} m2`,
          { level: furniture[i].level });
      }
    }
  }

  // --- Is it the size the thing actually is? --------------------------
  //
  // A WARNING, never an error, and never a correction. The drawings
  // decide the layout (docs/SOURCE-FIDELITY.md); a checker that moved
  // furniture until the numbers came out green is exactly the mistake
  // that file exists to prevent. So this reports and stops.
  //
  // It earns its place because it catches the two things a plan drawn at
  // small scale gets wrong silently: a fitting drawn as a symbol rather
  // than at its real size, and a doorway too narrow to carry furniture
  // through once the frame and the stops are in.
  for (const f of furniture) {
    const band = PLAUSIBLE[f.kind];
    if (!band) continue;
    const w = Math.abs(f.rect[2] - f.rect[0]);
    const d = Math.abs(f.rect[3] - f.rect[1]);
    // Either orientation: a bath is 1.7 x 0.7 whichever way it is turned.
    const long = Math.max(w, d);
    const short = Math.min(w, d);
    const [minShort, minLong, why] = band;
    if (short < minShort - 0.02 || long < minLong - 0.02) {
      add('warning', 'furniture-implausible',
        `${f.name} is ${round(short)} x ${round(long)}m, smaller than a ${f.kind} is: ${why}`,
        { level: f.level });
    }
  }

  return out;
}

/**
 * The smallest a thing can be and still be that thing: [short, long, why].
 *
 * These are the dimensions of ordinary products, not of this house. A
 * close-coupled WC is nearly 0.70 deep because the cistern sits behind
 * the pan, so a 0.52 pan on a plan is a symbol rather than a fitting -
 * and a room drawn to fit the symbol is a room the real thing will not
 * go into.
 */
const PLAUSIBLE = {
  wc: [0.34, 0.62, 'a close-coupled pan and cistern is about 0.37 x 0.68'],
  basin: [0.28, 0.34, 'a small basin is about 0.35 x 0.45'],
  bath: [0.68, 1.5, 'a standard bath is 1.70 x 0.70'],
  shower: [0.75, 0.75, 'an 800mm tray is the smallest that is usable'],
  bed: [0.88, 1.88, 'a single mattress is 0.90 x 1.90'],
  fridge: [0.54, 0.54, 'a slot for a fridge is 0.60 wide'],
  washer: [0.58, 0.58, 'a washing machine needs a 0.60 slot'],
  dishwasher: [0.58, 0.58, 'a dishwasher needs a 0.60 slot'],
  oven: [0.55, 0.55, 'a built-under oven needs a 0.60 slot'],
};

export const integritySummary = (findings) => ({
  errors: findings.filter((f) => f.severity === 'error').length,
  warnings: findings.filter((f) => f.severity === 'warning').length,
  total: findings.length,
});
