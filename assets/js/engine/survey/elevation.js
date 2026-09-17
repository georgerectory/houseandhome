// survey/elevation.js - the building drawn from outside, from the same
// numbers the plan and the model use.
//
// A plan cannot tell you whether the ridge is at the right height, where
// the chimneys come through the roof, or whether the front has the
// windows the photograph has. An elevation can, and one GENERATED from
// the model is the only kind worth having here: if it disagrees with the
// design study's drawing or with the photograph, the model is wrong, and
// that is exactly the thing this is for.
//
// Drawing space is metres, like everything else: x across the elevation,
// y UP from ground level. The SVG flips y once, at the end, so the
// numbers in this file read the way a person thinks about a building.

import { roomsOn, roomRects, levels, featuresOn, wallThickness } from '../floorplan.js';
import { escape } from '../../core/format.js';

const n = (v) => (Object.is(Number(v), -0) ? '0' : Number(v).toFixed(3).replace(/\.?0+$/, '')) || '0';

export const SIDES = [
  { id: 'south', label: 'Front, from Ameysford Road' },
  { id: 'north', label: 'Back, from the garden' },
  { id: 'west', label: 'West side, towards Pine Close' },
  { id: 'east', label: 'East side, towards No. 46' },
];

/**
 * How one side of the building maps onto a flat drawing.
 *
 * Looking at a face, the horizontal axis of the drawing is the plan axis
 * ACROSS your view, and which way round it runs depends on which side
 * you are standing on. Getting that backwards mirrors the house, which
 * looks almost right and puts the chimney on the wrong end.
 */
function frame(side, envelope) {
  const w = envelope?.widthM ?? 0;
  const d = envelope?.depthM ?? 0;
  switch (side) {
    case 'south': return { span: w, depth: d, axis: 'x', to: (x) => x, near: (y) => d - y };
    case 'north': return { span: w, depth: d, axis: 'x', to: (x) => w - x, near: (y) => y };
    case 'west': return { span: d, depth: w, axis: 'y', to: (y) => y, near: (x) => x };
    case 'east': return { span: d, depth: w, axis: 'y', to: (y) => d - y, near: (x) => w - x };
    default: return null;
  }
}

/** The stretches of a level that exist, projected across the view. The
 *  as-bought house is an L, so its side elevations step. */
function levelSpans(building, levelId, f) {
  const rects = roomsOn(building, levelId).flatMap(roomRects);
  if (!rects.length) return [];
  const t = building.defaults?.wallExternal ?? 0.23;
  // Expand by the wall thickness AFTER mapping into view space. Two of
  // the four views run the plan axis backwards, and adding the thickness
  // before the flip shrinks the building by half a wall at each end
  // instead of growing it.
  const raw = rects.map((q) => {
    const pair = f.axis === 'x' ? [f.to(q[0]), f.to(q[2])] : [f.to(q[1]), f.to(q[3])];
    pair.sort((a, b) => a - b);
    return [pair[0] - t, pair[1] + t];
  });
  raw.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 0.001) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

/** The roof, seen from one side. Along the ridge you see a trapezoid (a
 *  gable shows as a full-width rectangle); across it you see the gable
 *  or hip triangle. */
function roofPoly(roof, f) {
  const eaves = roof.eavesHeight;
  const ridge = roof.ridgeHeight;
  const over = roof.over;
  const [a1, a2] = f.axis === 'x'
    ? [f.to(over[0]), f.to(over[2])].sort((p, q) => p - q)
    : [f.to(over[1]), f.to(over[3])].sort((p, q) => p - q);
  const acrossPlan = f.axis === 'x' ? over[3] - over[1] : over[2] - over[0];
  const alongPlan = f.axis === 'x' ? over[2] - over[0] : over[3] - over[1];
  const ridgeRunsAcrossView = (roof.ridgeAxis === 'x') === (f.axis === 'x');

  if (ridgeRunsAcrossView) {
    // Looking at the long slope. A hip pulls the ridge in by the same
    // run each end; a gable does not pull it in at all.
    const inset = roof.kind === 'hipped' ? acrossPlan / 2 : 0;
    return [[a1, eaves], [a1 + inset, ridge], [a2 - inset, ridge], [a2, eaves]];
  }
  // Looking at the end: a triangle either way, hipped or gabled.
  const mid = (a1 + a2) / 2;
  return [[a1, eaves], [mid, ridge], [a2, eaves], ...(alongPlan ? [] : [])];
}

/** Openings on the wall that faces the viewer: the ones whose wall sits
 *  on this side of the envelope and runs across the view. */
function openingsFacing(building, f, side) {
  const out = [];
  for (const o of (building.openings ?? [])) {
    const wall = (building.walls ?? []).find((w) => w.id === o.wall);
    if (!wall || wall.kind !== 'external') continue;
    const horizontal = Math.abs(wall.a[1] - wall.b[1]) < 0.001;
    const runsAcross = (f.axis === 'x') === horizontal;
    if (!runsAcross) continue;
    const constant = horizontal ? wall.a[1] : wall.a[0];
    if (f.near(constant) > wallThickness(wall, building)) continue;
    const level = levels(building).find((l) => l.id === wall.level);
    if (!level) continue;
    const [ux, uy] = [(wall.b[0] - wall.a[0]), (wall.b[1] - wall.a[1])];
    const len = Math.hypot(ux, uy) || 1;
    const cx = wall.a[0] + (ux / len) * o.at;
    const cy = wall.a[1] + (uy / len) * o.at;
    const centre = f.to(f.axis === 'x' ? cx : cy);
    const d = building.defaults ?? {};
    const head = o.head ?? (o.type === 'door' ? d.doorHeight : d.windowHead);
    const sill = o.sill ?? (o.type === 'window' ? d.windowSill : 0);
    out.push({
      id: o.id,
      type: o.type,
      x1: centre - o.width / 2,
      x2: centre + o.width / 2,
      y1: level.elevation + sill,
      y2: level.elevation + head,
    });
  }
  return out;
}

/**
 * One elevation as SVG. Class-driven, so it themes with everything else,
 * and dimensioned in metres so it can be printed to scale and measured.
 */
export function elevationSvg(building, side, opts = {}) {
  const f = frame(side, building.envelope);
  if (!f) return '<p class="notice">That is not a side of the building.</p>';
  const top = Math.max(
    ...(building.roofs ?? []).map((r) => r.ridgeHeight ?? 0),
    ...(building.chimneys ?? []).map((c) => c.topHeight ?? 0),
    building.defaults?.eavesHeight ?? 5,
  );
  const PAD = 0.6;
  const height = top + PAD * 2;
  const label = SIDES.find((s) => s.id === side)?.label ?? side;
  const title = opts.title ?? `${building.name}: ${label}`;

  // y is measured UP from the ground in this file and DOWN in SVG, so
  // one flip here saves a subtraction on every coordinate above.
  const up = (v) => n(height - PAD - v);

  // Each storey's brickwork runs from its own floor to the next floor -
  // or to the eaves for the top one - so the floor structure between
  // them is walled rather than left as a stripe of sky.
  const ordered = [...(building.levels ?? [])].sort((a, b) => a.elevation - b.elevation);
  const walls = ordered.flatMap((level, i) => {
    const bottom = level.elevation;
    const above = ordered[i + 1];
    const topOf = above ? above.elevation : (building.defaults?.eavesHeight ?? top);
    return levelSpans(building, level.id, f).map(([a, b]) =>
      `<rect class="el-wall" x="${n(a)}" y="${up(topOf)}"
        width="${n(b - a)}" height="${n(topOf - bottom)}"></rect>`);
  }).join('');

  const roofs = (building.roofs ?? []).map((r) => {
    const pts = roofPoly(r, f).map(([a, h]) => `${n(a)},${up(h)}`).join(' ');
    return `<polygon class="el-roof el-roof--${escape(r.kind)}" points="${pts}"></polygon>`;
  }).join('');

  const stacks = (building.chimneys ?? []).map((c) => {
    const [a1, a2] = (f.axis === 'x'
      ? [f.to(c.footprint[0]), f.to(c.footprint[2])]
      : [f.to(c.footprint[1]), f.to(c.footprint[3])]).sort((p, q) => p - q);
    const base = building.defaults?.eavesHeight ?? 5;
    return `<rect class="el-stack" x="${n(a1)}" y="${up(c.topHeight)}"
      width="${n(a2 - a1)}" height="${n(c.topHeight - base + 0.4)}"></rect>`;
  }).join('');

  const porches = (building.levels ?? []).flatMap((level) =>
    featuresOn(building, level.id).filter((x) => x.kind === 'porch').map((x) => {
      const [a1, a2] = (f.axis === 'x'
        ? [f.to(x.rect[0]), f.to(x.rect[2])]
        : [f.to(x.rect[1]), f.to(x.rect[3])]).sort((p, q) => p - q);
      const outward = f.near(f.axis === 'x' ? x.rect[3] : x.rect[2]);
      if (outward > 0.1) return '';
      return `<rect class="el-porch" x="${n(a1)}" y="${up(x.height)}"
        width="${n(a2 - a1)}" height="${n(x.height)}"></rect>`;
    })).join('');

  const holes = openingsFacing(building, f, side).map((o) =>
    `<rect class="el-opening el-opening--${escape(o.type)}" x="${n(o.x1)}" y="${up(o.y2)}"
      width="${n(o.x2 - o.x1)}" height="${n(o.y2 - o.y1)}"></rect>`).join('');

  return `<svg class="el" viewBox="${n(-PAD)} 0 ${n(f.span + PAD * 2)} ${n(height)}"
    preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escape(title)}">
    <title>${escape(title)}</title>
    ${roofs}${walls}${porches}${holes}${stacks}
    <line class="el-ground" x1="${n(-PAD)}" y1="${up(0)}" x2="${n(f.span + PAD)}" y2="${up(0)}"></line>
  </svg>`;
}
