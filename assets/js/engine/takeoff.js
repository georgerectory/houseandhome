// takeoff.js - how many of the thing, measured off the model.
//
// A THIN RE-EXPORT SHIM. The module grew past the 400-line mark this
// repository keeps to, so it split in two along the seam that was
// already there in the comments: what gets BUILT, and what gets
// STRIPPED AND PUT BACK. The import path does not change, which is the
// whole point of splitting behind a shim rather than moving files and
// rewriting every caller.
//
//   ./takeoff/newbuild.js     brick, underfloor heating, paving, gravel
//   ./takeoff/restoration.js  strip-out waste, lime, plumbing, wiring
//
// The list below is the PUBLIC SURFACE, stated once. `round` and `line`
// are shared between the two halves and are deliberately not in it:
// they are how a takeoff line is built, not something to call.
export {
  BRICK_SIZES,
  JOINT_M,
  bricksPerM2Skin,
  RATES,
  newWallFaceM2,
  brickTakeoff,
  ufhTakeoff,
  pavingTakeoff,
  gravelTakeoff,
} from './takeoff/newbuild.js';

export {
  floorAreaM2,
  ceilingAreaM2,
  beadM,
  internalFaceM2,
  plasterTakeoff,
  plasterSundriesTakeoff,
  stripWasteTakeoff,
  plumbingTakeoff,
  electricalTakeoff,
  radiatorTakeoff,
  restorationTakeoff,
} from './takeoff/restoration.js';
