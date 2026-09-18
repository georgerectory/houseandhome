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

/** A doorway has to be wider than the walker to be worth calling one.
 *  The jamb inset keeps a shoulder from clipping the reveal. */
const JAMB = 0.06;

/**
 * Is this plan position inside the passable part of an opening in `c`?
 *
 * Distance is measured from the wall's OWN start point, because a wall
 * drawn south-to-north starts at the high y and measuring from the min
 * corner would put every one of its doors at the wrong end.
 */
function throughDoorway(c, px, py) {
  if (!c.doorways?.length) return false;
  const along = c.origin
    ? Math.hypot(px - c.origin[0], py - c.origin[1])
    : (c.maxX - c.minX >= c.maxY - c.minY ? px - c.minX : py - c.minY);
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
