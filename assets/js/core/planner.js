// planner.js - the 3D view of the building. Owns a canvas, a camera and
// an orbit control, and nothing else.
//
// Loaded ONLY when the reader asks for the 3D view. three.js is 670KB,
// and making every visitor to the House page download it to look at a
// floor plan they can already read would be a poor trade. The page
// imports this module dynamically for that reason.
//
// Colour comes from the same CSS tokens the floor plan uses, read off
// the document at build time, so the model follows the theme instead of
// carrying a second palette that drifts from the first.

import { buildModel, THREE } from '../engine/model3d.js';
import { OrbitControls } from '../../vendor/OrbitControls.js';

/** Resolve a token to a three.js colour. Tokens are oklch, which
 *  three.js does not parse, so they are round-tripped through the
 *  browser's own colour engine first. */
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

function palette() {
  return {
    external: tokenColour('--plan-external', 0xb08265),
    internal: tokenColour('--plan-internal', 0xe6e0d8),
    party: tokenColour('--plan-external', 0xb08265),
    wallNew: tokenColour('--plan-wall-new', 0x2c3342),
    roof: tokenColour('--plan-roof', 0x3d4552),
    built: tokenColour('--plan-built', 0xe0d9cd),
    furniture: tokenColour('--plan-furniture', 0xefe9df),
    furnitureFixed: tokenColour('--plan-furniture-fixed', 0xd6e2e8),
    pot: tokenColour('--plan-built', 0xe0d9cd),
    floor: tokenColour('--plan-floor', 0xd9cfc2),
    glass: tokenColour('--plan-glass', 0x9fc4d8),
    garageDoor: tokenColour('--plan-internal', 0xefebe2),
    marker: tokenColour('--accent', 0x2f6f4f),
    labelBg: tokenColour('--paper-raised', 0xffffff),
    labelInk: tokenColour('--ink', 0x22241f),
    markerSoft: tokenColour('--accent-edge', 0x9fc0ae),
    sky: tokenColour('--paper-sunken', 0xf3f0ea),
    ground: tokenColour('--plan-ground', 0xdfe3d6),
  };
}

export class Planner {
  constructor(canvas) {
    this.canvas = canvas;
    this.pal = palette();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.scene.background = this.pal.sky;

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    // Stop the camera going under the ground: a house seen from below is
    // disorienting and tells you nothing.
    this.controls.maxPolarAngle = Math.PI / 2.05;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f80, 1.6));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
    sun.position.set(-22, 30, 18);
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshLambertMaterial({ color: this.pal.ground }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    this.scene.add(ground);

    this._running = false;
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  /** Where the camera is now, so a rebuild can put it back. Switching
   *  floors tears the model down and builds it again; snapping the view
   *  back to the default angle every time would make the two levels
   *  impossible to compare. */
  cameraState() {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
    };
  }

  setModel(building, placements, restore, opts = {}) {
    if (this.model) this.scene.remove(this.model.root);
    this.model = buildModel(building, placements, this.pal, opts);
    this.scene.add(this.model.root);
    this.showRoof(this.roofOn ?? true);
    this.showFurniture(this.furnitureOn ?? true);

    if (restore?.position && restore?.target) {
      this.camera.position.fromArray(restore.position);
      this.controls.target.fromArray(restore.target);
      this.controls.update();
      this.resize();
      return;
    }

    // Frame the building from its own size rather than guessing a
    // camera position, so a bigger or smaller house both arrive
    // filling the view: back off far enough that the widest span fits
    // the vertical field of view, with a margin for the labels.
    const s = this.model.fullSize ?? this.model.size;
    const span = Math.max(s.x, s.z, s.y, 4);
    const fov = (this.camera.fov * Math.PI) / 180;
    const dist = (span / 2) / Math.tan(fov / 2) * 1.05;
    const k = dist / Math.sqrt(3);
    const mid = this.model.centre?.y ?? s.y / 2;
    this.camera.position.set(k, mid + k * 0.85, k);
    this.controls.target.set(0, mid, 0);
    this.controls.update();
    this.resize();
  }

  /** Show one level, or all of them. Hiding the upper floor is how you
   *  look into the ground floor without a cutaway. */
  showLevel(levelId) {
    if (!this.model) return;
    this.levelId = levelId;
    for (const key of ['levelGroups', 'markerGroups', 'furnitureGroups']) {
      for (const [id, g] of Object.entries(this.model[key])) {
        g.visible = !levelId || id === levelId;
      }
    }
    if (!this.furnitureOn) this.showFurniture(false);
    this.applyRoof();
  }

  /**
   * The roof off is how you look down into the house. It is on by
   * default because the roof is most of what the outside of this
   * building is, and half the point of the model is checking it.
   *
   * It also follows the level filter. Looking at the ground floor with
   * the first floor hidden and the roof still on gives you a roof
   * hovering two and a half metres above nothing, which reads as a bug
   * rather than as a cutaway.
   */
  showRoof(on) {
    this.roofOn = on;
    this.applyRoof();
  }

  applyRoof() {
    if (!this.model) return;
    const onTop = !this.levelId || this.levelId === this.model.topLevelId;
    this.model.roofGroup.visible = !!this.roofOn && onTop;
  }

  /** Furniture off leaves the empty shell without changing variant. The
   *  variant is still the honest way to see an empty house; this is for
   *  looking past the sofa at the wall behind it. */
  showFurniture(on) {
    this.furnitureOn = on;
    if (!this.model) return;
    for (const [id, g] of Object.entries(this.model.furnitureGroups)) {
      g.visible = on && (!this.levelId || id === this.levelId);
    }
  }

  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this._running) return;
    this._running = true;
    const tick = () => {
      if (!this._running) return;
      this._frame = requestAnimationFrame(tick);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  stop() {
    this._running = false;
    if (this._frame) cancelAnimationFrame(this._frame);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
