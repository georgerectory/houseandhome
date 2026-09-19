// planner/viewer.js - the 3D view. Owns a canvas, two cameras and the
// mode switch between them, and nothing else.
//
// ORBIT is the dollhouse: turn the model around and look into it.
// WALK is eye height inside it, which is the only view that answers
// "can I actually get past that" honestly.
//
// Both cameras look at the same model, so switching modes never rebuilds
// anything - and the walk camera starts wherever the orbit camera was
// pointing, so you step into the room you were already looking at.
//
// PLAN SPACE IS THE FRAME OF RECORD. The model maps plan (x, y) to world
// (x, h, y) - see engine/model3d/geom.js, where the sign of that last
// term is load-bearing. Everything below works in plan metres and
// converts at the edge, so a position here means the same thing it means
// on the floor plan.

import { buildModel, THREE } from '../../engine/model3d.js';
import { OrbitControls } from '../../../vendor/OrbitControls.js';
import {
  resolveCollision, climbAt, stepFrom, headingName,
  EYE_HEIGHT, WALK_SPEED, RUN_MULTIPLIER,
} from '../../engine/walk.js';
import { palette } from './palette.js';
import { destinations, resolvePlace, spawnPlace } from './places.js';
import { WalkInput } from './input.js';

/** Where the named viewpoints stand, as a compass bearing and a height
 *  above the horizon. Front is the road, because that is the view a
 *  person has of a house before they ever go in, and it is the one the
 *  floor plan is drawn to match. */
export const VIEWPOINTS = [
  { id: 'front', name: 'Front', bearing: 180, tilt: 0.34 },
  { id: 'back', name: 'Garden', bearing: 0, tilt: 0.34 },
  { id: 'west', name: 'West', bearing: 270, tilt: 0.34 },
  { id: 'east', name: 'East', bearing: 90, tilt: 0.34 },
  { id: 'above', name: 'Above', bearing: 180, tilt: 1.30 },
];

export class Planner {
  constructor(canvas) {
    this.canvas = canvas;
    this.pal = palette();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.scene.background = this.pal.sky;

    this.orbitCam = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    // A wider lens indoors: 50 degrees in a 3.3m room feels like looking
    // down a tube, and you cannot see a doorway beside you.
    this.walkCam = new THREE.PerspectiveCamera(74, 1, 0.05, 200);

    this.controls = new OrbitControls(this.orbitCam, canvas);
    this.controls.enableDamping = true;
    // Stop the camera going under the ground: a house seen from below is
    // disorienting and tells you nothing.
    this.controls.maxPolarAngle = Math.PI / 2.05;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xbfb5a6, 1.5));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
    sun.position.set(-22, 30, 18);
    this.scene.add(sun);
    // A ceiling faces straight DOWN, so the only thing lighting it is
    // the hemisphere's ground colour - and an unlit plaster ceiling
    // reads as a dark lid pressing on the room. This weak upward light
    // stands in for the bounce off a real floor. It matters only once
    // there are ceilings to light, which is to say only inside.
    const bounce = new THREE.DirectionalLight(0xfffaf2, 0.55);
    bounce.position.set(8, -24, -10);
    this.scene.add(bounce);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshLambertMaterial({ color: this.pal.ground }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    this.scene.add(ground);

    this.mode = 'orbit';
    this.yaw = Math.PI;
    this.pitch = 0;
    this.walkLevel = null;
    this.walkElevation = 0;
    this.origin = { x: 0, y: 0 };
    this._clock = new THREE.Clock();
    this._running = false;

    this.input = new WalkInput(canvas, {
      isWalking: () => this.mode === 'walk',
      onLook: (dx, dy, gain) => this._look(dx, dy, gain),
      onStick: (s) => this.onStick?.(s),
    });

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  /** Where the camera is now, so a rebuild can put it back. Switching
   *  floors tears the model down and builds it again; snapping the view
   *  back to the default angle every time would make the two levels
   *  impossible to compare. */
  cameraState() {
    return {
      position: this.orbitCam.position.toArray(),
      target: this.controls.target.toArray(),
      mode: this.mode,
      walk: { yaw: this.yaw, pitch: this.pitch, level: this.walkLevel, pos: this.walkPlan() },
    };
  }

  setModel(building, placements, restore, opts = {}) {
    if (this.model) this.scene.remove(this.model.root);
    this.building = building;
    this.model = buildModel(building, placements, this.pal, opts);
    this.scene.add(this.model.root);
    // The model is centred on the origin, so plan metres and world
    // metres differ by this offset and by nothing else.
    this.origin = { x: -this.model.root.position.x, y: -this.model.root.position.z };
    this.showRoof(this.roofOn ?? true);
    this.showFurniture(this.furnitureOn ?? true);
    this.showMarkers(this.markersOn ?? true);
    this.showCeilings(this.ceilingsOn ?? true);
    this.showPlot(this.plotOn ?? false);

    if (restore?.position && restore?.target) {
      this.orbitCam.position.fromArray(restore.position);
      this.controls.target.fromArray(restore.target);
      this.controls.update();
      this.resize();
      return;
    }
    this.viewpoint('front');
  }

  /**
   * Stand the orbit camera at a named compass bearing.
   *
   * Framed from what is ACTUALLY ON SCREEN, not from the whole building:
   * with the roof hidden and one floor showing, framing to the full box
   * - which includes a 7.7m ridge - aims the camera at empty sky and
   * leaves the house in the bottom of the frame.
   */
  viewpoint(id) {
    const v = VIEWPOINTS.find((p) => p.id === id) ?? VIEWPOINTS[0];
    const box = this.visibleBox();
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const at = sphere.center;
    // Fit to the bounding sphere against the NARROWER of the two field
    // of view angles. A phone held upright gives a tall thin canvas
    // whose horizontal angle is much smaller than the vertical one, and
    // sizing to the vertical angle alone cuts the width of the house
    // off the sides of the frame.
    const vfov = (this.orbitCam.fov * Math.PI) / 180;
    const aspect = Math.max(0.2, (this.canvas.clientWidth || 1) / (this.canvas.clientHeight || 1));
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const dist = (Math.max(sphere.radius, 2) / Math.sin(Math.min(vfov, hfov) / 2)) * 0.98;
    const rad = (v.bearing * Math.PI) / 180;
    const mid = at.y;
    // Bearing is where the camera STANDS, as a compass direction from
    // the house: 180 is due south, which is the road.
    this.orbitCam.position.set(
      at.x + Math.sin(rad) * dist * Math.cos(v.tilt),
      mid + dist * Math.sin(v.tilt),
      at.z - Math.cos(rad) * dist * Math.cos(v.tilt),
    );
    this.controls.target.set(at.x, mid, at.z);
    this.controls.update();
    this.viewpointId = v.id;
    this.resize();
  }

  /** The box round everything currently visible, so the framing follows
   *  what has been switched off rather than what exists. */
  visibleBox() {
    const box = new THREE.Box3();
    if (!this.model) return box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(10, 8, 10));
    for (const key of ['levelGroups', 'furnitureGroups']) {
      for (const g of Object.values(this.model[key])) if (g.visible) box.expandByObject(g);
    }
    if (this.model.roofGroup.visible) box.expandByObject(this.model.roofGroup);
    // The boundary counts as visible geometry ONLY when it is switched
    // on, and then it decides the frame: the point of turning it on is
    // to see the house in its plot, and a camera still fitted to the
    // house leaves 40m of plot running off both sides of the picture
    // with no way to tell how much of it you are missing.
    if (this.model.plotGroup?.visible) box.expandByObject(this.model.plotGroup);
    if (box.isEmpty()) box.expandByObject(this.model.root);
    return box;
  }

  /** ORBIT or WALK. Entering the walkthrough drops the walker at the
   *  front door if there is one, because that is where a person starts. */
  setMode(mode) {
    this.mode = mode;
    this.controls.enabled = mode === 'orbit';
    if (mode === 'walk') {
      this.stand(spawnPlace(this.building));
    } else {
      this.input.release();
    }
    // THIS IS NOT OPTIONAL. The orbit view shows one storey at a time;
    // the walkthrough must show the whole building, or you climb the
    // stairs into an empty sky. Without this line the level filter set
    // for the orbit view survives into the walk and you see one floor.
    this.applyVisibility();
    this.resize();
    this.onMode?.(mode);
  }

  /** Everywhere the walkthrough can put you, for the picker. */
  walkDestinations() { return destinations(this.building); }

  /** Stand somewhere named. False for an id it does not know, so a
   *  stale option cannot silently teleport you nowhere. */
  goTo(id) {
    const at = resolvePlace(this.building, id);
    if (!at) return false;
    this.stand(at);
    return true;
  }

  /** Apply a resolved place to the walk camera. */
  stand(at) {
    this.walkLevel = at.level;
    this.walkElevation = at.elevation;
    this.setWalkPlan(at.x, at.y);
    this.yaw = at.yaw;
    this.pitch = at.pitch ?? 0;
  }

  walkPlan() {
    return [this.walkCam.position.x + this.origin.x, this.walkCam.position.z + this.origin.y];
  }

  setWalkPlan(px, py) {
    this.walkCam.position.x = px - this.origin.x;
    this.walkCam.position.z = py - this.origin.y;
    this.walkCam.position.y = this.walkElevation + EYE_HEIGHT;
  }

  /**
   * Turn the head.
   *
   * Drag right, look right; drag up, look up. That is how a first-person
   * view works everywhere else and it is what a hand expects. The
   * opposite - drag right and the world comes with you - is the map
   * convention, and using it here made the controls feel broken.
   *
   * There was a switch for the other convention. It is gone: once this
   * way round is right, the switch is only a way to set it wrong.
   */
  _look(dx, dy, gain) {
    this.yaw += dx * gain;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - dy * gain));
  }

  _stepWalk(dt) {
    const { forward, strafe, hurrying } = this.input.axes();
    this.walkCam.rotation.set(0, 0, 0);
    this.walkCam.rotateY(-this.yaw);
    this.walkCam.rotateX(this.pitch);

    const distance = WALK_SPEED * (hurrying ? RUN_MULTIPLIER : 1) * dt;
    const [dx, dy] = stepFrom(this.yaw, forward, strafe, distance);
    let [px, py] = this.walkPlan();
    if (dx || dy) {
      [px, py] = resolveCollision(this.model?.colliders, this.walkLevel, px + dx, py + dy);
    }

    // The stair is a ramp, and which floor's walls you bump into follows
    // your height rather than a button you had to remember to press.
    const stair = climbAt(this.model?.climbs, px, py);
    if (stair) {
      this.walkLevel = stair.level;
      this.walkElevation = stair.elevation;
      this.setWalkPlan(px, py);
      this.walkCam.position.y = stair.height + EYE_HEIGHT;
    } else {
      this.setWalkPlan(px, py);
    }
    this.onHeading?.({ yaw: this.yaw, name: headingName(this.yaw), level: this.walkLevel });
  }

  get camera() { return this.mode === 'walk' ? this.walkCam : this.orbitCam; }

  /** Show one level, or all of them. Hiding the upper floor is how you
   *  look into the ground floor without a cutaway. In the walkthrough
   *  every level stays up, because you are inside the building and a
   *  missing floor above you is a hole in the ceiling. */
  showLevel(levelId) {
    this.levelId = levelId;
    this.applyVisibility();
  }

  showRoof(on) { this.roofOn = on; this.applyVisibility(); }
  showFurniture(on) { this.furnitureOn = on; this.applyVisibility(); }
  showMarkers(on) { this.markersOn = on; this.applyVisibility(); }
  showCeilings(on) { this.ceilingsOn = on; this.applyVisibility(); }

  /** The boundary, which changes what the orbit camera has to frame -
   *  so switching it reframes, rather than leaving the plot half off
   *  screen until you happen to pick a viewpoint. The walkthrough is
   *  left alone: you are standing in the house and the boundary is
   *  something you see when you look, not somewhere to be moved to. */
  showPlot(on) {
    const changed = this.plotOn !== on;
    this.plotOn = on;
    this.applyVisibility();
    if (changed && this.mode !== 'walk' && this.viewpointId) this.viewpoint(this.viewpointId);
  }

  applyVisibility() {
    if (!this.model) return;
    const walking = this.mode === 'walk';
    const only = walking ? null : this.levelId;
    for (const [id, g] of Object.entries(this.model.levelGroups)) {
      g.visible = !only || id === only;
    }
    for (const [id, g] of Object.entries(this.model.furnitureGroups)) {
      g.visible = !!this.furnitureOn && (!only || id === only);
    }
    for (const [id, g] of Object.entries(this.model.markerGroups)) {
      g.visible = !!this.markersOn && (!only || id === only);
    }
    // The roof comes off when you are looking at a lower floor from
    // outside, because a roof hovering over nothing reads as a bug.
    const onTop = !only || only === this.model.topLevelId;
    this.model.roofGroup.visible = !!this.roofOn && (walking || onTop);
    // CEILINGS. In the walkthrough they are what stops a room being a
    // roofless box, so they follow the switch. In the orbit view they
    // are a lid over the storey you are looking down into, so they come
    // off whatever the switch says - the switch is about being inside.
    for (const [id, g] of Object.entries(this.model.ceilingGroups ?? {})) {
      g.visible = walking && !!this.ceilingsOn && (!only || id === only);
    }
    if (this.model.plotGroup) this.model.plotGroup.visible = !!this.plotOn;
  }

  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    for (const cam of [this.orbitCam, this.walkCam]) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  }

  start() {
    if (this._running) return;
    this._running = true;
    const tick = () => {
      if (!this._running) return;
      this._frame = requestAnimationFrame(tick);
      // Clamped so a backgrounded tab does not resume with a teleport.
      // 0.25 and not 0.1: the clamp is also a FLOOR on the frame rate
      // the walker moves at full speed, and 0.1 puts that floor at 10fps
      // - which a software renderer drops under, and then walking
      // silently slows to a crawl instead of the picture stuttering.
      const dt = Math.min(this._clock.getDelta(), 0.25);
      if (this.mode === 'walk') this._stepWalk(dt);
      else {
        this.controls.update();
        this.onHeading?.({ yaw: this.orbitYaw(), name: headingName(this.orbitYaw()) });
      }
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  /** Which way the orbit camera is looking, as a plan-space bearing, so
   *  the compass reads the same in both modes. */
  orbitYaw() {
    const dx = this.controls.target.x - this.orbitCam.position.x;
    const dz = this.controls.target.z - this.orbitCam.position.z;
    return Math.atan2(dx, -dz);
  }

  stop() {
    this._running = false;
    if (this._frame) cancelAnimationFrame(this._frame);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.input.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
