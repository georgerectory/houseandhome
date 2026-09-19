// model3d/plot.js - the boundary, and only the boundary.
//
// WHAT IS NOT HERE, AND WHY. The source site plan colours in nine kinds
// of surface: hedge, rough grass, overgrown shrubs, planting bed,
// hardstanding, shrub border, sheds, vehicles to clear, open ground.
// None of it is modelled. Those outlines are traced off aerial
// photographs to plus or minus one to two metres by the source's own
// admission, and drawing them at the same fidelity as walls measured
// off a floor plan would make an estimate look like a survey. They are
// also not the question. The question the boundary answers is which
// side of the house has room and how much, and a rectangle answers it.
//
// The boundary is drawn as a low kerb rather than a flat outline
// because the walkthrough is at eye height, where a line painted on the
// ground disappears at about fifteen metres. A 60mm upstand stays
// readable from the far end of a 40m plot without ever looking like a
// wall you could not step over.

import { rectBox } from './geom.js';

const KERB_H = 0.06;
const KERB_W = 0.10;

/**
 * The boundary as four low rails, plus a ground plane inside it.
 *
 * `plot.originX` / `originY` put the plot's north-west corner in plan
 * space, where the house's own outer north-west corner is the origin.
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
  return out;
}
