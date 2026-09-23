// 48 Ameysford Road - the authored source of the building model.
//
// READ THIS BEFORE CHANGING A NUMBER.
//
// Nothing here is surveyed. Every figure is read off one of three
// documents - the agent's floor plan, a design study for the extension,
// and the listing photograph - or derived from them by the arithmetic
// written into `derivation` below. The house has not been bought. So
// each figure carries where it came from, and the Survey view reports
// every place the model and a document disagree rather than averaging
// them into something that looks tidy and is not true.
//
// THE DRAWINGS DECIDE THE LAYOUT. Every room, wall, door, window and
// piece of furniture below was measured off the source drawings at
// high magnification and mapped onto this grid; `docs/SOURCE-FIDELITY.md`
// is the checklist it was built to. Where a door opens onto something,
// or a room cannot be crossed, that is REPORTED by the Survey view and
// the geometry gate - it is never quietly corrected, because a drawing
// edited to pass its own checker tells you nothing.
//
// THE SET-OUT. Walls are GRIDLINES: a centreline and a thickness. A room
// names the four lines that bound it and its rectangle is computed from
// their inner faces, so a room can never drift from its own walls. The
// generator (tools/build-building.mjs) does that arithmetic; this file
// only states where the lines are and why.
//
// PLAN SPACE. Metres. x runs west to east, y runs NORTH to SOUTH, so the
// drawing comes out with the garden at the top and Ameysford Road at the
// bottom - the same way round as both source drawings. The origin is the
// outer north-west corner of the finished square.
//
// SPANS ARE ORDERED north-to-south and west-to-east throughout, so a
// door's `swing.hinge` of 'a' always means its north or west jamb and
// 'b' always means its south or east one. Nothing enforces that but this
// comment, and a door hinged on the wrong side is a real error.

// --- The shell, in one place ----------------------------------------
//
// Solved from the room dimensions the agent's plan prints, against the
// envelope the design study states. Every number below is used, not
// decorative: change one and the rooms move with it.

const T_EXT = 0.23;        // solid brick, 9in. Assumed - see assumptions.
const T_INT = 0.13;        // half-brick or stud, plastered both sides.
const W_ENV = 8.20;        // external width, stated by the design study.
const D_ENV = 7.72;        // external depth, DERIVED - see derivation.

// Gridline positions, west to east.
const X = {
  wMain: T_EXT / 2,                    // 0.115  west external wall
  wWing: 2.480,                        //        rear wing, west wall
  eWing: 5.720,                        //        rear wing, east wall
  eMain: W_ENV - T_EXT / 2,            // 8.085  east external wall
  hallW: 3.555,                        //        hall, west side
  hallE: 4.555,                        //        hall, east side
  bed1E: 3.625,                        //        bedroom 1, east side
  landE: 4.565,                        //        landing / stairwell, east side
  wcE: 1.510,                          //        WC, east side (extension)
  bed3E: 2.515,                        //        bedroom 3, east side (extension)
  bathE: 4.220,                        //        bathroom, east side (extension)
};

// Gridline positions, north to south.
const Y = {
  extN: T_EXT / 2,                     // 0.115  north (garden) external wall
  mainN: 3.485,                        //        original main block, rear wall
  extS: D_ENV - T_EXT / 2,             // 7.605  front wall, Ameysford Road
  stairS: 6.300,                       //        stairwell, south end (as bought)
  wcS: 1.140,                          //        WC, south side (extension)
  ensN: 2.020,                         //        en-suite, north side (extension)
  landN: 2.730,                        //        landing, north side (extension)
};

const ext = (at, opts = {}) => ({ at, t: T_EXT, kind: 'external', provenance: 'existing', ...opts });
const int = (at, opts = {}) => ({ at, t: T_INT, kind: 'internal', provenance: 'existing', ...opts });

// Both storeys, both stages. The elevations are inferred from the roof,
// not measured - see the `storey-heights` assumption.
const LEVELS = [
  { id: 'ground', name: 'Ground floor', code: 'G', elevation: 0, ceilingHeight: 2.40 },
  { id: 'first', name: 'First floor', code: '1', elevation: 2.70, ceilingHeight: 2.30 },
];
const EAVES = 5.00;

export const building = {
  id: '48-ameysford-road',
  name: '48 Ameysford Road',
  addressLine: '48 Ameysford Road, Ferndown',
  status: 'considering',
  bought: false,
  surveyed: false,
  defaultStage: 'as-bought',
  note: 'A candidate property, not a purchase. No offer has been accepted and no survey has been done. Every dimension in this model is read off a drawing or derived from one, so none of it may size a real job or order a real material until it is measured on site.',
  orientation: {
    planUpIs: 'north',
    street: 'Ameysford Road',
    note: 'The front door faces south onto Ameysford Road; the garden is north. Pine Close is to the west, No. 46 to the east.',
  },
  grid: { cell: 1.0, originX: 0, originY: 0 },
  defaults: {
    wallExternal: T_EXT,
    wallInternal: T_INT,
    wallParty: 0.3,
    floorThickness: 0.3,
    doorHeight: 1.98,
    doorWidth: 0.83,
    windowSill: 0.9,
    windowHead: 2.05,
    garageDoorHeight: 2.13,
    eavesHeight: EAVES,
    roofPitchDeg: 35,
  },
  envelope: { widthM: W_ENV, depthM: D_ENV },

  // THE PLOT. Where the house sits in its boundary, and nothing else:
  // no hardstanding, no hedge, no shed, no planting. Those are surface
  // areas, they are traced off aerial photographs to plus or minus a
  // metre or two, and drawing them would dress an estimate up as a
  // survey. The boundary alone answers the question worth asking -
  // which side has room, and how much.
  //
  // Measured off the handbook's site plan (page 8), which is drawn to
  // scale and carries its own bar: the boundary rectangle is 904 x 2056
  // pixels at 51.4 px/m, which is 17.59 x 40.00m against a stated
  // 17.6 x 40. The house's outer faces on the same drawing sit 2.70m
  // from the west boundary, 6.61 from the east, 26.92 from the north
  // and 4.91 from the south - and those four plus the footprint sum to
  // the stated plot in both directions, so the drawing is consistent
  // with itself.
  //
  // The house is anchored by its WEST and SOUTH faces, because those
  // are the two a setting-out would work from: the Pine Close hedge and
  // the road frontage. The depth residual (see the `depth` derivation)
  // therefore lands in the rear garden, which is 27m long and where
  // 280mm is nothing, rather than in the 5m front garden, where it is
  // not.
  plot: {
    widthM: 17.60,
    depthM: 40.00,
    // The plot's north-west corner in plan space, where the house's own
    // outer north-west corner is the origin.
    originX: -2.70,
    originY: -27.37,
    confidence: 'drafted',
    source: 'design-study',
    note: 'Boundary approximate. The handbook marks it "Boundary (approx.)" and says garden outlines are traced from aerial photographs to plus or minus one to two metres, to be refined against the title plan and a tape. It is a rectangle here because that is how the source draws it; the aerial on page 27 shows the real boundary is not quite square.',
    neighbours: {
      west: 'Pine Close',
      east: 'No. 46',
      north: 'Garage and outbuilding range, then Pine Close homes',
      south: 'Ameysford Road',
    },
    // THE HEDGE, which is the boundary as you actually meet it. The line
    // is a survey abstraction; the hedge is the thing that stops the
    // view, casts the shade and decides whether the west side is a path
    // or a passage.
    //
    // Its DEPTH is measured: the site plan draws a laurel band just
    // inside the boundary and it scans 0.76 to 0.80m thick down both
    // sides and along the front. That reconciles with the stated
    // setbacks from two directions at once - the handbook says about 2m
    // from the house to the Pine Close hedge against a boundary measured
    // at 2.70, and 5.8m to the east hedge against a boundary at 6.61 -
    // so 0.78 is taken from three independent readings that agree.
    //
    // Its HEIGHT is the owner's: six feet, 1.83m. No source states it
    // and nobody has measured it. It is recorded as the owner's figure
    // rather than as an observation, and at 1.83 it stands 210mm above
    // eye height, so you cannot see over it from the garden. That is the
    // point of modelling it.
    //
    // The source draws the hedge on the WEST, EAST and SOUTH only: the
    // north end carries the rear hardstanding and the gate onto Pine
    // Close, with a shrub mass rather than a run of laurel. It is
    // modelled on all four sides because the owner asked for a
    // surrounding hedge, and the north run is therefore the owner's
    // intent, not the drawing's record.
    hedge: {
      heightM: 1.83,
      depthM: 0.78,
      heightConfidence: 'confirmed',
      depthConfidence: 'researched',
      sides: ['west', 'east', 'south', 'north'],
      species: 'Laurel',
      note: 'Six feet is the owner\'s figure, not a measurement. The depth is scaled off the site plan\'s laurel band and agrees with the handbook\'s own two setback statements. Nothing here is surveyed.',
    },
  },

  sources: [
    {
      id: 'agent-plan',
      kind: 'floor_plan',
      label: "Estate agent's floor plan, as the house stands",
      confidence: 'researched',
      supplies: ['room clear sizes to the centimetre', 'room adjacency', 'window, door and stair positions', 'fireplaces and sanitaryware'],
    },
    {
      id: 'design-study',
      kind: 'concept',
      label: 'Layout study: final version without right extensions',
      confidence: 'drafted',
      supplies: ['post-extension layout', 'room areas', 'envelope', 'roof form and ridge height', 'internal floor area', 'every piece of furniture in the furnished variant'],
      note: 'The study labels itself a concept, not a design, and its own legend says the windows are indicative. Its figures are approximate by its own admission.',
    },
    {
      id: 'listing-photo',
      kind: 'photograph',
      label: 'Listing photograph, front and west elevation',
      confidence: 'researched',
      supplies: ['window count and arrangement', 'chimney positions', 'porch', 'gable roof form'],
    },
  ],

  // What a source SAID, before this model existed. The audit compares
  // each of these against what the geometry computes, and reports the
  // difference in millimetres. This array is the reason the Survey view
  // can be trusted: it is not the model checking itself.
  statedDimensions: [
    { of: 'room:as-bought/dining', kind: 'clearSize', value: [3.26, 3.89], source: 'agent-plan' },
    { of: 'room:as-bought/lounge', kind: 'clearSize', value: [3.35, 3.87], source: 'agent-plan' },
    { of: 'room:as-bought/kitchen', kind: 'clearSize', value: [3.01, 3.14], source: 'agent-plan' },
    { of: 'room:as-bought/bed1', kind: 'clearSize', value: [3.33, 3.91], source: 'agent-plan' },
    { of: 'room:as-bought/bed2', kind: 'clearSize', value: [3.34, 3.87], source: 'agent-plan' },
    { of: 'room:as-bought/bathroom', kind: 'clearSize', value: [2.97, 3.13], source: 'agent-plan' },

    { of: 'room:post-extension/kitchen-diner', kind: 'areaM2', value: 18, source: 'design-study', note: 'The study drew the house 8.0m deep and the agent measured it 7.72. The kitchen-diner runs the full width, so it takes the whole of that 280mm difference: at 8.0m deep it would be 18.4. The depth residual is the reason, not the room.' },
    { of: 'room:post-extension/snug', kind: 'areaM2', value: 13, source: 'design-study' },
    { of: 'room:post-extension/living', kind: 'areaM2', value: 13, source: 'design-study' },
    { of: 'room:post-extension/boot', kind: 'areaM2', value: 5, source: 'design-study' },
    { of: 'room:post-extension/master', kind: 'areaM2', value: 13, source: 'design-study' },
    { of: 'room:post-extension/bed1', kind: 'areaM2', value: 13, source: 'design-study' },
    { of: 'room:post-extension/office', kind: 'areaM2', value: 8, source: 'design-study' },
    { of: 'room:post-extension/bed3', kind: 'areaM2', value: 7, source: 'design-study' },
    { of: 'room:post-extension/bathroom', kind: 'areaM2', value: 4, source: 'design-study' },

    { of: 'stage:post-extension', kind: 'envelopeWidthM', value: 8.2, source: 'design-study' },
    { of: 'stage:post-extension', kind: 'envelopeDepthM', value: 8.0, source: 'design-study', tolerance: 0.3, note: 'Stated in a headline AND drawn: scaling the study\'s first-floor plan against its own 8.20m width gives 8.00 exactly. The model builds 7.72 from the agent\'s measured rooms. See the depth derivation - this is a 280mm question that only a tape settles.' },
    { of: 'stage:post-extension', kind: 'internalAreaM2', value: 112, source: 'design-study' },
    { of: 'stage:post-extension', kind: 'ridgeHeightM', value: 7.8, source: 'design-study', tolerance: 0.12 },
    { of: 'stage:post-extension', kind: 'newExternalWallM', value: 12, source: 'design-study', tolerance: 1.5 },
    { of: 'stage:as-bought', kind: 'ridgeHeightM', value: 6.5, source: 'design-study', tolerance: 0.12, note: 'Stated indirectly: the new ridge is about 1.3m higher than the existing one.' },
  ],
};

// --- The arithmetic, written down so it can be checked ---------------

const DERIVATION = [
  {
    id: 'width',
    question: 'How wide is the hall?',
    working: `${T_EXT} + 3.26 + ${T_INT} + hall + ${T_INT} + 3.35 + ${T_EXT} = ${W_ENV}`,
    result: 'hall = 0.87',
    residualMm: 16,
    note: 'The two front rooms and the envelope are both stated; the hall is what is left. Scaling the agent\'s plan directly gives 0.886, so the residual is 16mm. 0.87m is narrow and entirely ordinary for a cottage of this age.',
  },
  {
    id: 'depth',
    question: 'How deep is the building?',
    working: `${T_EXT} + 3.14 (kitchen) + ${T_EXT} (shared wall) + 3.89 (front rooms) + ${T_EXT} = 7.72`,
    result: 'depth = 7.72, against a stated 8.00',
    residualMm: 280,
    note: 'The model is built at 7.72 because the agent\'s plan is the only MEASURED source and 7.72 is what its own room sizes add up to. The design study states 8.0 and draws 8.00 exactly - scaling its first-floor plan against its own stated 8.20 width gives 8.00 to the millimetre - but it is a concept whose legend calls its own windows indicative. CORRECTION: an earlier version of this derivation claimed the study\'s 112 square metre floor area corroborated 7.72, on the reading that the area deducted 0.46 for the walls. The handbook states the study\'s actual formula - (width - 0.6) x (depth - 0.6) x 2 - and on that formula 112 follows from 8.00, not from 7.72. So the floor area is not independent evidence at all: it is computed from the depth, and it agrees with the study, not with the agent. The case for 7.72 now rests on the agent\'s measurements alone, where it is still the stronger one: the study\'s stated snug width of 3.25 matches the agent\'s measured 3.26 to a centimetre, while its stated depth of 4.10 exceeds the agent\'s measured 3.89 by 210mm - the same residual, in the same direction, in a single room. The 280mm is reported, not absorbed.',
  },
  {
    id: 'eaves',
    question: 'How high are the eaves, and therefore the storeys?',
    working: 'hipped roof at 35 deg over a 7.72m depth rises 3.86 x tan35 = 2.70; stated ridge 7.8 - 2.70 = 5.10, and the existing gabled roof over a 4.35m span rises 2.175 x tan35 = 1.52',
    result: `eaves = ${EAVES}, existing ridge 6.52, new ridge 7.70`,
    residualMm: 100,
    note: 'Setting the eaves at 5.00 makes the existing ridge 6.52 and the new one 7.70 - a rise of 1.18 against a stated "about 1.3", and a new ridge 100mm under the stated 7.8. Both inside the tolerance the study\'s own "about" implies. The eaves then has to carry 0.15 slab + 2.40 + 0.30 joists + 2.30 = 5.15, so the ceiling heights are the figures with the least evidence behind them.',
  },
  {
    id: 'wing-position',
    question: 'Where does the rear wing sit across the width?',
    working: 'kitchen clear 3.01 + two 0.23 walls = 3.47 outer, centred on 8.20/2 = 4.10, so the centrelines fall at 2.480 and 5.720',
    result: 'wing centrelines 2.480 and 5.720; outer faces 2.365 and 5.835',
    residualMm: 73,
    note: 'The agent\'s plan does not dimension this, but scaling it puts the wing\'s centre at about 4.17 - 73mm east of the house\'s centre. The design study\'s ground-floor plan puts the original brickwork between 2.50 and 5.71, which straddles a centred wing. The model centres it, and the 73mm is the residual.',
  },
  {
    id: 'office-window',
    question: 'Where does the office\'s north window go?',
    working: 'the study draws it from 5.06 to 6.61; the same study\'s ground-floor plan puts the join between the wing\'s original brickwork and the new work at 5.71',
    result: 'modelled east of the join, at 5.88 to 7.33',
    residualMm: 820,
    note: 'The study\'s two plans disagree with each other: its first floor ends the existing brickwork at about 5.04, its ground floor at 5.71. The wing is two storeys, so the brickwork cannot end in two places. The window is put east of the join, where it can be built, and the 820mm shift is recorded here rather than hidden.',
  },
];

const SHARED_ASSUMPTIONS = [
  { id: 'wall-external', severity: 'medium', note: `External walls modelled at ${T_EXT}m solid brick. Not measured. A cavity wall on the new work would be nearer 0.30m, which would take about 70mm off each new room; modelling everything at ${T_EXT} is what reconciles with the design study's own floor-area figure.` },
  { id: 'wall-internal', severity: 'low', note: `Internal partitions modelled at ${T_INT}m. Not measured.` },
  { id: 'storey-heights', severity: 'medium', note: 'Ceiling heights of 2.40 and 2.30 are inferred from the roof, not measured. They are the weakest numbers in the model and everything vertical rests on them.' },
  { id: 'wing-offset', severity: 'high', note: 'The rear wing\'s position across the width is derived from the kitchen\'s stated clear size and centred on the envelope, because neither drawing dimensions it. If the wing is in fact offset, the boot room and the kitchen-diner both change size.' },
  { id: 'openings', severity: 'medium', note: 'Window and door widths and positions are scaled off the drawings, not dimensioned on any of them. They are scaled, not invented: every one of them was measured off the source at magnification, and the design study\'s own legend says its windows are indicative.' },
  { id: 'stairs', severity: 'medium', note: 'A straight flight run north from the hall, 0.77m wide, 13 risers at 0.2077 with a 0.215 going. Both drawings show the flight and neither dimensions it; 0.77 is what fits between the hall walls below and the stairwell walls above, which do not line up.' },
  { id: 'chimneys', severity: 'medium', note: 'Both breasts are 1.44m along the gable and project 0.45m, scaled off the agent\'s plan, which draws them as solid blocks on the west and east walls of the front rooms. Stack heights are scaled off the photograph. THE TOPS ARE MODELLED AS THEY SHOULD BE BUILT, not as they are: each stack gets a crown oversailing 50mm with its pots seated in it, because that is how a chimney sheds water. Neither listing photograph shows a sound crown on either stack - the east one, which serves the living room and the master, reads as an open brick top with the pots sitting on it. That is a survey job, not a modelling decision, and it is on the backlog.' },
  { id: 'hall-is-not-a-passage', severity: 'high', note: 'The hall derives to 0.87m wide and the flight needs 0.77 of it, so for 2.58 of the hall\'s 3.89m there is no way past the stair. The agent\'s plan draws the kitchen door at the head of the hall anyway, AND a second cased opening straight from the lounge into the kitchen, which is presumably the door anyone actually uses. The clearance check reports the hall as impassable because as drawn it is. Either the hall is wider than the arithmetic says, or there is a step under the flight, or the lounge is the route. Measure it.' },
  { id: 'depth-residual', severity: 'high', note: 'The building is modelled 7.72m deep, from the agent\'s measured rooms. The design study states 8.0 and draws 8.00. Its floor-area figure is computed from its own depth and so corroborates nothing. Every room\'s north-south dimension carries this 280mm: at 8.00 the snug would be 4.04 deep against the agent\'s measured 3.89. Until someone measures it, this is the single biggest open question in the model.' },
  { id: 'landing-is-narrow', severity: 'high', note: 'The landing\'s west arm - the run past the bathroom and office doors to bedroom 3 - is 0.575m clear, because it is set out between a 0.13 partition and the old rear wall at 0.23. The study draws it at about 0.72, but it draws every wall thinner than this model builds them. Bedroom 3\'s door is the whole of that end, so it is 0.575 wide too, which is not a buildable door. Either the partition moves north or bedroom 3 loses some depth. Reported, not corrected.' },
  { id: 'plot-boundary', severity: 'medium', note: 'The plot is modelled as a 17.60 x 40.00m rectangle, scaled off the handbook\'s site plan, which labels it "Boundary (approx.)" and warns that outlines are traced from aerial photographs to plus or minus one to two metres. The setbacks it gives - 2.70 west, 6.61 east, 26.92 north, 4.91 south - sum to the stated plot in both directions, so the drawing is at least self-consistent. The house is anchored by its west and south faces, so the depth residual falls in the rear garden. No surface inside the boundary is modelled.' },
];

// --- Stage one: the house as it stands -------------------------------
//
// Every line below is the agent's plan and nothing else. Notably: the
// hall is a corridor that runs the full depth, from the front door past
// the stair and on into the kitchen; the kitchen is ALSO entered from
// the lounge through a cased opening; there is no window in any gable
// and none in the wing's west wall; and upstairs bedroom 1 wraps round
// the south end of the stairwell, which bedroom 2 does not.

const asBought = {
  id: 'as-bought',
  name: 'Day one - as bought',
  sequence: 10,
  status: 'existing',
  summary: 'The house as the agent\'s plan draws it: three rooms down, three up, a rear kitchen wing under its own roof, and a gabled main roof with a chimney on each gable.',
  derivation: DERIVATION.filter((d) => d.id !== 'office-window'),
  assumptions: SHARED_ASSUMPTIONS,
  levels: LEVELS,

  grid: {
    ground: {
      x: {
        'w-main': ext(X.wMain, { span: ['main-n', 'ext-s'] }),
        'w-wing': ext(X.wWing, { span: ['n-wing', 'main-n'] }),
        'e-wing': ext(X.eWing, { span: ['n-wing', 'main-n'] }),
        'e-main': ext(X.eMain, { span: ['main-n', 'ext-s'] }),
        'hall-w': int(X.hallW, { span: ['main-n', 'ext-s'] }),
        'hall-e': int(X.hallE, { span: ['main-n', 'ext-s'] }),
      },
      y: {
        'n-wing': ext(Y.extN, { span: ['w-wing', 'e-wing'] }),
        'main-n': ext(Y.mainN, { span: ['w-main', 'e-main'], note: 'The original main block\'s rear wall. External either side of the wing, and the wall the wing is built against.' }),
        'ext-s': ext(Y.extS, { span: ['w-main', 'e-main'] }),
      },
    },
    first: {
      x: {
        'w-main': ext(X.wMain, { span: ['main-n', 'ext-s'] }),
        'w-wing': ext(X.wWing, { span: ['n-wing', 'main-n'] }),
        'e-wing': ext(X.eWing, { span: ['n-wing', 'main-n'] }),
        'e-main': ext(X.eMain, { span: ['main-n', 'ext-s'] }),
        'bed1-e': int(X.bed1E, { span: ['main-n', 'stair-s'], note: 'Stops at the stairwell\'s south end: below that line bedroom 1 continues east under the foot of the flight.' }),
        'land-e': int(X.landE, { span: ['main-n', 'ext-s'] }),
      },
      y: {
        'n-wing': ext(Y.extN, { span: ['w-wing', 'e-wing'] }),
        'main-n': ext(Y.mainN, { span: ['w-main', 'e-main'] }),
        'stair-s': int(Y.stairS, { span: ['bed1-e', 'land-e'] }),
        'ext-s': ext(Y.extS, { span: ['w-main', 'e-main'] }),
      },
    },
  },

  rooms: [
    { id: 'dining', level: 'ground', name: 'Dining Room', roomKey: 'dining', roomType: 'dining', bounds: { w: 'w-main', e: 'hall-w', n: 'main-n', s: 'ext-s' } },
    { id: 'hall', level: 'ground', name: 'Hallway', roomKey: 'hallway', roomType: 'hallway', bounds: { w: 'hall-w', e: 'hall-e', n: 'main-n', s: 'ext-s' } },
    { id: 'lounge', level: 'ground', name: 'Lounge', roomKey: 'lounge', roomType: 'living', bounds: { w: 'hall-e', e: 'e-main', n: 'main-n', s: 'ext-s' } },
    { id: 'kitchen', level: 'ground', name: 'Kitchen', roomKey: 'kitchen', roomType: 'kitchen', bounds: { w: 'w-wing', e: 'e-wing', n: 'n-wing', s: 'main-n' } },

    { id: 'bed1', level: 'first', name: 'Bedroom 1', roomKey: 'bedroom', roomType: 'bedroom', rects: [
      { w: 'w-main', e: 'bed1-e', n: 'main-n', s: 'ext-s' },
      // The foot of the flight has a floor over it, and that floor is
      // bedroom 1's: the agent's plan draws no wall between them.
      { w: 'bed1-e', e: 'land-e', n: 'stair-s', s: 'ext-s' },
    ] },
    { id: 'landing', level: 'first', name: 'Landing', roomType: 'landing', bounds: { w: 'bed1-e', e: 'land-e', n: 'main-n', s: 'stair-s' } },
    { id: 'bed2', level: 'first', name: 'Bedroom 2', roomKey: 'bedroom', roomType: 'bedroom', bounds: { w: 'land-e', e: 'e-main', n: 'main-n', s: 'ext-s' } },
    { id: 'bathroom', level: 'first', name: 'Bathroom', roomKey: 'bathroom', roomType: 'bathroom', bounds: { w: 'w-wing', e: 'e-wing', n: 'n-wing', s: 'main-n' } },
  ],

  openings: [
    // GROUND. One window in the wing's north wall, one in its east wall
    // with the back door below it, and three in the front wall. No gable
    // window on either side, and none in the wing's west wall.
    { id: 'g-win-kitchen-n', level: 'ground', axis: 'y', line: 'n-wing', x: 4.20, width: 0.76, type: 'window' },
    { id: 'g-win-kitchen-e', level: 'ground', axis: 'x', line: 'e-wing', y: 1.235, width: 1.07, type: 'window' },
    { id: 'g-door-back', level: 'ground', axis: 'x', line: 'e-wing', y: 2.69, width: 0.70, type: 'door', leaf: 'single', swing: { hinge: 'b', toward: 'west' }, note: 'Back door in the wing\'s east wall, opening into the kitchen.' },
    { id: 'g-door-kitchen', level: 'ground', axis: 'y', line: 'main-n', x: 3.99, width: 0.78, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'north' }, note: 'Off the head of the hall, hinged west and opening into the kitchen.' },
    { id: 'g-open-kitchen-lounge', level: 'ground', axis: 'y', line: 'main-n', x: 5.01, width: 0.755, type: 'door', leaf: 'cased', note: 'A second way into the kitchen, straight out of the lounge\'s north-west corner. The agent\'s plan draws the jambs and no leaf.' },
    { id: 'g-win-dining-s', level: 'ground', axis: 'y', line: 'ext-s', x: 1.795, width: 1.09, type: 'window' },
    { id: 'g-door-front', level: 'ground', axis: 'y', line: 'ext-s', x: 4.015, width: 0.75, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'north' } },
    { id: 'g-win-lounge-s', level: 'ground', axis: 'y', line: 'ext-s', x: 6.275, width: 1.29, type: 'window' },
    { id: 'g-door-dining', level: 'ground', axis: 'x', line: 'hall-w', y: 6.95, width: 0.78, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'west' } },
    { id: 'g-door-lounge', level: 'ground', axis: 'x', line: 'hall-e', y: 6.98, width: 0.73, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'east' } },

    // FIRST. Three windows in the front wall, one in the wing's east
    // wall, and nothing in either gable or the wing's north wall.
    { id: 'f-win-bathroom-e', level: 'first', axis: 'x', line: 'e-wing', y: 1.82, width: 0.90, type: 'window', sill: 1.35 },
    { id: 'f-door-bathroom', level: 'first', axis: 'y', line: 'main-n', x: 4.065, width: 0.75, type: 'door', leaf: 'single', swing: { hinge: 'b', toward: 'north' } },
    { id: 'f-door-bed1', level: 'first', axis: 'x', line: 'bed1-e', y: 3.94, width: 0.78, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'west' } },
    { id: 'f-door-bed2', level: 'first', axis: 'x', line: 'land-e', y: 3.96, width: 0.78, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'east' } },
    { id: 'f-win-bed1-s', level: 'first', axis: 'y', line: 'ext-s', x: 1.85, width: 0.92, type: 'window' },
    { id: 'f-win-bed1-foot-s', level: 'first', axis: 'y', line: 'ext-s', x: 4.11, width: 0.64, type: 'window', note: 'Lights the part of bedroom 1 that sits over the foot of the stair.' },
    { id: 'f-win-bed2-s', level: 'first', axis: 'y', line: 'ext-s', x: 6.33, width: 0.90, type: 'window' },
  ],

  stairs: [{
    id: 'main-stair',
    level: 'ground',
    from: 'hall',
    to: 'landing',
    footprint: [3.69, 4.28, 4.46, 6.86],
    upperVoid: [3.69, 4.28, 4.46, 6.30],
    direction: '-y',
    width: 0.77,
    risers: 13,
    rise: 0.2077,
    going: 0.215,
    winders: 0,
    note: '13 risers at 0.2077 make the 2.70m storey height exactly; 12 goings at 0.215 make the 2.58m run. The void stops at 6.30 because that is where the agent\'s first-floor plan stops it, leaving the foot of the flight under bedroom 1\'s floor with about 2.08m of headroom.',
  }],

  roofs: [
    { id: 'roof-main', kind: 'gabled', over: [0, 3.37, W_ENV, D_ENV], ridgeAxis: 'x', pitchDeg: 35, eavesHeight: EAVES, overhang: 0.3, covering: 'plain tile', provenance: 'existing' },
    { id: 'roof-wing', kind: 'gabled', over: [2.365, 0, 5.835, 3.37], ridgeAxis: 'y', pitchDeg: 35, eavesHeight: EAVES, overhang: 0.3, covering: 'plain tile', provenance: 'existing' },
  ],

  chimneys: [
    { id: 'chimney-w', footprint: [0, 5.16, 0.56, 6.06], topHeight: 7.5, pots: 2, provenance: 'existing', note: 'West gable. Serves the dining room and bedroom 1 fireplaces.' },
    { id: 'chimney-e', footprint: [7.64, 5.16, W_ENV, 6.06], topHeight: 7.5, pots: 2, provenance: 'existing', note: 'East gable. Serves the lounge and bedroom 2 fireplaces.' },
  ],

  features: [
    { id: 'breast-dining', level: 'ground', room: 'dining', kind: 'chimney_breast', rect: [0.23, 4.89, 0.68, 6.33], height: 2.40 },
    { id: 'breast-lounge', level: 'ground', room: 'lounge', kind: 'chimney_breast', rect: [7.52, 4.89, 7.97, 6.33], height: 2.40 },
    { id: 'breast-bed1', level: 'first', room: 'bed1', kind: 'chimney_breast', rect: [0.23, 4.89, 0.68, 6.33], height: 2.30 },
    { id: 'breast-bed2', level: 'first', room: 'bed2', kind: 'chimney_breast', rect: [7.52, 4.89, 7.97, 6.33], height: 2.30 },
    { id: 'porch', level: 'ground', room: 'hall', kind: 'porch', rect: [3.445, D_ENV, 4.745, 8.57], height: 2.75, eavesM: 2.05, cheekM: 0.215, overhang: 0.08, note: 'The small tiled gable canopy over the front door in the listing photograph: two brick cheeks and a pitched roof with the apex facing the road, open between them. CENTRED ON THE DOOR at 4.095 - it was set out 80mm west of it before, which is the sort of error nobody sees on a plan and everybody sees on an elevation. 1.30 wide outside, so 0.87 clear between the cheeks, against a 0.79 door. It projects 0.85. Eaves at 2.05, just clear of the 1.98 door head; ridge at 2.75, which the photograph puts well below the first-floor sills. Scaled off the photograph against the door, not dimensioned anywhere.' },
  ],
};

// --- Stage two: after the extension ----------------------------------
//
// Both sides of the rear wing filled in to square the footprint off at
// 8.2 x 7.72. The wing's west wall stays and becomes the boot room's
// east wall; its east wall goes, opening the old kitchen into the new
// east infill to make one kitchen-diner across the whole garden side.
// Upstairs the wing's walls come down and the first floor is re-planned
// round an east-west landing, with the old rear wall removed at the
// stairwell head so the landing can reach it.
//
// The design study is authoritative for every line in this stage.
// Two things it draws are worth naming because they are unusual and
// they are NOT mistakes in this model: the hall is closed off at its
// north end, so the only way from the front door to the kitchen-diner
// is through the living room; and the WC comes out at about one square
// metre. Both are reported by the Survey view.

const NEW = { provenance: 'new' };

const postExtension = {
  id: 'post-extension',
  name: 'After the extension',
  sequence: 20,
  status: 'planned',
  derivedFrom: 'as-bought',
  summary: 'The design study\'s layout: the rear wing kept and filled in both sides to a square 8.2 x 7.72m footprint, one hipped roof over the lot, three bedrooms plus an office, and a kitchen-diner across the whole garden side.',
  derivation: DERIVATION,
  assumptions: [
    ...SHARED_ASSUMPTIONS,
    { id: 'beam-over-kitchen', severity: 'medium', note: 'Removing the wing\'s east wall to make one kitchen-diner needs a beam over a 3.0m span. Assumed, not designed.' },
    { id: 'beam-over-landing', severity: 'high', note: 'The landing runs east-west through what was the rear wall, and the study removes about a metre of it at the stairwell head with the new roof over. Assumed, not designed, and the most consequential structural assumption in this stage.' },
    { id: 'hall-is-a-dead-end', severity: 'high', note: 'The study draws no opening at all between the hall and the kitchen-diner: the hall holds the stair and the two front-room doors and stops at the old rear wall. The only route from the front door to the kitchen is through the living room. That is what the drawing shows and it is what the model builds; whether it is what anyone wants is a question for the owner, not for this file.' },
    { id: 'wc-is-very-small', severity: 'high', note: 'Scaled off the study the WC comes out about 1.21 x 0.85m internally, which is what makes the boot room\'s stated 5 square metres work. A pan needs about 0.7m of depth and a door needs somewhere to go, so as drawn this room does not work. It is modelled as drawn and reported, not enlarged.' },
    { id: 'area-residual', severity: 'low', note: 'Room areas land within about 1 square metre of every figure the design study prints, which is what an "about" figure on a concept drawing should mean. The kitchen-diner is the worst at 16.9 against a stated 18, because the study drew the house 8.0m deep and the agent measured it 7.72. The residuals are listed in the Survey view rather than tuned away.' },
  ],
  changes: [
    'Fill in the west side of the rear wing for a WC and a boot room / utility.',
    'Fill in the east side of the rear wing and remove the wing\'s east wall, making one kitchen-diner across the garden side.',
    'Re-plan the first floor round an east-west landing: a third bedroom over the boot room, the bathroom over the old kitchen, an office and en-suite over the east infill.',
    'Remove about a metre of the main block\'s rear wall at the stairwell head, so the landing can reach the stair.',
    'Carry the stairwell walls through to the front wall, squaring off the corner bedroom 1 used to borrow over the foot of the flight.',
    'Replace both existing roofs with one hipped roof over the whole square: four hips, no valleys.',
    'Raise both chimney stacks through the new side slopes.',
    'Leave the east gable wall, both flues and both fireplaces untouched.',
  ],
  levels: LEVELS,

  grid: {
    ground: {
      x: {
        'w-main': ext(X.wMain, { span: ['ext-n', 'ext-s'], segments: [
          { span: ['ext-n', 'main-n'], suffix: '-new', provenance: 'new' },
          { span: ['main-n', 'ext-s'], suffix: '' },
        ] }),
        'wc-e': int(X.wcE, { span: ['ext-n', 'wc-s'], ...NEW }),
        'w-wing': ext(X.wWing, { span: ['ext-n', 'main-n'], kind: 'internal', note: 'The rear wing\'s original west wall, now internal: it divides the boot room from the kitchen-diner.' }),
        'hall-w': int(X.hallW, { span: ['main-n', 'ext-s'] }),
        'hall-e': int(X.hallE, { span: ['main-n', 'ext-s'] }),
        'e-main': ext(X.eMain, { span: ['ext-n', 'ext-s'], segments: [
          { span: ['ext-n', 'main-n'], suffix: '-new', provenance: 'new' },
          { span: ['main-n', 'ext-s'], suffix: '' },
        ] }),
      },
      y: {
        'ext-n': ext(Y.extN, { span: ['w-main', 'e-main'], segments: [
          { span: ['w-main', 'w-wing'], suffix: '-w', provenance: 'new' },
          { span: ['w-wing', 'e-wing-line'], suffix: '', note: 'The rear wing\'s original north wall, kept.' },
          { span: ['e-wing-line', 'e-main'], suffix: '-e', provenance: 'new' },
        ] }),
        'wc-s': int(Y.wcS, { span: ['w-main', 'wc-e'], ...NEW }),
        'main-n': ext(Y.mainN, { span: ['w-main', 'e-main'], kind: 'internal', note: 'Now wholly internal: the kitchen-diner is on its north side along its whole length.' }),
        'ext-s': ext(Y.extS, { span: ['w-main', 'e-main'] }),
      },
      // A line that carries no wall, only a position: the old wing's east
      // wall is removed, but the north wall still has to be told where the
      // existing brickwork stops and the new work starts.
      marks: { 'e-wing-line': X.eWing },
    },
    first: {
      x: {
        'w-main': ext(X.wMain, { span: ['ext-n', 'ext-s'], segments: [
          { span: ['ext-n', 'main-n'], suffix: '-new', provenance: 'new' },
          { span: ['main-n', 'ext-s'], suffix: '' },
        ] }),
        'bed3-e': int(X.bed3E, { span: ['ext-n', 'main-n'], ...NEW }),
        'bath-e': int(X.bathE, { span: ['ext-n', 'land-n'], ...NEW }),
        'bed1-e': int(X.bed1E, { span: ['main-n', 'ext-s'] }),
        'land-e': int(X.landE, { span: ['main-n', 'ext-s'] }),
        'ens-w': int(X.eWing, { span: ['ens-n', 'main-n'], ...NEW, note: 'On the old wing\'s east wall line, which is the one piece of that wall the extension keeps - as a partition rather than as structure.' }),
        'e-main': ext(X.eMain, { span: ['ext-n', 'ext-s'], segments: [
          { span: ['ext-n', 'main-n'], suffix: '-new', provenance: 'new' },
          { span: ['main-n', 'ext-s'], suffix: '' },
        ] }),
      },
      y: {
        'ext-n': ext(Y.extN, { span: ['w-main', 'e-main'], segments: [
          { span: ['w-main', 'w-wing-line'], suffix: '-w', provenance: 'new' },
          { span: ['w-wing-line', 'e-wing-line'], suffix: '' },
          { span: ['e-wing-line', 'e-main'], suffix: '-e', provenance: 'new' },
        ] }),
        'ens-n': int(Y.ensN, { span: ['ens-w', 'e-main'], ...NEW }),
        'land-n': int(Y.landN, { span: ['bed3-e', 'ens-w'], ...NEW }),
        'main-n': ext(Y.mainN, { span: ['w-main', 'e-main'], kind: 'internal' }),
        'ext-s': ext(Y.extS, { span: ['w-main', 'e-main'] }),
      },
      marks: { 'w-wing-line': X.wWing, 'e-wing-line': X.eWing },
    },
  },

  rooms: [
    { id: 'wc', level: 'ground', name: 'WC', roomType: 'wc', note: 'About 1.0 square metre as the study draws it. See the wc-is-very-small assumption.', bounds: { w: 'w-main', e: 'wc-e', n: 'ext-n', s: 'wc-s' } },
    { id: 'boot', level: 'ground', name: 'Boot room / utility', roomKey: 'boot-room', roomType: 'boot_room', rects: [
      { w: 'wc-e', e: 'w-wing', n: 'ext-n', s: 'main-n' },
      // The WC's east wall stops at the WC's own south wall, so below
      // that line the boot room is one room and there is no face to name.
      { w: 'w-main', e: X.wcE + T_INT / 2, n: 'wc-s', s: 'main-n' },
    ] },
    { id: 'kitchen-diner', level: 'ground', name: 'Kitchen-diner', was: 'kitchen', roomKey: 'kitchen', roomType: 'kitchen', bounds: { w: 'w-wing', e: 'e-main', n: 'ext-n', s: 'main-n' } },
    { id: 'snug', level: 'ground', name: 'Snug', was: 'dining', roomKey: 'dining', roomType: 'living', bounds: { w: 'w-main', e: 'hall-w', n: 'main-n', s: 'ext-s' } },
    { id: 'hall', level: 'ground', name: 'Hallway', roomKey: 'hallway', roomType: 'hallway', bounds: { w: 'hall-w', e: 'hall-e', n: 'main-n', s: 'ext-s' } },
    { id: 'living', level: 'ground', name: 'Living room', was: 'lounge', roomKey: 'lounge', roomType: 'living', bounds: { w: 'hall-e', e: 'e-main', n: 'main-n', s: 'ext-s' } },

    { id: 'bed3', level: 'first', name: 'Bedroom 3', roomKey: 'bedroom', roomType: 'bedroom', bounds: { w: 'w-main', e: 'bed3-e', n: 'ext-n', s: 'main-n' } },
    { id: 'bathroom', level: 'first', name: 'Bathroom', roomKey: 'bathroom', roomType: 'bathroom', bounds: { w: 'bed3-e', e: 'bath-e', n: 'ext-n', s: 'land-n' } },
    { id: 'office', level: 'first', name: 'Office', roomKey: 'office', roomType: 'office', rects: [
      { w: 'bath-e', e: 'e-main', n: 'ext-n', s: 'ens-n' },
      // The en-suite's north wall stops at the en-suite's west wall, so
      // west of that the office runs on and there is no face to name.
      { w: 'bath-e', e: 'ens-w', n: Y.ensN - T_INT / 2, s: 'land-n' },
    ] },
    { id: 'ensuite', level: 'first', name: 'En-suite', roomType: 'wc', note: 'A shower room, not a bathroom: it takes a shower, a WC and a basin and nothing else.', bounds: { w: 'ens-w', e: 'e-main', n: 'ens-n', s: 'main-n' } },
    { id: 'landing', level: 'first', name: 'Landing', roomType: 'landing', rects: [
      { w: 'bed3-e', e: 'ens-w', n: 'land-n', s: 'main-n' },
      { w: 'bed1-e', e: 'land-e', n: 'main-n', s: 'ext-s' },
    ] },
    { id: 'bed1', level: 'first', name: 'Bedroom 1', roomKey: 'bedroom', roomType: 'bedroom', bounds: { w: 'w-main', e: 'bed1-e', n: 'main-n', s: 'ext-s' } },
    { id: 'master', level: 'first', name: 'Master bedroom', was: 'bed2', roomKey: 'bedroom', roomType: 'bedroom', bounds: { w: 'land-e', e: 'e-main', n: 'main-n', s: 'ext-s' } },
  ],

  openings: [
    // GROUND, garden side. Two small windows over the WC and the boot
    // room, one over the sink in the wing's original brickwork, and a
    // pair of French doors at the dining end - a PAIR, opening inward,
    // not a bifold.
    { id: 'g-win-wc-n', level: 'ground', axis: 'y', line: 'ext-n', segment: '-w', x: 0.695, width: 0.49, type: 'window', provenance: 'new' },
    { id: 'g-win-boot-n', level: 'ground', axis: 'y', line: 'ext-n', segment: '-w', x: 1.98, width: 0.60, type: 'window', provenance: 'new' },
    { id: 'g-win-kitchen-n', level: 'ground', axis: 'y', line: 'ext-n', x: 3.66, width: 0.92, type: 'window', note: 'Over the sink, in the wing\'s original north wall.' },
    { id: 'g-doors-garden', level: 'ground', axis: 'y', line: 'ext-n', segment: '-e', x: 6.87, width: 1.38, type: 'door', leaf: 'double', swing: { toward: 'south' }, provenance: 'new', note: 'French doors from the dining end onto the garden: two leaves hinged at the jambs and opening inward, exactly as the study draws them.' },
    // GROUND, sides.
    { id: 'g-door-boot-w', level: 'ground', axis: 'x', line: 'w-main', segment: '-new', y: 2.22, width: 0.74, type: 'door', leaf: 'single', provenance: 'new', swing: { hinge: 'b', toward: 'east' }, note: 'Back door into the boot room. The whole point of a boot room is that it is the door you actually use.' },
    { id: 'g-win-kitchen-e', level: 'ground', axis: 'x', line: 'e-main', segment: '-new', y: 1.79, width: 1.32, type: 'window', provenance: 'new', note: 'Behind the bench seat at the dining end.' },
    // GROUND, front.
    { id: 'g-win-snug-s', level: 'ground', axis: 'y', line: 'ext-s', x: 1.835, width: 1.51, type: 'window' },
    { id: 'g-door-front', level: 'ground', axis: 'y', line: 'ext-s', x: 4.095, width: 0.79, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'north' } },
    { id: 'g-win-living-s', level: 'ground', axis: 'y', line: 'ext-s', x: 6.485, width: 1.55, type: 'window' },
    // GROUND, internal. Note what is NOT here: nothing joins the hall to
    // the kitchen-diner. See the hall-is-a-dead-end assumption.
    { id: 'g-door-wc', level: 'ground', axis: 'y', line: 'wc-s', x: 0.915, width: 0.59, type: 'door', leaf: 'single', swing: { hinge: 'b', toward: 'north' }, provenance: 'new' },
    { id: 'g-door-boot', level: 'ground', axis: 'x', line: 'w-wing', y: 2.97, width: 0.78, type: 'door', leaf: 'single', swing: { hinge: 'b', toward: 'east' }, note: 'Boot room into the kitchen-diner, in the corner, opening east.' },
    { id: 'g-door-living-kd', level: 'ground', axis: 'y', line: 'main-n', x: 6.52, width: 0.80, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'north' }, note: 'A SINGLE leaf at the living room\'s north-west corner, opening into the kitchen-diner. It is the only opening in this wall, and therefore the only way through to the back of the house.' },
    { id: 'g-door-snug', level: 'ground', axis: 'x', line: 'hall-w', y: 7.18, width: 0.70, type: 'door', leaf: 'single', swing: { hinge: 'b', toward: 'west' } },
    { id: 'g-door-living', level: 'ground', axis: 'x', line: 'hall-e', y: 7.18, width: 0.70, type: 'door', leaf: 'single', swing: { hinge: 'b', toward: 'east' } },

    // FIRST, garden side and gables.
    { id: 'f-win-bed3-w', level: 'first', axis: 'x', line: 'w-main', segment: '-new', y: 1.81, width: 0.76, type: 'window', provenance: 'new' },
    { id: 'f-win-bed3-n', level: 'first', axis: 'y', line: 'ext-n', segment: '-w', x: 1.88, width: 0.78, type: 'window', provenance: 'new' },
    { id: 'f-win-bathroom-n', level: 'first', axis: 'y', line: 'ext-n', x: 3.26, width: 0.78, type: 'window', sill: 1.35 },
    { id: 'f-win-office-n', level: 'first', axis: 'y', line: 'ext-n', segment: '-e', x: 6.60, width: 1.45, type: 'window', provenance: 'new', note: 'The study draws this window straddling the join between the wing\'s brickwork and the new work. It is modelled east of the join - see the office-window derivation.' },
    { id: 'f-win-office-e', level: 'first', axis: 'x', line: 'e-main', segment: '-new', y: 1.10, width: 1.20, type: 'window', provenance: 'new' },
    // FIRST, front.
    { id: 'f-win-bed1-s', level: 'first', axis: 'y', line: 'ext-s', x: 1.195, width: 0.775, type: 'window' },
    { id: 'f-win-bed1-s2', level: 'first', axis: 'y', line: 'ext-s', x: 2.765, width: 0.775, type: 'window', note: 'Bedroom 1 takes two windows in the front wall on the study\'s plan, where the agent\'s plan has one.' },
    { id: 'f-win-master-s', level: 'first', axis: 'y', line: 'ext-s', x: 6.015, width: 1.15, type: 'window' },
    // FIRST, internal. The bathroom and the office both open off the
    // landing's north side; the en-suite opens off its east end.
    { id: 'f-door-bed3', level: 'first', axis: 'x', line: 'bed3-e', y: 3.0825, width: 0.575, type: 'door', leaf: 'single', swing: { hinge: 'b', toward: 'west' }, provenance: 'new', note: 'In bedroom 3\'s EAST wall, off the landing\'s west end - not in the old rear wall, which would open it into bedroom 1. The study draws the leaf hung on the south jamb, where the partition meets the old rear wall, swinging back into the bedroom. The opening is the whole of the landing\'s west end, so it is as wide as that end is deep: 0.575 here against 0.697 scaled off the study, which draws every wall thinner than this model builds them. See the landing-is-narrow assumption.' },
    { id: 'f-door-bathroom', level: 'first', axis: 'y', line: 'land-n', x: 3.935, width: 0.57, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'north' }, provenance: 'new' },
    { id: 'f-door-office', level: 'first', axis: 'y', line: 'land-n', x: 5.089, width: 0.76, type: 'door', leaf: 'single', swing: { hinge: 'b', toward: 'north' }, provenance: 'new' },
    { id: 'f-door-ensuite', level: 'first', axis: 'y', line: 'main-n', x: 6.125, width: 0.68, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'north' }, provenance: 'new', note: 'Off the MASTER BEDROOM, which is what makes it an en-suite. The study draws ens-w solid its whole height and puts the leaf in the en-suite\'s south wall, hung on the west jamb and opening north into the shower room. Measured at x 5.75 to 6.43 and moved 35mm east so its west jamb lands on the face of the en-suite partition rather than 35mm behind it, which is where it would actually be built.' },
    { id: 'f-door-bed1', level: 'first', axis: 'y', line: 'main-n', x: 3.25, width: 0.74, type: 'door', leaf: 'single', swing: { hinge: 'b', toward: 'south' }, note: 'Hinged on the stairwell side so the leaf opens back against it.' },
    { id: 'f-open-landing', level: 'first', axis: 'y', line: 'main-n', x: 4.095, width: 0.94, type: 'door', leaf: 'cased', provenance: 'new', note: 'The old rear wall removed at the stairwell head, so the landing reaches the stair.' },
    { id: 'f-door-master', level: 'first', axis: 'y', line: 'main-n', x: 4.964, width: 0.72, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'south' } },
  ],

  stairs: [{
    id: 'main-stair',
    level: 'ground',
    from: 'hall',
    to: 'landing',
    footprint: [3.69, 4.28, 4.46, 6.86],
    upperVoid: [3.69, 4.28, 4.46, 7.49],
    direction: '-y',
    width: 0.77,
    risers: 13,
    rise: 0.2077,
    going: 0.215,
    winders: 0,
    note: 'Unchanged from the as-bought house: the stair stays exactly where it is, which is most of why the front door can stay centred. The void now runs the full depth, because the study carries the stairwell walls through to the front wall.',
  }],

  roofs: [
    { id: 'roof-hipped', kind: 'hipped', over: [0, 0, W_ENV, D_ENV], ridgeAxis: 'x', pitchDeg: 35, eavesHeight: EAVES, overhang: 0.3, covering: 'plain tile', provenance: 'new', note: 'One hipped roof over the whole square: four hips, no valleys. The design study is explicit that avoiding valleys is the point of squaring the footprint off.' },
  ],

  chimneys: [
    { id: 'chimney-w', footprint: [0, 5.16, 0.56, 6.06], topHeight: 8.5, pots: 2, provenance: 'existing', note: 'Kept and raised to clear the new ridge, rising through the west slope.' },
    { id: 'chimney-e', footprint: [7.64, 5.16, W_ENV, 6.06], topHeight: 8.5, pots: 2, provenance: 'existing', note: 'Kept and raised. The east gable wall and both fireplaces are untouched.' },
  ],

  features: [
    { id: 'breast-snug', level: 'ground', room: 'snug', kind: 'chimney_breast', rect: [0.23, 4.89, 0.68, 6.33], height: 2.40 },
    { id: 'breast-living', level: 'ground', room: 'living', kind: 'chimney_breast', rect: [7.52, 4.89, 7.97, 6.33], height: 2.40 },
    { id: 'shelves-office', level: 'first', room: 'office', kind: 'fitted_shelving', rect: [4.285, 0.23, 4.595, 2.665], height: 2.30, note: 'The study hatches these, which is how it draws built-in work: bookshelves the full height of the office\'s west wall, not a bookcase somebody could carry out.' },
    { id: 'breast-bed1', level: 'first', room: 'bed1', kind: 'chimney_breast', rect: [0.23, 4.89, 0.68, 6.33], height: 2.30 },
    { id: 'wardrobes-master', level: 'first', room: 'master', kind: 'fitted_wardrobe', rect: [6.58, 3.60, 7.97, 4.11], height: 2.30, note: 'Hatched on the study: fitted wardrobes across the master\'s north wall at its east end.' },
    { id: 'breast-master', level: 'first', room: 'master', kind: 'chimney_breast', rect: [7.52, 4.89, 7.97, 6.33], height: 2.30 },
    { id: 'porch', level: 'ground', room: 'hall', kind: 'porch', rect: [3.445, D_ENV, 4.745, 8.57], height: 2.75, eavesM: 2.05, cheekM: 0.215, overhang: 0.08, note: 'Kept as it stands. See the as-bought stage for how it is set out.' },
  ],
};

export const stages = [asBought, postExtension];

// --- Variants --------------------------------------------------------
//
// Furniture only. A variant belongs to one stage and changes nothing
// structural, so the empty shell is a real thing you can look at rather
// than a rendering flag.
//
// NOTHING IS INVENTED HERE. Every item below is drawn on a source
// drawing, in the room and roughly the position the drawing puts it.
// Where a drawing shows no furniture - which is most of the agent's
// plan - this file has none. Sizes are rounded to real products where
// the drawing is smaller than anything you can buy, and that rounding
// is the only liberty taken.
//
// `clearance` is the floor an item needs kept free in front of it;
// `belongsTo` says a chair is allowed to stand in its own table's
// clearance, which is the whole point of a chair. The clearance check
// REPORTS what does not fit. It has not been allowed to move anything.

const F = (id, level, room, kind, name, rect, extra = {}) => ({
  id, level, room, kind, name, rect, confidence: 'drafted', ...extra,
});

export const variants = [
  {
    id: 'as-bought--empty',
    stage: 'as-bought',
    name: 'Empty shell',
    summary: 'The house on the day the keys arrive: nothing in it.',
    furniture: [],
  },
  {
    id: 'as-bought--as-drawn',
    stage: 'as-bought',
    name: 'The fittings on the plan',
    derivedFrom: 'as-bought--empty',
    summary: 'The agent\'s plan is an unfurnished drawing. The only things on it are the kitchen\'s sink run and the bathroom\'s sanitaryware, and those are the only things here.',
    changes: [
      'Sink unit with its drainer down the kitchen\'s east wall, under the window.',
      'One worktop unit in the kitchen\'s north wall, west of the window.',
      'WC, basin and bath in the bathroom, where the plan draws them.',
      'No loose furniture at all: the plan shows none, so neither does this.',
    ],
    furniture: [
      F('ab-k-worktop', 'ground', 'kitchen', 'worktop', 'Worktop', [3.31, 0.23, 3.79, 0.83], { height: 0.92, fixed: true, facing: 's' }),
      F('ab-k-sink', 'ground', 'kitchen', 'sink', 'Sink', [5.005, 0.72, 5.605, 2.19], { height: 0.92, fixed: true, facing: 'w' }),
      F('ab-ba-wc', 'first', 'bathroom', 'wc', 'WC', [2.86, 0.23, 3.26, 0.88], { height: 0.78, fixed: true, facing: 's' }),
      F('ab-ba-basin', 'first', 'bathroom', 'basin', 'Basin', [4.16, 0.23, 4.71, 0.68], { height: 0.85, fixed: true, facing: 's' }),
      F('ab-ba-bath', 'first', 'bathroom', 'bath', 'Bath', [4.905, 0.23, 5.605, 1.93], { height: 0.55, fixed: true, facing: 'w' }),
    ],
  },
  {
    id: 'post-extension--empty',
    stage: 'post-extension',
    name: 'Empty shell',
    summary: 'The extension finished and nothing moved back in.',
    furniture: [],
  },
  {
    id: 'post-extension--as-drawn',
    stage: 'post-extension',
    name: 'Furnished, as the study draws it',
    derivedFrom: 'post-extension--empty',
    summary: 'Every piece of furniture the design study draws, in the room and the position it draws it, and nothing else. The living room is empty but for its stove, because that is how the study leaves it.',
    changes: [
      'Kitchen run along the garden wall with the sink under the window; hob and oven down the west side.',
      'A 1.6m island with two stools on its south side.',
      'Dining table at the east end: three chairs on its west side and a bench seat down the wall.',
      'Boot room takes the freezer, a sink and the washer-dryer, with the bench and coats against the wing wall.',
      'Two desks and two chairs in the snug, and a sofa in its NORTH-WEST corner - moved there from the south-west corner the study draws it in, and reduced from an L to a single 1.26m seat, which is the longest run that corner holds between the chimney breast and the fitted store. The sideboard and loose chair that stood there are removed.',
      'The living room holds nothing but the stove. The study draws no sofa there and neither does this.',
      'Bedroom 3 holds one single bed. Bedroom 1 holds one double. Neither has a wardrobe or a bedside table on the drawing.',
    ],
    furniture: [
      // --- WC -------------------------------------------------------
      F('wc-pan', 'ground', 'wc', 'wc', 'WC', [0.48, 0.23, 0.87, 0.75], { height: 0.78, fixed: true, facing: 's' }),
      F('wc-basin', 'ground', 'wc', 'basin', 'Basin', [1.10, 0.47, 1.445, 0.82], { height: 0.85, fixed: true, facing: 'w' }),
      // --- Boot room / utility --------------------------------------
      F('bt-bench', 'ground', 'boot', 'bench', 'Bench and coats', [1.97, 0.26, 2.365, 2.42], { height: 1.90, fixed: true, facing: 'w' }),
      F('bt-freezer', 'ground', 'boot', 'fridge', 'Freezer', [0.23, 2.80, 0.83, 3.37], { height: 1.70, facing: 'n' }),
      F('bt-sink', 'ground', 'boot', 'sink', 'Sink', [0.83, 2.80, 1.73, 3.37], { height: 0.92, fixed: true, facing: 'n' }),
      F('bt-washer', 'ground', 'boot', 'washer', 'Washer-dryer', [1.73, 2.80, 2.365, 3.37], { height: 0.85, fixed: true, facing: 'n' }),
      // --- Kitchen-diner: the run along the garden wall -------------
      F('kd-ff', 'ground', 'kitchen-diner', 'fridge', 'Fridge-freezer', [2.595, 0.23, 3.195, 0.83], { height: 1.85, fixed: true, facing: 's' }),
      F('kd-run-a', 'ground', 'kitchen-diner', 'worktop', 'Worktop', [3.195, 0.23, 3.395, 0.83], { height: 0.92, fixed: true, facing: 's' }),
      F('kd-sink', 'ground', 'kitchen-diner', 'sink', 'Sink', [3.395, 0.23, 4.295, 0.83], { height: 0.92, fixed: true, facing: 's' }),
      F('kd-dw', 'ground', 'kitchen-diner', 'dishwasher', 'Dishwasher', [4.295, 0.23, 4.895, 0.83], { height: 0.85, fixed: true, facing: 's' }),
      F('kd-run-b', 'ground', 'kitchen-diner', 'worktop', 'Worktop', [4.895, 0.23, 5.705, 0.83], { height: 0.92, fixed: true, facing: 's' }),
      // --- Kitchen-diner: the run down the west side ----------------
      F('kd-run-c', 'ground', 'kitchen-diner', 'worktop', 'Worktop', [2.595, 0.83, 3.195, 1.33], { height: 0.92, fixed: true, facing: 'e' }),
      F('kd-hob', 'ground', 'kitchen-diner', 'hob', 'Hob', [2.595, 1.33, 3.195, 1.93], { height: 0.92, fixed: true, facing: 'e', clearance: { front: 0.7 } }),
      F('kd-oven', 'ground', 'kitchen-diner', 'oven', 'Oven', [2.595, 1.93, 3.195, 2.56], { height: 0.90, fixed: true, facing: 'e' }),
      // --- Kitchen-diner: the island and the dining end -------------
      F('kd-island', 'ground', 'kitchen-diner', 'island', 'Island', [4.00, 1.61, 5.60, 2.41], { height: 0.92, fixed: true, facing: 's', clearance: { front: 0.7, back: 0.85 } }),
      F('kd-stool-1', 'ground', 'kitchen-diner', 'stool', 'Stool', [4.20, 2.58, 4.56, 2.94], { height: 0.70, belongsTo: 'kd-island' }),
      F('kd-stool-2', 'ground', 'kitchen-diner', 'stool', 'Stool', [4.97, 2.58, 5.33, 2.94], { height: 0.70, belongsTo: 'kd-island' }),
      F('kd-table', 'ground', 'kitchen-diner', 'table', 'Dining table', [6.96, 1.09, 7.60, 2.51], { height: 0.75, clearance: { all: 0.40 } }),
      F('kd-bench', 'ground', 'kitchen-diner', 'bench', 'Bench seat', [7.60, 1.00, 7.97, 2.63], { height: 0.45, fixed: true, facing: 'w', belongsTo: 'kd-table' }),
      F('kd-chair-1', 'ground', 'kitchen-diner', 'chair', 'Chair', [6.47, 1.10, 6.92, 1.55], { height: 0.90, belongsTo: 'kd-table' }),
      F('kd-chair-2', 'ground', 'kitchen-diner', 'chair', 'Chair', [6.47, 1.58, 6.92, 2.03], { height: 0.90, belongsTo: 'kd-table' }),
      F('kd-chair-3', 'ground', 'kitchen-diner', 'chair', 'Chair', [6.47, 2.045, 6.92, 2.495], { height: 0.90, belongsTo: 'kd-table' }),
      // --- Snug -----------------------------------------------------
      F('sn-store', 'ground', 'snug', 'shelf', 'Store', [1.43, 3.60, 1.93, 4.04], { height: 2.00, fixed: true, facing: 's' }),
      F('sn-desk-n', 'ground', 'snug', 'desk', 'Desk', [2.84, 3.71, 3.49, 4.73], { height: 0.74, facing: 'w', clearance: { front: 0.6 } }),
      F('sn-chair-1', 'ground', 'snug', 'chair', 'Chair', [2.39, 4.02, 2.84, 4.47], { height: 0.90, belongsTo: 'sn-desk-n' }),
      F('sn-desk-s', 'ground', 'snug', 'desk', 'Desk', [2.84, 5.44, 3.49, 6.46], { height: 0.74, facing: 'w', clearance: { front: 0.6 } }),
      F('sn-chair-2', 'ground', 'snug', 'chair', 'Chair', [2.39, 5.75, 2.84, 6.20], { height: 0.90, belongsTo: 'sn-desk-s' }),
      // MOVED to the room's north-west corner at the owner's request, out
      // of the south-west corner the study draws it in, and the desk and
      // chair that stood here are gone with it.
      //
      // It could not come across as an L. The study's is 2.31 x 1.16
      // overall and the corner does not hold that: the chimney breast
      // starts 1.29m down the west wall and the fitted store starts
      // 1.20m along the north wall, which boxes the corner into roughly
      // 1.2 x 1.3. So it is one sofa, 1.26 long and 0.85 deep, against
      // the west wall between the north wall and the breast - the
      // longest run the corner has. A return along the north wall was
      // tried and came out 0.41m deep, which is a step, not a seat.
      // Moving the store would let the whole L come across; nobody has
      // asked for that.
      F('sn-sofa', 'ground', 'snug', 'sofa', 'Sofa', [0.23, 3.60, 1.08, 4.86], { height: 0.82, facing: 'e' }),
      // --- Living room. The stove, and nothing else. ----------------
      F('lv-stove', 'ground', 'living', 'stove', 'Stove', [7.10, 5.32, 7.52, 5.77], { height: 0.65, fixed: true, facing: 'w' }),
      // --- Bedroom 3 ------------------------------------------------
      F('b3-bed', 'first', 'bed3', 'bed', 'Single bed', [0.42, 0.23, 1.32, 2.13], { height: 0.55, facing: 'n' }),
      // --- Bathroom -------------------------------------------------
      F('ba-bath', 'first', 'bathroom', 'bath', 'Bath', [2.645, 0.23, 4.145, 0.93], { height: 0.55, fixed: true, facing: 's', note: 'A 1.5m bath, because 1.5m is all the room is wide.' }),
      F('ba-wc', 'first', 'bathroom', 'wc', 'WC', [2.645, 1.20, 3.045, 1.90], { height: 0.78, fixed: true, facing: 'e' }),
      F('ba-basin', 'first', 'bathroom', 'basin', 'Basin', [2.645, 2.00, 3.195, 2.45], { height: 0.85, fixed: true, facing: 'e' }),
      // --- Office ---------------------------------------------------
      F('of-daybed', 'first', 'office', 'sofa', 'Sofa bed', [5.02, 0.23, 6.61, 1.05], { height: 0.85, facing: 's' }),
      F('of-table', 'first', 'office', 'table', 'Table', [5.43, 1.19, 6.23, 1.65], { height: 0.74 }),
      F('of-chair', 'first', 'office', 'chair', 'Chair', [6.87, 0.85, 7.33, 1.31], { height: 0.90 }),
      F('of-pcdesk', 'first', 'office', 'desk', 'PC desk', [7.40, 0.23, 7.97, 1.98], { height: 0.74, facing: 'w', clearance: { front: 0.7 } }),
      // --- En-suite -------------------------------------------------
      F('es-wc', 'first', 'ensuite', 'wc', 'WC', [6.10, 2.085, 6.50, 2.785], { height: 0.78, fixed: true, facing: 's' }),
      F('es-basin', 'first', 'ensuite', 'basin', 'Basin', [6.72, 2.97, 7.20, 3.42], { height: 0.85, fixed: true, facing: 'n' }),
      F('es-shower', 'first', 'ensuite', 'shower', 'Shower', [7.13, 2.085, 7.97, 2.925], { height: 2.00, fixed: true, facing: 'w' }),
      // --- Master bedroom -------------------------------------------
      F('ms-bed', 'first', 'master', 'bed', 'King bed', [4.63, 4.98, 6.63, 6.48], { height: 0.55, facing: 'w' }),
      F('ms-bench', 'first', 'master', 'bench', 'Bench', [6.73, 5.12, 7.12, 6.28], { height: 0.45 }),
      F('ms-armchair', 'first', 'master', 'sofa', 'Armchair', [7.05, 6.70, 7.90, 7.45], { height: 0.85, facing: 'n' }),
      // --- Bedroom 1 ------------------------------------------------
      F('b1-bed', 'first', 'bed1', 'bed', 'Double bed', [0.77, 3.60, 2.12, 5.50], { height: 0.55, facing: 'n' }),
    ],
  },
];

// --- A furnished living room -----------------------------------------
//
// A SEPARATE VARIANT, and that is the whole point. The design study
// draws no furniture in the living room, and docs/SOURCE-FIDELITY.md
// makes the drawing the authority: adding a sofa to
// `post-extension--as-drawn` would quietly make that variant a mixture
// of what was drawn and what I thought, which is precisely the mistake
// that file was written after.
//
// So the drawn variant stays exactly as drawn and this one says openly
// that it is furnished by inference. Everything here is placed off the
// room's own geometry - the stove and chimney breast on the east wall,
// the hall door at the south end of the west wall, the kitchen-diner
// door at x 6.12-6.92 in the north wall - so the seating faces the fire
// and nothing stands in a doorway.
const asDrawn = variants.find((v) => v.id === 'post-extension--as-drawn');

variants.push({
  id: 'post-extension--lived-in',
  stage: 'post-extension',
  name: 'Furnished, and lived in',
  derivedFrom: 'post-extension--as-drawn',
  summary: 'Everything the study draws, plus a furnished living room. The study leaves that room empty but for its stove, so the seating here is INFERRED from the room rather than read off a drawing, and it is kept in its own variant for that reason.',
  changes: [
    'A 2.0m sofa down the west wall facing the stove, clear of the hall door at the south end of that wall.',
    'A coffee table between the sofa and the hearth.',
    'An armchair in the south-east corner, turned back into the room.',
    'A low media unit against the north wall, stopped short of the kitchen-diner door at x 6.12-6.92.',
    'Nothing else changes: every other room is exactly as the study draws it.',
  ],
  furniture: [
    ...asDrawn.furniture,
    F('lv-sofa', 'ground', 'living', 'sofa', 'Sofa', [4.68, 4.45, 5.58, 6.45], { height: 0.82, facing: 'e' }),
    F('lv-coffee', 'ground', 'living', 'table', 'Coffee table', [5.85, 5.10, 6.75, 5.70], { height: 0.42, facing: 'n' }),
    F('lv-armchair', 'ground', 'living', 'sofa', 'Armchair', [6.35, 6.55, 7.20, 7.30], { height: 0.85, facing: 'n' }),
    F('lv-media', 'ground', 'living', 'shelf', 'Media unit', [4.75, 3.66, 5.95, 4.06], { height: 1.10, facing: 's' }),
  ],
});
