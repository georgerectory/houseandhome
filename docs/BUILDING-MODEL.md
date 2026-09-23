# The building model, and the House page

Extracted from CLAUDE.md. Stages, variants, the right-handed frame, the
plot, the hedge, joinery, ceilings, the walkthrough and the equipment
register. Read it before touching anything under
`assets/js/engine/model3d/`, `assets/js/core/planner/` or
`data/buildings/`.

**Stages and variants.** A STAGE is a structural state of the house - as
bought, after the extension - and owns levels, walls, openings, rooms,
stairs, roof, chimneys and features. A VARIANT is a furniture
arrangement belonging to one stage and owns nothing structural. Every
stage has an `empty` variant, so "no furniture" is a real thing you can
inspect and fork rather than a rendering flag.

**A fork is a copy.** A new stage or variant carries `derivedFrom` and a
`changes` narrative, but its geometry is its own: there is no delta to
merge. The narrative is for people; the geometric difference is COMPUTED
by `stageDiff()`, so if somebody writes "adds a bedroom" and the geometry
does not, the diff says so.

**The geometry is repo content, the registry is not.** Walls and rooms
live in `data/buildings/<id>/` because they are drawing data with nothing
private in them, they must be unit-testable from disk with no auth, and
git is a better version history than a table. Supabase holds only
`building_stages` and `building_changes` - the rows a `work_item` can
point at through a `realises` link, so the roadmap can say which jobs
turn one model into the other. The quantities on a change are measured by
`stageDiff()`, never typed, and they are `drafted`: they price nothing.

**Walls are gridlines, rooms are derived.** The spec names a centreline
and a thickness per wall; a room names the four lines that bound it and
its rectangle is computed from their inner faces. A room therefore cannot
drift from its own walls. `tools/build-building.mjs` does that arithmetic
and writes the JSON the site reads; the geometry gate re-runs it and
fails if the committed output has drifted.

**The 3D frame is right-handed, and that is not cosmetic.** Plan space
runs x east and y NORTH TO SOUTH; the model maps plan `(x, y)` to world
`(x, h, y)` in `model3d/geom.js`. Negating that last term makes `+Z`
north, which is LEFT-handed, and a left-handed frame does not fail
loudly - it renders a perfect mirror of the house, and from the garden
side the mirror and the viewpoint cancel out so it still looks right.
That shipped once. `tests/unit/model3d.test.mjs` pins it in arithmetic,
and the 3D view carries a compass for the same reason.

**Nothing in the model is measured.** Every figure is read off a drawing
or derived from one, and each carries the document it came from in
`sources` and `statedDimensions`. The Survey view compares every stated
figure against what the geometry computes and reports the difference in
millimetres. A residual is never absorbed: where a drawing and the model
disagree, both numbers stay on the page.

## The House page

Three views over one model, and a fourth over the figures behind it:
**Plan** (SVG, drawn to scale), **3D** (orbit the house from named
viewpoints), **Walk** (first person, eye height) and **Survey**.

The walkthrough is phone-first. The left two fifths of the view is a
movement stick that appears under the thumb wherever it lands; anywhere
else looks, and DRAG RIGHT LOOKS RIGHT. There was a switch for the other
convention; it is gone, because once this way round is right a switch is
only a way to set it wrong. A keyboard gets pointer lock and WASD. Collision is against
WALLS ONLY - furniture is walked through deliberately, so a sofa can
never trap someone in a corner - and the stair is a ramp derived from
the flight the model already carries, so which floor you are on follows
your feet. The maths is pure and lives in `assets/js/engine/walk.js`; the
input and the cameras are in `assets/js/core/planner/`.

**The walkthrough shows the WHOLE building, every storey at once.** The
orbit view shows one floor at a time and the walkthrough must not: a
level filter that survives the mode switch leaves you climbing the
stairs into an empty sky. `setMode` re-applies visibility for that
reason. You can also stand outside on any of the four sides, and in any
room on any floor, by name - `planner/places.js` is pure and tested.

**A wall reaches the floor above, not its own ceiling.** The ground
floor's ceiling is 2.40 and the first floor starts at 2.70; a wall built
to the ceiling leaves a 300mm band of daylight round the whole building
where the joists are.

**Every room has a ceiling, and the two views want opposite things from
it.** The orbit view looks DOWN into a storey, so a ceiling is a lid
over everything it is there to show; the walkthrough is inside the room,
where a missing ceiling is a roofless box. Same geometry, shown in one
and not the other - `ceilingGroups` per level, switched by mode rather
than by a preference.

**An opening is joinery, not a hole.** A door gets a lined reveal and a
leaf hung at the hinge the spec records, swinging the way it records,
with stiles, rails and a handle; a window gets a cill, head, jambs and a
mullion every 550mm. Without them a doorway is a dark slab and a window
is a tinted rectangle with no scale - and the spec's `swing` field is a
record nobody can check. `model3d/doors.js` owns all of it, and
`tests/unit/doors.test.mjs` pins the hinge rule in arithmetic.

Joinery took the model past 400 boxes, so `geom.js` shares ONE MATERIAL
PER COLOUR. A material per mesh is a GPU state change per draw, and the
walk step is scaled by frame time, so the cost showed up as walking that
crawled rather than as a picture that stuttered.

**The PLOT is a property of the site, not of a stage:** an extension
changes the house, not the boundary. 17.60 x 40.00m, scaled off the
handbook's site plan, with the house anchored by its west and south
faces - the two a setting-out would work from - so the depth residual
falls in the 27m rear garden rather than the 5m front. It is a
switchable layer in all three views and OFF by default, because the plan
has to zoom out to a fifth of its scale to fit it.

**The HEDGE is on the boundary and is the only planting modelled**, at
1.83m high and 0.78m deep. It earns its place because it is not a
surface: it is six feet of solid green, so it decides what you can see
from the garden and whether the west side is a path or a passage. Its
depth is scaled off the site plan and agrees with the handbook's own two
setback statements; its HEIGHT is the owner's figure and nothing else,
recorded as `heightConfidence: 'confirmed'` rather than as an
observation. The plan therefore dimensions each setback twice - to the
line and clear of the hedge - because "2.7m to the boundary" and "1.9m
you can walk down" are different answers to different questions.

Nothing else inside the boundary is modelled: the source also colours in
grass, shrubs, hardstanding and sheds, every one traced off an aerial to
plus or minus a metre or two, and drawing those beside walls measured
off a floor plan would dress an estimate as a survey. The hedge is NOT a
collider either - the walkthrough stops against walls only, and the
viewpoint that stands you in front of the house is further out than the
front boundary, so a solid hedge would put you outside your own plot
with a wall in the way.

**The equipment register belongs to the household, not to a building.**
Its `plan_x_m` / `plan_y_m` were authored against whatever building was
modelled at the time, and they do not travel: a freezer at x 15.4 was in
a garage this house does not have, and 15.4 is seven metres past its
east wall. `place()` rejects a coordinate outside the building's
envelope - `state: 'foreign'` - so nothing is drawn for it and no grid
reference is computed. If its ROOM exists here it falls back to the room
centre, marked `coordsFrom: 'other-building'`. A reference printed from
a coordinate belonging to another house is a measurement that never
happened.

Every layer of the drawing can be switched off from one Display panel -
room names, sizes, furniture, furniture names, equipment pins, door
swings, dimensions, grid, the circulation overlay, roof, glazing, door
leaves, ceilings and the plot boundary - and the choice is remembered. A toggle NEVER repaints the page: it would
close the panel, lose the camera and, in the walkthrough, put you back at
the front door.
