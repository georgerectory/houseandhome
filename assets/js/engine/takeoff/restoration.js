// takeoff/restoration.js - quantities for stripping back to brick.
//
// The other half of ../takeoff.js. See ./newbuild.js for what gets
// built; this is what comes off the existing house and what goes back
// on it.
import { RATES, line, round } from './newbuild.js';

// ------------------------------------------------------------------
// STRIPPING BACK TO BRICK.
//
// The owner's standing assumption: every internal face comes off back
// to the brick, the house is replumbed and rewired, and it is made
// watertight. That is one geometric quantity - the internal wall face
// of the whole house - read twice: as waste going out, and as lime
// plaster coming back.
//
// It is measured off the room rectangles rather than off the walls,
// because what gets plastered is the inside of a room, and a room
// already knows its own perimeter and which level it stands on.
// ------------------------------------------------------------------

const rectsOf = (r) => r.rects ?? [r.rect];
const rectArea = (q) => (q[2] - q[0]) * (q[3] - q[1]);
const rectPerimeter = (q) => 2 * ((q[2] - q[0]) + (q[3] - q[1]));

/** Floor area of a set of rooms, in square metres. */
export function floorAreaM2(stage, roomIds = null) {
  return (stage?.rooms ?? [])
    .filter((r) => !roomIds || roomIds.includes(r.id))
    .reduce((s, r) => s + rectsOf(r).reduce((a, q) => a + rectArea(q), 0), 0);
}

/**
 * Internal wall face of the whole house, in square metres: every
 * room's perimeter times the ceiling height of the level it is on.
 *
 * Openings are NOT deducted. A door reveal and a window reveal both
 * get plastered, and the two roughly cancel the hole they sit in; on a
 * strip-out the difference is well inside the wastage allowance, and
 * the error is in the safe direction.
 */
export function ceilingAreaM2(stage) {
  // Every room has a ceiling, and on a full strip every one of them
  // comes down. Lath and plaster overhead is the dirtiest half of the
  // job and the half a wall-area figure silently leaves out.
  return floorAreaM2(stage);
}

/**
 * Metres of external angle needing a bead, measured off the openings
 * the stage actually carries rather than off a per-square-metre rate.
 *
 * Every reveal has two jambs and a head, and an internal doorway has
 * them twice - once into each room. This is where a plastering order
 * quietly runs short, because beads look like an afterthought and are
 * the one item bought by the length.
 */
export function beadM(stage, building) {
  const doorH = building?.defaults?.doorHeight ?? 1.98;
  const winH = (building?.defaults?.windowHead ?? 2.05)
    - (building?.defaults?.windowSill ?? 0.9);
  return (stage?.openings ?? []).reduce((m, o) => {
    const h = o.type === 'window' ? winH : doorH;
    const perFace = 2 * h + (o.width ?? 0.83);
    // A window is plastered on one face; a doorway on both.
    return m + perFace * (o.type === 'window' ? 1 : 2);
  }, 0);
}

export function internalFaceM2(stage) {
  const height = Object.fromEntries(
    (stage?.levels ?? []).map((l) => [l.id, l.ceilingHeight ?? 2.4]));
  return (stage?.rooms ?? []).reduce((sum, r) => sum
    + rectsOf(r).reduce((s, q) => s + rectPerimeter(q), 0) * (height[r.level] ?? 2.4), 0);
}

/**
 * Lime plaster to put the house back, after it has been taken to
 * brick.
 *
 * LIME, not gypsum, and this is the takeoff where that matters most.
 * Gypsum on a solid brick wall holds water against the brick and the
 * damp reappears a metre up; it is also what most quotes will assume
 * unless the order says otherwise. The order says otherwise.
 */
export function plasterTakeoff(stage, opts = {}) {
  const faceM2 = opts.faceM2 ?? internalFaceM2(stage);
  if (!faceM2) return [];
  const wastage = opts.wastagePct ?? 10;
  const withWaste = faceM2 * (1 + wastage / 100);
  const tonnes = withWaste * RATES.limePlasterTonnesPerM2At20mm;
  return [
    line('lime-plaster', 'Lime plaster, premixed haired', tonnes, 'tonne',
      `${round(faceM2, 1)} m2 of internal face plus ${wastage}% wastage, `
      + `at ${RATES.limePlasterTonnesPerM2At20mm} t/m2 for a 20mm two-coat build-up. `
      + 'Lime, not gypsum: gypsum on a solid brick wall traps the water it is '
      + 'meant to let out.', { dp: 2 }),
    line('lime-finish', 'Lime putty finish coat',
      withWaste * RATES.limeFinishTonnesPerM2, 'tonne',
      `${round(withWaste, 1)} m2 at a 3mm finish, `
      + `${RATES.limeFinishTonnesPerM2} t/m2. Separate from the backing because it `
      + 'is a different material, not a thinner mix of the same one.', { dp: 2 }),
  ];
}

/**
 * Beads and ceilings: the two lines a wall-area plastering order
 * leaves out, and the two that stop the job.
 */
export function plasterSundriesTakeoff(stage, building) {
  const bead = beadM(stage, building);
  const ceil = ceilingAreaM2(stage);
  const out = [];
  if (bead) {
    out.push(line('plaster-bead', 'Stainless angle bead', bead * 1.1, 'm',
      `${(stage?.openings ?? []).length} openings: two jambs and a head each, `
      + 'doorways counted on both faces, plus 10% for cuts. Stainless rather than '
      + 'galvanised, because lime eats galvanising.'));
  }
  if (ceil) {
    out.push(line('ceiling-board', 'Plasterboard, 12.5mm', ceil * 1.12, 'm2',
      `${round(ceil, 1)} m2 of ceiling plus 12% for cuts. Board rather than `
      + 'relathing: a ceiling is not a breathability problem, and relathing a '
      + 'whole house is a craft job nobody is proposing to do.', { dp: 1 }));
    out.push(line('ceiling-screws', 'Drywall screws, 38mm', ceil * 18, 'each',
      `${round(ceil, 1)} m2 at about 18 screws per m2 into the joists.`));
  }
  return out;
}

/**
 * What the strip-out throws away, and how many skips that is.
 *
 * The number people get wrong. A whole house of lath and plaster looks
 * like nothing on the wall and fills six skips on the drive, and a skip
 * booked one at a time on a Saturday is the thing that stops the work.
 */
export function stripWasteTakeoff(stage, opts = {}) {
  const faceM2 = opts.faceM2 ?? internalFaceM2(stage);
  const ceilM2 = opts.ceilingM2 ?? ceilingAreaM2(stage);
  const strippedM2 = faceM2 + ceilM2;
  if (!strippedM2) return [];
  const m3 = strippedM2 * RATES.stripWasteM3PerM2;
  // A skip is hired whole. 2.4 skips is three skips, and the rounding
  // is the difference between finishing on a Sunday and stopping.
  const skips = Math.ceil(m3 / RATES.builderSkipM3);
  return [
    line('strip-waste', 'Strip-out waste', m3, 'm3',
      `${round(faceM2, 1)} m2 of wall face and ${round(ceilM2, 1)} m2 of ceiling `
      + `at ${RATES.stripWasteM3PerM2} m3/m2 bulked. Plaster, lath, nails and dust, `
      + 'as it sits in the skip rather than as it sits on the wall. Joinery, floor '
      + 'coverings, the old kitchen and the bathroom are NOT in this figure.',
      { dp: 1 }),
    line('skip', 'Builders skip, 8 yard', skips, 'hire',
      `${round(m3, 1)} m3 at ${RATES.builderSkipM3} m3 a skip, rounded up because a `
      + 'skip is hired whole. Plaster is weight-limited as well as volume-limited, '
      + 'so a skip taking rubble alone will be called full before it looks it.',
      { extra: { acquisition: 'hire' } }),
  ];
}

/**
 * A full replumb, from the rooms that carry water and the radiators
 * the heating has to reach.
 */
export function plumbingTakeoff(stage, opts = {}) {
  const wetTypes = opts.wetRoomTypes
    ?? ['kitchen', 'bathroom', 'ensuite', 'wc', 'utility', 'cloakroom'];
  const wet = (stage?.rooms ?? []).filter((r) => wetTypes.includes(r.roomType ?? r.roomKey));
  const rads = radiatorTakeoff(stage, opts).find((l) => l.key === 'radiator')?.quantity ?? 0;
  if (!wet.length && !rads) return [];
  const pipe = wet.length * RATES.pipeMPerWetRoom + rads * RATES.pipeMPerRadiator;
  return [
    line('pipe', 'Copper pipe, 15 and 22mm', pipe, 'm',
      `${wet.length} wet room${wet.length === 1 ? '' : 's'} at `
      + `${RATES.pipeMPerWetRoom}m each (${wet.map((r) => r.name).join(', ') || 'none'}) `
      + `plus ${rads} radiators at ${RATES.pipeMPerRadiator}m of flow and return. `
      + 'Copper rather than plastic where it is buried: a joint under a new lime '
      + 'floor is not a joint anybody gets back to.'),
    line('pipe-fittings', 'Pipe fittings and clips', pipe * 0.9, 'each',
      `${round(pipe)}m of pipe at roughly one fitting or clip per metre.`),
    line('pipe-insulation', 'Pipe insulation', pipe * 0.6, 'm',
      `${round(pipe)}m of pipe, insulating the runs that are not inside heated space.`),
  ];
}

/**
 * A rewire, from floor area. Points and cable only: the consumer unit,
 * the certificate and the labour are a job, not a material.
 */
export function electricalTakeoff(stage) {
  const area = floorAreaM2(stage);
  if (!area) return [];
  const points = area * RATES.electricalPointsPerM2;
  return [
    line('electrical-points', 'Electrical points', points, 'each',
      `${round(area, 1)} m2 of floor at ${RATES.electricalPointsPerM2} points/m2. `
      + 'A point is a socket, a switch or a light. Chased into a solid wall, '
      + 'not clipped to it.'),
    line('twin-earth', 'Twin and earth cable', points * RATES.cableMPerPoint, 'm',
      `${round(points)} points at ${RATES.cableMPerPoint}m each, back to the board.`),
  ];
}

/** Radiators, from the rooms that have to be heated. */
export function radiatorTakeoff(stage, opts = {}) {
  const skip = opts.skipRoomIds ?? [];
  const rooms = (stage?.rooms ?? []).filter((r) => !skip.includes(r.id));
  if (!rooms.length) return [];
  const count = rooms.reduce((n, r) => {
    const a = rectsOf(r).reduce((s, q) => s + rectArea(q), 0);
    return n + Math.max(1, Math.ceil(a / RATES.radiatorM2PerUnit));
  }, 0);
  return [
    line('radiator', 'Radiator', count, 'each',
      `${rooms.length} rooms, one radiator to ${RATES.radiatorM2PerUnit} m2 and a `
      + 'second above that. A single rad on a long Victorian wall leaves the far end cold.'),
    line('rad-valves', 'Thermostatic valve set', count, 'pair',
      `One pair per radiator across ${count}.`),
  ];
}

/**
 * The whole restoration, in one call: what comes off, what goes back,
 * and the services behind it.
 */
export function restorationTakeoff(stage, building, opts = {}) {
  const faceM2 = internalFaceM2(stage);
  return [
    ...stripWasteTakeoff(stage, { faceM2, ...opts }),
    ...plasterTakeoff(stage, { faceM2, ...opts }),
    ...plasterSundriesTakeoff(stage, building),
    ...electricalTakeoff(stage),
    ...plumbingTakeoff(stage, opts),
    ...radiatorTakeoff(stage, opts),
  ];
}
