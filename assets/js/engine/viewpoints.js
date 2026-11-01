// The named viewpoints, worked out from the building rather than assumed.
//
// A viewpoint is where the orbit camera STANDS, as a compass bearing
// from the house (0 north, 90 east, 180 south, 270 west) and a tilt
// above the horizon in radians. "Front" means the street side, and the
// street is not always south: 48 Ameysford Road's front faces south,
// Forest View's faces north. A fixed bearing for "Front" showed Forest
// View's garden and called it the front, which is the same kind of
// quiet wrongness as a mirrored model - it still looks like a house.
//
// So the building declares `orientation.frontFaces` and every bearing
// that means "front" or "garden" is derived from it. The compass
// points (east, west) and the bird's-eye corners are absolute.
//
// Pure: no DOM, no three.js. viewer.js reads the list; the test reads
// the same list.

const COMPASS = { north: 0, east: 90, south: 180, west: 270 };

/** The bearing the front of the building faces, or south if it does
 *  not say - the old fixed default, kept so an undeclared building
 *  renders exactly as before. */
export function frontBearing(building) {
  const face = building?.orientation?.frontFaces;
  return COMPASS[face] ?? 180;
}

const TILT = { eye: 0.34, bird: 0.8, above: 1.3, top: 1.52 };

/** The viewpoints for one building, in the order the buttons show. */
export function viewpointsFor(building) {
  const front = frontBearing(building);
  const back = (front + 180) % 360;
  return [
    { id: 'front', name: 'Front', bearing: front, tilt: TILT.eye },
    { id: 'back', name: 'Garden', bearing: back, tilt: TILT.eye },
    { id: 'west', name: 'West', bearing: 270, tilt: TILT.eye },
    { id: 'east', name: 'East', bearing: 90, tilt: TILT.eye },
    { id: 'ne', name: 'NE', bearing: 45, tilt: TILT.bird, birdsEye: true },
    { id: 'nw', name: 'NW', bearing: 315, tilt: TILT.bird, birdsEye: true },
    { id: 'se', name: 'SE', bearing: 135, tilt: TILT.bird, birdsEye: true },
    { id: 'sw', name: 'SW', bearing: 225, tilt: TILT.bird, birdsEye: true },
    { id: 'above', name: 'Above', bearing: front, tilt: TILT.above },
    // Not quite vertical: straight down is a degenerate orbit (no "up"
    // to roll against), and 1.52 rad reads as a plan from any phone.
    { id: 'top', name: 'Top', bearing: front, tilt: TILT.top },
  ];
}

/** Where the camera stands in plan space, relative to the house, for a
 *  bearing: north is -y because plan y runs north to south. */
export function standOffset(bearingDeg) {
  const rad = (bearingDeg * Math.PI) / 180;
  return { x: Math.sin(rad), y: -Math.cos(rad) };
}
