// takeoff/newbuild.js - quantities for what gets BUILT.
//
// Brick for new wall face, underfloor heating, paving and gravel: the
// extension's materials, measured off stageDiff() rather than typed.
// The restoration half - what comes OFF and goes back ON the existing
// house - is in ./restoration.js, and both are re-exported from
// ../takeoff.js so the import path never changed.
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
  // Gypsum, for a cavity wall, where lime buys nothing. An 11mm
  // bonding or browning undercoat is about 10 kg/m2; a 2mm multi-finish
  // skim about 1.5 kg/m2.
  gypsumUndercoatTonnesPerM2: 0.010,
  gypsumFinishTonnesPerM2: 0.0015,
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

export const round = (v, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

/** A takeoff result. `basis` is the working, in words, and it is the
 *  most important field on it. */
export const line = (key, label, quantity, unit, basis, opts = {}) => ({
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
