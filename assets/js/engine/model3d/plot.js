// model3d/plot.js - the boundary, the hedge on it, and nothing else.
//
// WHAT IS NOT HERE, AND WHY. The source site plan colours in nine kinds
// of surface: hedge, rough grass, overgrown shrubs, planting bed,
// hardstanding, shrub border, sheds, vehicles to clear, open ground.
// Only the hedge is modelled, and only because it is not really a
// surface: it is 1.83m of solid green standing on the boundary, so it
// decides what you can see from the garden and whether the west side is
// a path or a passage. The rest stays out. Those outlines are traced off
// aerial photographs to plus or minus one to two metres by the source's
// own admission, and drawing them at the same fidelity as walls measured
// off a floor plan would make an estimate look like a survey.
//
// The boundary LINE is drawn as a low kerb rather than a flat outline
// because the walkthrough is at eye height, where a line painted on the
// ground disappears at about fifteen metres. A 60mm upstand stays
// readable from the far end of a 40m plot without ever looking like a
// wall you could not step over. It sits outside the hedge, so from the
// garden the hedge hides it and from the road both read.

import { rectBox } from './geom.js';

const KERB_H = 0.06;
const KERB_W = 0.10;

/**
 * The boundary as four low rails, the hedge inside them, and a ground
 * plane under the lot.
 *
 * `plot.originX` / `originY` put the plot's north-west corner in plan
 * space, where the house's own outer north-west corner is the origin.
 *
 * THE HEDGE IS NOT A COLLIDER. Nothing outside the building is: the
 * walkthrough stops against walls only, deliberately, so that no piece
 * of planting can corner someone. It matters more here than it does for
 * a sofa, because the viewpoint that stands you in front of the house
 * is further out than the front boundary - make the hedge solid and
 * that viewpoint puts you outside your own plot with a wall in the way.
 */
export function buildPlot(plot, palette) {
  const out = [];
  const x0 = plot.originX ?? 0;
  const y0 = plot.originY ?? 0;
  const x1 = x0 + (plot.widthM ?? 0);
  const y1 = y0 + (plot.depthM ?? 0);
  if (x1 - x0 < 0.2 || y1 - y0 < 0.2) return out;

  // The ground, a hair below zero so it never fights the floor slabs
  // for the same pixels along the house's own footprint.
  const ground = rectBox([x0, y0, x1, y1], -0.32, 0.30, palette.ground);
  if (ground) out.push(ground);

  const rail = (rect) => {
    const m = rectBox(rect, -0.02, KERB_H, palette.boundary);
    if (m) out.push(m);
  };
  rail([x0, y0, x1, y0 + KERB_W]);            // north
  rail([x0, y1 - KERB_W, x1, y1]);            // south
  rail([x0, y0, x0 + KERB_W, y1]);            // west
  rail([x1 - KERB_W, y0, x1, y1]);            // east

  const hedge = plot.hedge;
  if (hedge?.heightM > 0 && hedge?.depthM > 0) {
    const d = hedge.depthM;
    const h = hedge.heightM;
    const put = (rect) => {
      const m = rectBox(rect, -0.02, h, palette.hedge);
      if (m) out.push(m);
    };
    // North and south run the full width; east and west run between
    // them, so the four meet at the corners without four overlapping
    // boxes fighting for the same pixels.
    put([x0, y0, x1, y0 + d]);                 // north
    put([x0, y1 - d, x1, y1]);                 // south
    put([x0, y0 + d, x0 + d, y1 - d]);         // west
    put([x1 - d, y0 + d, x1, y1 - d]);         // east
  }
  return out;
}
