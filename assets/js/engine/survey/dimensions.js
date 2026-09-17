// survey/dimensions.js - what a drawing SAID, against what the model is.
//
// This is the only check in the system that is not the model marking its
// own homework. Everything else asks whether the geometry is internally
// consistent; this asks whether it is true to the documents it was built
// from, by comparing each figure a source printed against the figure the
// geometry computes, and reporting the difference in millimetres.
//
// Three verdicts, and the middle one matters:
//
//   ok         inside a centimetre. The model IS the stated figure.
//   tolerable  inside the tolerance the source's own precision implies -
//              a room measured over plaster, an area printed as "about
//              18", an envelope rounded to one decimal place.
//   check      outside it. Something is wrong, in the model or in the
//              drawing, and nobody should assume which.
//
// A residual is never tuned away. If a stated figure and the geometry
// disagree, both stay on the page.

import { roomArea, roomRects } from '../floorplan.js';
import { grossInternalArea, newExternalWallPlanLength, roofArea } from '../building.js';

const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

/** Default tolerances by what is being measured. A length is judged in
 *  millimetres and an area in square metres, because a centimetre means
 *  something different to each. */
const TOL = {
  length: { ok: 0.01, tolerable: 0.05 },
  area: { ok: 0.25, tolerable: 1.0 },
};
const AREA_KINDS = new Set(['areaM2', 'internalAreaM2']);

const clearSizeOf = (room) => {
  const rects = roomRects(room);
  if (!rects.length) return null;
  const big = rects.reduce((best, q) =>
    ((q[2] - q[0]) * (q[3] - q[1]) > (best[2] - best[0]) * (best[3] - best[1]) ? q : best));
  return [round(big[2] - big[0], 3), round(big[3] - big[1], 3)];
};

/**
 * Resolve one stated figure against the model.
 *
 * Returns null when the entry is about a different stage, so the same
 * statedDimensions array can cover every stage of the building and each
 * stage only answers for itself.
 */
function modelled(entry, b) {
  const [scope, path] = String(entry.of).split(':');
  const [stageId, roomId] = String(path ?? '').split('/');
  if (stageId !== b.stage?.id) return null;

  if (scope === 'room') {
    const room = (b.rooms ?? []).find((r) => r.id === roomId);
    if (!room) return { value: null, missing: `no room "${roomId}" in this stage` };
    if (entry.kind === 'clearSize') return { value: clearSizeOf(room) };
    if (entry.kind === 'areaM2') return { value: round(roomArea(room)) };
    return { value: null, missing: `unknown room measurement "${entry.kind}"` };
  }
  if (scope === 'stage') {
    switch (entry.kind) {
      case 'envelopeWidthM': return { value: b.envelope?.widthM ?? null };
      case 'envelopeDepthM': return { value: b.envelope?.depthM ?? null };
      case 'internalAreaM2': return { value: round(grossInternalArea(b, b) ?? 0) };
      case 'newExternalWallM': return { value: round(newExternalWallPlanLength(b)) };
      case 'roofAreaM2': return { value: round((b.roofs ?? []).reduce((s, r) => s + roofArea(r), 0)) };
      case 'ridgeHeightM': {
        const r = (b.roofs ?? []).reduce((best, q) =>
          (!best || q.ridgeHeight > best.ridgeHeight ? q : best), null);
        return { value: r ? round(r.ridgeHeight, 3) : null };
      }
      default: return { value: null, missing: `unknown stage measurement "${entry.kind}"` };
    }
  }
  return { value: null, missing: `unknown scope "${scope}"` };
}

const deltaOf = (stated, value) => {
  if (Array.isArray(stated)) {
    if (!Array.isArray(value)) return null;
    return Math.max(...stated.map((s, i) => Math.abs(s - value[i])));
  }
  return Math.abs(stated - value);
};

const LABELS = {
  clearSize: 'clear size',
  areaM2: 'floor area',
  internalAreaM2: 'internal floor area',
  envelopeWidthM: 'external width',
  envelopeDepthM: 'external depth',
  ridgeHeightM: 'ridge height',
  newExternalWallM: 'new outer wall, on plan',
  roofAreaM2: 'roof area',
};

/**
 * Every stated figure for the stage on screen, judged.
 *
 * `b` is a composed building (see building.js), so it carries the
 * property's statedDimensions AND the stage's geometry, and the two
 * cannot get out of step.
 */
export function auditDimensions(b) {
  const out = [];
  for (const entry of (b?.statedDimensions ?? [])) {
    const got = modelled(entry, b);
    if (!got) continue;
    const isArea = AREA_KINDS.has(entry.kind);
    const band = isArea ? TOL.area : TOL.length;
    const tolerable = entry.tolerance ?? band.tolerable;
    const delta = got.value == null ? null : deltaOf(entry.value, got.value);
    const status = got.missing ? 'missing'
      : delta == null ? 'missing'
        : delta <= band.ok ? 'ok'
          : delta <= tolerable ? 'tolerable' : 'check';
    out.push({
      of: entry.of,
      kind: entry.kind,
      label: LABELS[entry.kind] ?? entry.kind,
      subject: entry.of.split(':')[1],
      stated: entry.value,
      modelled: got.value,
      delta: delta == null ? null : round(delta, 3),
      // An area delta of 0.32 is not "0 m2", and a length delta of
      // 0.0004m is not "0.0004". Each is shown in the unit a person
      // would actually check it in.
      deltaLabel: delta == null ? null
        : (isArea ? `${round(delta, 2)} m2` : `${Math.round(delta * 1000)} mm`),
      unit: isArea ? 'm2' : 'mm',
      tolerance: tolerable,
      status,
      source: entry.source,
      note: entry.note ?? got.missing ?? null,
    });
  }
  return out;
}

/** How a whole stage reads at a glance, so a banner can say "two of
 *  nineteen need looking at" without the reader opening the table. */
export function auditSummary(rows) {
  const count = (s) => rows.filter((r) => r.status === s).length;
  return {
    total: rows.length,
    ok: count('ok'),
    tolerable: count('tolerable'),
    check: count('check'),
    missing: count('missing'),
    worst: rows.some((r) => r.status === 'check') ? 'check'
      : rows.some((r) => r.status === 'missing') ? 'missing'
        : rows.some((r) => r.status === 'tolerable') ? 'tolerable' : 'ok',
  };
}

/**
 * Floor area, three ways, because the three are different numbers and
 * confusing them is how a house gains ten square metres on paper.
 *
 *   rooms     the sum of the rooms you can stand in
 *   gross     measured inside the external walls, counting partitions -
 *             the figure agents and design studies print
 *   perLevel  the same, level by level
 */
export function auditAreas(b) {
  const levels = (b.levels ?? []).map((level) => {
    const rooms = (b.rooms ?? []).filter((r) => r.level === level.id);
    return {
      level: level.id,
      name: level.name,
      rooms: rooms.map((r) => ({
        id: r.id, name: r.name, areaM2: round(roomArea(r)), clearSize: clearSizeOf(r),
      })).sort((x, y) => y.areaM2 - x.areaM2),
      roomsM2: round(rooms.reduce((s, r) => s + roomArea(r), 0)),
    };
  }).filter((l) => l.rooms.length);
  return {
    levels,
    roomsM2: round(levels.reduce((s, l) => s + l.roomsM2, 0)),
    grossInternalM2: round(grossInternalArea(b, b) ?? 0),
    grossInternalSqFt: Math.round((grossInternalArea(b, b) ?? 0) * 10.7639),
  };
}
