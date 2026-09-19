// planner/palette.js - the model's colours, read off the document.
//
// Colour lives in tokens.css and nowhere else, so the 3D view follows
// the theme instead of carrying a second palette that drifts from the
// first. Tokens are oklch, which three.js does not parse, so each one is
// round-tripped through the browser's own colour engine.

import { THREE } from '../../engine/model3d.js';

function tokenColour(name, fallback) {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!raw) return new THREE.Color(fallback);
    const probe = document.createElement('span');
    probe.style.color = raw;
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    const m = /rgba?\(([^)]+)\)/.exec(resolved);
    if (!m) return new THREE.Color(fallback);
    const [r, g, b] = m[1].split(',').map((s) => parseFloat(s) / 255);
    return new THREE.Color(r, g, b);
  } catch {
    return new THREE.Color(fallback);
  }
}

export function palette() {
  const t = tokenColour;
  return {
    external: t('--plan-external', 0xb08265),
    internal: t('--plan-internal', 0xe6e0d8),
    party: t('--plan-external', 0xb08265),
    wallNew: t('--plan-wall-new-face', 0xdfe2ea),
    roof: t('--plan-roof', 0x3d4552),
    built: t('--plan-built', 0xe0d9cd),
    furniture: t('--plan-furniture', 0xefe9df),
    furnitureFixed: t('--plan-furniture-fixed', 0xd6e2e8),
    pot: t('--plan-built', 0xe0d9cd),
    floor: t('--plan-floor', 0xd9cfc2),
    glass: t('--plan-glass', 0x9fc4d8),
    garageDoor: t('--plan-internal', 0xefebe2),
    marker: t('--accent', 0x2f6f4f),
    labelBg: t('--paper-raised', 0xffffff),
    labelInk: t('--ink', 0x22241f),
    markerSoft: t('--accent-edge', 0x9fc0ae),
    sky: t('--paper-sunken', 0xf3f0ea),
    ground: t('--plan-ground', 0xdfe3d6),
    // Joinery. A door and a window are the two things in a house whose
    // size the eye actually knows, so they are the two worth colouring
    // apart from the wall they sit in.
    ceiling: t('--plan-ceiling', 0xf4f2ed),
    lining: t('--plan-lining', 0xf6f4ef),
    frame: t('--plan-lining', 0xf4f2ed),
    leaf: t('--plan-leaf', 0xc9a877),
    leafRail: t('--plan-leaf-rail', 0xd7bb92),
    ironmongery: t('--plan-ironmongery', 0x8b8f96),
    boundary: t('--plan-boundary', 0x4f8a5e),
  };
}
