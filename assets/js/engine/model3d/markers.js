// model3d/markers.js - the register, on the model.
//
// A marker sits at exactly the coordinates the floor plan drew it at, so
// the cooker is in the same spot in both. An INFERRED position is marked
// differently and floats higher, because it means "somewhere in this
// room" and a solid pin at a precise spot would claim more than is
// known.

import { v, THREE } from './geom.js';

/**
 * A label that always faces the camera, drawn on a canvas texture.
 *
 * A marker you cannot identify is a dot. The whole point of putting the
 * cooker in the model is being able to see that it IS the cooker, in the
 * same square the plan and the register put it in, so the name and the
 * grid reference travel with the marker.
 */
export function buildLabel(text, sub, palette) {
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

export function buildMarker(p, building, palette) {
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
