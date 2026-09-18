// planner/places.js - everywhere the walkthrough can put you.
//
// Pure: a building in, a list of places out, and a named place resolved
// to a standing position. The viewer applies it; none of the arithmetic
// here needs a camera, so all of it can be checked in a test.
//
// OUTSIDE COMES FIRST, and that is deliberate. Standing back and looking
// at the house is half of what a walkthrough is for, and walking out of
// the front door and turning round to do it is a chore - especially by
// thumb. The upstairs rooms are reachable on foot up the stairs, but
// only once you know where the stairs are.

const SIDES = ['front', 'garden', 'west', 'east'];

/** The list, grouped: Outside, then each storey. */
export function destinations(building) {
  const b = building ?? {};
  const out = [
    { id: 'outside:front', name: 'The road, looking at the front', group: 'Outside' },
    { id: 'outside:garden', name: 'The garden, looking at the back', group: 'Outside' },
    { id: 'outside:west', name: 'The west side', group: 'Outside' },
    { id: 'outside:east', name: 'The east side', group: 'Outside' },
  ];
  for (const level of b.levels ?? []) {
    for (const room of (b.rooms ?? []).filter((r) => r.level === level.id && r.rect)) {
      out.push({ id: `room:${room.id}`, name: room.name, group: level.name });
    }
  }
  return out;
}

/**
 * Where a named place puts you, or null if it is not a place.
 *
 * Returns plan metres, the level whose walls you collide against, the
 * floor you stand on and which way you face.
 */
export function resolvePlace(building, id) {
  const b = building ?? {};
  const ground = (b.levels ?? [])[0] ?? { id: null, elevation: 0 };
  const key = String(id ?? '');

  if (key.startsWith('outside:')) {
    const side = key.slice(8);
    if (!SIDES.includes(side)) return null;
    const w = b.envelope?.widthM ?? 8;
    const d = b.envelope?.depthM ?? 8;
    // Stand back far enough that the whole house fits a phone held
    // upright. A portrait canvas has a much narrower HORIZONTAL angle
    // than vertical, so the width is what decides this: at 0.85 of the
    // building's own size the gable edges were exactly on the frame
    // with no margin at all.
    const back = Math.max(w, d) * 1.35;
    const spots = {
      front: { x: w / 2, y: d + back, yaw: 0 },
      garden: { x: w / 2, y: -back, yaw: Math.PI },
      west: { x: -back, y: d / 2, yaw: Math.PI / 2 },
      east: { x: w + back, y: d / 2, yaw: -Math.PI / 2 },
    };
    return {
      ...spots[side],
      level: ground.id,
      elevation: ground.elevation,
      // From the pavement the interesting part of a two-storey house
      // with a 7.7m ridge is above the horizon.
      pitch: 0.12,
    };
  }

  const roomId = key.startsWith('room:') ? key.slice(5) : key;
  const room = (b.rooms ?? []).find((r) => r.id === roomId && r.rect);
  if (!room) return null;
  const level = (b.levels ?? []).find((l) => l.id === room.level) ?? ground;
  const [x1, y1, x2, y2] = room.rect;
  return {
    x: (x1 + x2) / 2,
    y: (y1 + y2) / 2,
    level: room.level,
    elevation: level.elevation,
    yaw: 0,
    pitch: 0,
  };
}

/**
 * Where the walkthrough starts: just inside the front door, facing in.
 *
 * Falls back to the middle of the first room on the lowest floor, so a
 * building with no door named "front" still opens somewhere sensible
 * rather than at the origin.
 */
export function spawnPlace(building) {
  const b = building ?? {};
  const level = (b.levels ?? [])[0] ?? { id: null, elevation: 0 };
  const front = (b.openings ?? []).find((o) => /front/.test(o.id) && o.type === 'door');
  const wall = front && (b.walls ?? []).find((w) => w.id === front.wall);
  if (wall) {
    const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) || 1;
    const ux = (wall.b[0] - wall.a[0]) / len;
    const uy = (wall.b[1] - wall.a[1]) / len;
    return {
      x: wall.a[0] + ux * front.at,
      // A metre in from the threshold, which is northwards for a
      // south-facing front door, looking the way you came in.
      y: wall.a[1] + uy * front.at - 1.0,
      level: level.id,
      elevation: level.elevation,
      yaw: 0,
      pitch: 0,
    };
  }
  const room = (b.rooms ?? []).find((r) => r.level === level.id && r.rect);
  const rect = room?.rect ?? [0, 0, 4, 4];
  return {
    x: (rect[0] + rect[2]) / 2,
    y: (rect[1] + rect[3]) / 2,
    level: level.id,
    elevation: level.elevation,
    yaw: 0,
    pitch: 0,
  };
}
