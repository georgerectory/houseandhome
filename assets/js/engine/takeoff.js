// takeoff.js - how many of the thing, measured off the model.
//
// Pure: geometry in, quantities out. No DOM, no fetch.
//
// THE POINT. A stockpile target needs a number - 4,200 bricks - and that
// number decides two years of Saturday mornings and a few thousand
// pounds. A guess will be out by a thousand and nobody will find out
// until the wall stops one course short of the wall plate.
//
// So it is derived the same way every other figure in this system is:
// from the geometry, by arithmetic written down where it can be checked.
// `stageDiff()` already measures what the extension adds - metres of new
// external wall, square metres of new roof, rooms created. This turns
// those into materials.
//
// EVERY RATE HERE IS A TRADE STANDARD, NOT A MEASUREMENT. 60 bricks per
// square metre of half-brick wall is the number every bricklayer in the
// country works to; it is not something anybody measured at this house.
// So each result carries its own working and its own confidence, and a
// takeoff is `drafted` however precise the geometry underneath it is.
// The quantity is only as good as the assumption on top of it, and the
// assumption is on the page.

/**
 * Trade rates. Each one says what it is per, because "60 bricks" means
 * nothing without "per square metre of half-brick skin".
 *
 * A SOLID 9-inch Victorian wall is two skins, so it is 120/m2 of wall
 * face, not 60. Getting that wrong halves the order.
 */
/**
 * Brick sizes, in metres, and the joint they are laid with.
 *
 * THE RATE IS DERIVED FROM THE BRICK, not typed. "60 bricks per square
 * metre" is the number every bricklayer quotes, and it is the number
 * for a METRIC brick: 215 x 65 with a 10mm joint tiles at 60.3/m2. An
 * IMPERIAL Victorian brick is longer and deeper - 9 x 2 5/8 inches - so
 * the same square metre takes about 55 of them, and ordering imperials
 * at the metric rate over-buys by a tenth.
 *
 * On a target of several thousand collected over two years that is
 * hundreds of bricks and hundreds of pounds, and it is invisible unless
 * the rate is computed from the size it belongs to.
 */
export const BRICK_SIZES = {
  // 9 x 4 3/8 x 2 5/8 inches. The house's own brick, owner-confirmed.
  imperial: { lengthM: 0.2286, heightM: 0.0667, widthM: 0.1111, label: 'Imperial' },
  // 215 x 102.5 x 65mm. Everything made since about 1970.
  metric: { lengthM: 0.215, heightM: 0.065, widthM: 0.1025, label: 'Metric' },
};

/** The mortar joint a brick is laid with, in metres. */
export const JOINT_M = 0.010;

/**
 * How many bricks make a square metre of half-brick skin, from the
 * brick's own stretcher face plus one joint on each axis.
 */
export function bricksPerM2Skin(size = BRICK_SIZES.imperial) {
  return 1 / ((size.lengthM + JOINT_M) * (size.heightM + JOINT_M));
}

export const RATES = {
  // Kept for the metric case and for anything that still asks for a
  // flat rate. Anything measuring THIS house should go through
  // bricksPerM2Skin() with the imperial size.
  brickPerM2Skin: 60,
  skinsSolid9in: 2,
  skinsCavity: 2,
  // Mortar, in tonnes of sand per thousand bricks, and bags of lime to
  // match. Lime rather than cement, per the standing specification.
  sandTonnesPer1000Bricks: 0.6,
  limeBagsPer1000Bricks: 8,
  // Slabs and gravel.
  gravelTonnesPerM2At50mm: 0.1,
  // Wall ties, per square metre of cavity wall.
  tiesPerM2: 5,
  // Underfloor heating pipe, in metres per square metre at 150mm
  // centres, plus a tenth for the run back to the manifold.
  ufhPipeMPerM2At150: 6.7,
  ufhManifoldPortsSpare: 1,

  // ---- Stripping back to brick -------------------------------------
  // The standing assumption is a full strip: every internal face back
  // to the brick, replumbed, rewired, made watertight. That turns the
  // internal wall face of the whole house into a quantity, twice over -
  // once as waste going out and once as lime plaster coming back.
  //
  // Premixed lime plaster, in tonnes per square metre at a 20mm
  // two-coat build-up. Suppliers quote about a tonne to 25 m2 at that
  // thickness.
  limePlasterTonnesPerM2At20mm: 0.04,
  // The finish is a different material, not a thinner mix of the same
  // one. 3mm of lime putty is about 5 kg/m2; 6 covers the wastage.
  limeFinishTonnesPerM2: 0.006,
  // Haired base coat over bare brick: the hair is what stops the
  // backing coat shrinking off a hard, suction-heavy Victorian brick.
  plasterCoatsOnBrick: 2,
  // What comes OFF. Twenty millimetres of plaster at about 1,800 kg/m3
  // is 36 kg/m2, and lath, nails and dust take it past 40. Bulked into
  // a skip it is about 0.06 m3 per square metre stripped, and the skip
  // fills on volume long before it fills on weight.
  stripWasteM3PerM2: 0.06,
  builderSkipM3: 6.1,
  // Electrics, from floor area. A point is a socket, a switch or a
  // light. A full rewire of a three-bedroom house runs to forty or
  // fifty points, which on this floor area is a point to every two
  // square metres - not the one-to-four a new-build gets away with,
  // because a Victorian house has no sockets where anybody wants one.
  electricalPointsPerM2: 0.5,
  cableMPerPoint: 8,
  // Plumbing, in metres of pipe. Hot, cold and waste follow the rooms
  // with water in them; flow and return follow the radiators.
  pipeMPerWetRoom: 24,
  pipeMPerRadiator: 9,
  // Radiators, from room area. One to about fifteen square metres,
  // then two, because a single rad on a long Victorian wall leaves the
  // far end cold whatever its output.
  radiatorM2PerUnit: 15,
};

const round = (v, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

/** A takeoff result. `basis` is the working, in words, and it is the
 *  most important field on it. */
const line = (key, label, quantity, unit, basis, opts = {}) => ({
  key,
  label,
  quantity: round(quantity, opts.dp ?? 0),
  unit,
  basis,
  // A takeoff can never be better than `drafted`: the geometry is
  // researched at best and the rates are trade convention.
  confidence: 'drafted',
  ...opts.extra,
});

/**
 * How much NEW EXTERNAL WALL FACE the extension builds, in square
 * metres, counted once per face rather than once per storey.
 *
 * `stageDiff` gives the plan length; the height is what turns it into
 * an area, and that comes from the eaves height the model already
 * carries rather than from a rule of thumb.
 */
export function newWallFaceM2(diff, building) {
  const planM = diff?.newExternalWallPlanM ?? 0;
  const eaves = building?.defaults?.eavesHeight ?? 5;
  return planM * eaves;
}

/**
 * Bricks for the extension's new external walls.
 *
 * `construction` decides how many skins the face is: a solid 9in wall
 * matching the Victorian original is two, and so is a cavity wall - but
 * a cavity wall's inner skin is usually block, so only the outer skin
 * is brick. Which one this house builds is an open decision, so both
 * are offered and the caller says which.
 */
export function brickTakeoff(diff, building, opts = {}) {
  const faceM2 = newWallFaceM2(diff, building);
  const construction = opts.construction ?? 'solid9';
  const size = opts.brickSize ?? BRICK_SIZES.imperial;
  const perM2 = bricksPerM2Skin(size);
  const brickSkins = construction === 'cavity' ? 1 : RATES.skinsSolid9in;
  const bricks = faceM2 * perM2 * brickSkins;
  const basis = `${round(diff?.newExternalWallPlanM ?? 0, 2)}m of new outer wall on plan `
    + `x ${building?.defaults?.eavesHeight ?? 5}m to the eaves = ${round(faceM2, 1)} m2 of face, `
    + `x ${round(perM2, 1)} bricks/m2 x ${brickSkins} skin${brickSkins > 1 ? 's' : ''} `
    + `(${construction === 'cavity' ? 'cavity, brick outer and block inner' : 'solid 9in, matching the original'}). `
    + `${size.label} brick at ${size.lengthM * 1000} x ${size.heightM * 1000}mm plus a `
    + `${JOINT_M * 1000}mm joint - NOT the 60/m2 rate, which is for a metric brick and `
    + 'over-orders an imperial one by about a tenth.';
  return [
    line('brick', 'Facing brick', bricks, 'each', basis,
      { extra: { construction, brickSize: size.label } }),
    line('sand', 'Building sand', (bricks / 1000) * RATES.sandTonnesPer1000Bricks,
      'tonne', `${round(bricks)} bricks at ${RATES.sandTonnesPer1000Bricks} tonnes per thousand`,
      { dp: 2 }),
    line('lime', 'Hydraulic lime (NHL)', (bricks / 1000) * RATES.limeBagsPer1000Bricks,
      '25kg bag', `${round(bricks)} bricks at ${RATES.limeBagsPer1000Bricks} bags per thousand. `
      + 'Lime, not cement: see the standing specification.'),
    ...(construction === 'cavity'
      ? [line('ties', 'Wall ties', faceM2 * RATES.tiesPerM2, 'each',
        `${round(faceM2, 1)} m2 of cavity wall at ${RATES.tiesPerM2}/m2`)]
      : []),
  ];
}

/**
 * Underfloor heating for a set of rooms, by their own floor areas.
 *
 * Takes room ids rather than a blanket "ground floor", because heating
 * a hall nobody stands in is how a system ends up oversized.
 */
export function ufhTakeoff(building, roomIds) {
  const rooms = (building?.rooms ?? []).filter((r) => roomIds.includes(r.id));
  const rects = (r) => r.rects ?? [r.rect];
  const area = rooms.reduce((sum, r) => sum
    + rects(r).reduce((s, q) => s + (q[2] - q[0]) * (q[3] - q[1]), 0), 0);
  const names = rooms.map((r) => r.name).join(', ');
  if (!rooms.length) return [];
  return [
    line('ufh-pipe', 'Underfloor heating pipe', area * RATES.ufhPipeMPerM2At150, 'm',
      `${names}: ${round(area, 1)} m2 at ${RATES.ufhPipeMPerM2At150} m/m2 `
      + '(150mm centres, plus the run back to the manifold)'),
    line('ufh-ports', 'Manifold ports', rooms.length + RATES.ufhManifoldPortsSpare, 'port',
      `One loop per room across ${rooms.length}, plus ${RATES.ufhManifoldPortsSpare} spare. `
      + 'A room bigger than about 40 m2 needs two loops; none of these is.'),
    line('ufh-insulation', 'Floor insulation board', area, 'm2',
      `${round(area, 1)} m2 under the pipe. Without it half the heat goes into the ground.`,
      { dp: 1 }),
  ];
}

/**
 * Slabs and gravel for a paved area, from its size rather than from a
 * pallet count somebody remembered.
 */
export function pavingTakeoff({ areaM2, slabW, slabH, jointMm = 10 }) {
  if (!areaM2 || !slabW || !slabH) return [];
  const joint = jointMm / 1000;
  const perSlab = (slabW + joint) * (slabH + joint);
  const slabs = areaM2 / perSlab;
  return [
    line('slab', 'Paving slab', slabs, 'each',
      `${round(areaM2, 1)} m2 at ${slabW} x ${slabH}m plus a ${jointMm}mm joint `
      + `= ${round(perSlab, 3)} m2 each`),
    line('sub-base', 'MOT type 1 sub-base', areaM2 * 0.15 * 2.1, 'tonne',
      `${round(areaM2, 1)} m2 at 150mm compacted, at about 2.1 t/m3`, { dp: 1 }),
    line('sharp-sand', 'Sharp sand for the bed', areaM2 * 0.05 * 1.6, 'tonne',
      `${round(areaM2, 1)} m2 at a 50mm bed, at about 1.6 t/m3`, { dp: 1 }),
  ];
}

/** Gravel by area and depth, for a path or a drive. */
export function gravelTakeoff({ areaM2, depthMm = 50 }) {
  if (!areaM2) return [];
  const tonnes = areaM2 * (depthMm / 50) * RATES.gravelTonnesPerM2At50mm;
  return [line('gravel', 'Gravel', tonnes, 'tonne',
    `${round(areaM2, 1)} m2 at ${depthMm}mm, at about `
    + `${RATES.gravelTonnesPerM2At50mm} t/m2 per 50mm`, { dp: 1 })];
}

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

