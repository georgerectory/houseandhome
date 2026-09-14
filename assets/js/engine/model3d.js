// model3d.js - turn the building model into three.js geometry.
//
// Takes data, returns groups. No DOM, no state, no fetch. The viewer
// owns the canvas; this owns the shapes.
//
// Plan space is metres with y running front to back, and the drawing
// uses the same numbers. World space is three.js's, where y is UP, so
// plan (x, y) maps to world (x, height, -y). That single mapping is the
// only place the two frames meet, and it lives in v() below.
//
// The wall-splitting algorithm is ported from the planner this system is
// modelled on: a wall is cut around each opening, with the piece under
// the sill and the piece over the head kept, so a window is a hole in a
// wall rather than a panel stuck on one.
//
// Colour does not belong in geometry, so every material takes its colour
// from the palette the viewer passes in - which reads it from the same
// tokens the floor plan uses, and so follows the theme.

import * as THREE from '../../vendor/three.module.min.js';

const v = (x, h, y) => new THREE.Vector3(x, h, -y);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function box(w, h, d, color, opts = {}) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({
      color,
      transparent: opts.opacity !== undefined,
      opacity: opts.opacity ?? 1,
    }),
  );
}

/** A box laid along a plan-space segment: the length of the segment, the
 *  given thickness across it, rotated to match its bearing. */
function segmentBox(a, b, thickness, base, height, color, opts) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len <= 0.001 || height <= 0.001) return null;
  const mesh = box(len, height, thickness, color, opts);
  mesh.position.copy(v((a[0] + b[0]) / 2, base + height / 2, (a[1] + b[1]) / 2));
  mesh.rotation.y = Math.atan2(dy, dx);
  return mesh;
}

/**
 * One wall, split around its openings.
 *
 * `at` is the distance to an opening's CENTRE, so a 0.74m door recorded
 * at 4.85 runs 4.48 to 5.22. The same rule the floor plan uses, because
 * they are reading one number.
 */
function buildWall(wall, openings, level, defaults, palette) {
  const meshes = [];
  const thickness = wall.kind === 'internal' ? defaults.wallInternal
    : wall.kind === 'party' ? defaults.wallParty : defaults.wallExternal;
  const color = palette[wall.kind] ?? palette.internal;
  const base = level.elevation;
  const top = wall.height ?? level.ceilingHeight;
  const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  if (!len) return meshes;

  const mine = openings
    .filter((o) => o.wall === wall.id)
    .map((o) => ({ ...o, start: o.at - o.width / 2, end: o.at + o.width / 2 }))
    .sort((x, y) => x.start - y.start);

  let cursor = 0;
  for (const o of mine) {
    const s = Math.max(0, o.start);
    const e = Math.min(len, o.end);
    if (s / len > cursor) {
      meshes.push(segmentBox(lerp(wall.a, wall.b, cursor), lerp(wall.a, wall.b, s / len),
        thickness, base, top, color));
    }
    // An opening may carry its own sill and head; the defaults cover the
    // common case of a window at cill height and a door to the floor.
    const head = o.head ?? (o.type === 'garage' ? defaults.garageDoorHeight
      : o.type === 'door' ? defaults.doorHeight : defaults.windowHead);
    const sill = o.sill ?? (o.type === 'window' ? defaults.windowSill : 0);
    const pa = lerp(wall.a, wall.b, s / len);
    const pb = lerp(wall.a, wall.b, e / len);
    if (sill > 0) meshes.push(segmentBox(pa, pb, thickness, base, sill, color));
    if (top > head) meshes.push(segmentBox(pa, pb, thickness, base + head, top - head, color));
    if (o.type === 'window') {
      const glass = segmentBox(pa, pb, thickness * 0.25, base + sill, head - sill,
        palette.glass, { opacity: 0.32 });
      if (glass) meshes.push(glass);
    } else if (o.type === 'garage') {
      meshes.push(segmentBox(pa, pb, thickness * 0.4, base, head, palette.garageDoor));
    }
    cursor = e / len;
  }
  if (cursor < 1) {
    meshes.push(segmentBox(lerp(wall.a, wall.b, cursor), wall.b, thickness, base, top, color));
  }
  return meshes.filter(Boolean);
}

/** A room's floor slab, sitting just under the level it belongs to. */
function buildFloor(room, level, defaults, palette) {
  const [x1, y1, x2, y2] = room.rect;
  const w = x2 - x1;
  const dpt = y2 - y1;
  if (w <= 0 || dpt <= 0) return null;
  const t = defaults.floorThickness ?? 0.3;
  const slab = box(w, t, dpt, palette.floor);
  slab.position.copy(v((x1 + x2) / 2, level.elevation - t / 2, (y1 + y2) / 2));
  return slab;
}

/**
 * A label that always faces the camera, drawn on a canvas texture.
 *
 * A marker you cannot identify is a dot. The whole point of putting the
 * cooker in the model is being able to see that it IS the cooker, in the
 * same square the plan and the register put it in, so the name and the
 * grid reference travel with the marker.
 */
function buildLabel(text, sub, palette) {
  const PAD = 12;
  const SIZE = 34;
  const SUB = 26;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = `600 ${SIZE}px system-ui, sans-serif`;
  const wMain = ctx.measureText(text).width;
  ctx.font = `${SUB}px ui-monospace, monospace`;
  const wSub = sub ? ctx.measureText(sub).width : 0;
  const w = Math.ceil(Math.max(wMain, wSub) + PAD * 2);
  const h = Math.ceil(SIZE + (sub ? SUB + 6 : 0) + PAD * 2);
  canvas.width = w;
  canvas.height = h;

  ctx.fillStyle = `#${palette.labelBg.getHexString()}`;
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 10);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = `#${palette.labelInk.getHexString()}`;
  ctx.font = `600 ${SIZE}px system-ui, sans-serif`;
  ctx.fillText(text, w / 2, PAD);
  if (sub) {
    ctx.fillStyle = `#${palette.marker.getHexString()}`;
    ctx.font = `${SUB}px ui-monospace, monospace`;
    ctx.fillText(sub, w / 2, PAD + SIZE + 4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false,
  }));
  // Sized in metres so a label reads the same whatever the house.
  const scale = 0.0042;
  sprite.scale.set(w * scale, h * scale, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * A marker for one placed thing, at exactly the coordinates the floor
 * plan drew it at - so the cooker is in the same spot in both.
 *
 * An INFERRED position is marked differently and floats higher, because
 * it means "somewhere in this room" and a solid pin at a precise spot
 * would claim more than is known.
 */
function buildMarker(p, building, palette) {
  const level = (building.levels ?? []).find((l) => l.id === p.level);
  if (!level || p.x == null) return null;
  const inferred = p.state === 'inferred';
  const geom = inferred
    ? new THREE.OctahedronGeometry(0.17)
    : new THREE.SphereGeometry(0.15, 20, 14);
  const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({
    color: inferred ? palette.markerSoft : palette.marker,
    transparent: inferred,
    opacity: inferred ? 0.65 : 1,
  }));
  mesh.position.copy(v(p.x, level.elevation + (inferred ? 1.5 : 1.1), p.y));
  mesh.userData.label = p.thing?.name ?? '';
  mesh.userData.ref = p.fullRef ?? '';
  mesh.userData.inferred = inferred;

  // A stem to the floor, so a marker reads as standing at a point on the
  // plan rather than floating at an unknown one.
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, mesh.position.y - level.elevation, 6),
    new THREE.MeshLambertMaterial({ color: palette.markerSoft }),
  );
  stem.position.copy(v(p.x, level.elevation + (mesh.position.y - level.elevation) / 2, p.y));

  const group = new THREE.Group();
  group.add(stem, mesh);

  const label = buildLabel(p.thing?.name ?? '', p.fullRef ?? '', palette);
  if (label) {
    label.position.copy(v(p.x, mesh.position.y + 0.42, p.y));
    group.add(label);
  }
  group.userData = mesh.userData;
  return group;
}

/**
 * Build the whole model.
 *
 * Returns the root group plus a group per level, so the viewer can hide
 * the first floor to look into the ground floor without rebuilding
 * anything, and a markers group per level for the same reason.
 */
export function buildModel(building, placements = [], palette) {
  const root = new THREE.Group();
  const defaults = building.defaults ?? {};
  const levelGroups = {};
  const markerGroups = {};

  for (const level of building.levels ?? []) {
    const g = new THREE.Group();
    g.name = `level-${level.id}`;
    for (const room of (building.rooms ?? []).filter((r) => r.level === level.id)) {
      const f = buildFloor(room, level, defaults, palette);
      if (f) g.add(f);
    }
    for (const wall of (building.walls ?? []).filter((w) => w.level === level.id)) {
      for (const m of buildWall(wall, building.openings ?? [], level, defaults, palette)) g.add(m);
    }
    levelGroups[level.id] = g;
    root.add(g);

    const mg = new THREE.Group();
    mg.name = `markers-${level.id}`;
    for (const p of placements.filter((q) => q.level === level.id && q.x != null)) {
      const m = buildMarker(p, building, palette);
      if (m) mg.add(m);
    }
    markerGroups[level.id] = mg;
    root.add(mg);
  }

  // Centre the model on the origin so orbiting turns around the house
  // rather than around a corner of it. Measured from the STRUCTURE
  // alone: a label sprite sticks out well past the wall it sits behind,
  // and letting one drag the centre sideways would put the house off
  // axis for the sake of a caption.
  const bbox = new THREE.Box3();
  for (const g of Object.values(levelGroups)) bbox.expandByObject(g);
  const centre = bbox.getCenter(new THREE.Vector3());
  root.position.x = -centre.x;
  root.position.z = -centre.z;

  return { root, levelGroups, markerGroups, size: bbox.getSize(new THREE.Vector3()) };
}

export { THREE };
