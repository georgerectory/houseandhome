// walk.js - the arithmetic of walking through the model. No DOM, no
// three.js, no state: positions in, positions out, so every rule here
// can be checked on the back of an envelope and in a unit test.
//
// The viewer owns the camera and the input; this owns the answers to
// two questions. Can I stand here? And am I on the stairs?

/** Eye height, body radius and pace. A walker is a circle, not a box:
 *  a box catches its corners on door jambs and reads as sticky. */
export const EYE_HEIGHT = 1.62;
export const BODY_RADIUS = 0.26;
export const WALK_SPEED = 2.6;
export const RUN_MULTIPLIER = 1.9;

/** The jamb inset stops a doorway reading as passable right at its edge.
 *  It is small deliberately: the walker's CENTRE is what gets tested, so
 *  0.06 took 120mm off every opening, and on the narrowest doors in this
 *  house - a 0.575 landing end, a 0.57 bathroom - that left a band
 *  barely wider than a thumb could aim at. */
const JAMB = 0.03;

/**
 * How far along `c` this plan position is, measured the way the wall
 * measures itself.
 *
 * From the wall's OWN start point, because a wall drawn south-to-north
 * starts at the high y and measuring from the min corner would put every
 * one of its doors at the wrong end. And PROJECTED onto the wall's
 * direction, because the walker is never on the wall's centreline: they
 * are a body radius or more off it, approaching. Taking the straight
 * line distance instead folds that standoff into the answer and reads
 * the walker as further along the wall than they are - by 80mm for a
 * door 0.7m from the start, which is a sixth of a doorway. That is what
 * made doors feel like they had to be threaded.
 */
function alongWall(c, px, py) {
  if (!c.origin) {
    return c.maxX - c.minX >= c.maxY - c.minY ? px - c.minX : py - c.minY;
  }
  const dx = px - c.origin[0];
  const dy = py - c.origin[1];
  if (!c.dir) return Math.hypot(dx, dy);
  return dx * c.dir[0] + dy * c.dir[1];
}

/** Is this plan position inside the passable part of an opening in `c`? */
function throughDoorway(c, px, py) {
  if (!c.doorways?.length) return false;
  const along = alongWall(c, px, py);
  return c.doorways.some((o) => along > o.start + JAMB && along < o.end - JAMB);
}

/**
 * Push a proposed position out of any wall it lands inside.
 *
 * Walls are axis-aligned boxes grown by the body radius. Where the
 * proposed point is inside one, it is pushed out along whichever axis it
 * is least deep into - which is what makes sliding along a wall feel
 * like sliding rather than stopping dead.
 */
export function resolveCollision(colliders, level, px, py, radius = BODY_RADIUS) {
  let x = px;
  let y = py;
  for (const c of colliders ?? []) {
    if (c.level !== level) continue;
    const minX = c.minX - radius;
    const maxX = c.maxX + radius;
    const minY = c.minY - radius;
    const maxY = c.maxY + radius;
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    if (throughDoorway(c, x, y)) continue;
    const dx = Math.min(x - minX, maxX - x);
    const dy = Math.min(y - minY, maxY - y);
    if (dx < dy) x = (x - minX < maxX - x) ? minX : maxX;
    else y = (y - minY < maxY - y) ? minY : maxY;
  }
  return [x, y];
}

/**
 * Where a walker is on a flight, or null if they are not on one.
 *
 * Returns the height to stand at and which level's walls to collide
 * against, so which floor you are on follows your feet rather than a
 * button you have to remember to press.
 */
export function climbAt(climbs, px, py) {
  for (const c of climbs ?? []) {
    if (px < c.x0 || px > c.x1 || py < c.y0 || py > c.y1) continue;
    const along = c.axis === 'y'
      ? (py - c.y0) / (c.y1 - c.y0)
      : (px - c.x0) / (c.x1 - c.x0);
    // `topAtLow` says the climb ends at the low end of the span, so the
    // fraction has to be read backwards.
    const t = c.topAtLow ? 1 - along : along;
    const clamped = Math.max(0, Math.min(1, t));
    return {
      t: clamped,
      height: c.bottom + clamped * (c.top - c.bottom),
      // Halfway up is where the walls you can bump into change floor.
      level: clamped > 0.5 ? c.toLevel : c.fromLevel,
      elevation: clamped > 0.5 ? c.top : c.bottom,
    };
  }
  return null;
}

/**
 * A step in PLAN space from a heading and a pair of stick axes.
 *
 * `yaw` is measured the way the viewer measures it: 0 looks north (up
 * the plan), and it increases turning east. Diagonals are normalised so
 * walking forward-and-sideways is not faster than walking forward.
 */
export function stepFrom(yaw, forward, strafe, distance) {
  const len = Math.hypot(forward, strafe);
  if (len < 0.01) return [0, 0];
  const f = forward / len;
  const s = strafe / len;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return [
    (f * sin + s * cos) * distance,
    (-f * cos + s * sin) * distance,
  ];
}

/** A compass bearing in degrees from the viewer's yaw, for a needle and
 *  for saying "you are facing north-east" in words. */
export const headingDeg = (yaw) => ((yaw * 180) / Math.PI % 360 + 360) % 360;

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const headingName = (yaw) => POINTS[Math.round(headingDeg(yaw) / 45) % 8];
