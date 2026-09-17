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

// --- The shell, in one place ----------------------------------------
//
// Solved from the room dimensions the agent's plan prints, against the
// envelope the design study states. Every number below is used, not
// decorative: change one and the rooms move with it.

const T_EXT = 0.23;        // solid brick, 9in. Assumed - see assumptions.
const T_INT = 0.13;        // half-brick or stud, plastered both sides.
const W_ENV = 8.20;        // external width, stated by the design study.
const D_ENV = 7.72;        // external depth, DERIVED - see derivation.

// Gridline centreline positions, west to east and north to south.
const X = {
  wMain: T_EXT / 2,                    // 0.115  west external wall
  wWing: 2.415,                        //        rear wing, west wall
  eWing: 5.655,                        //        rear wing, east wall
  eMain: W_ENV - T_EXT / 2,            // 8.085  east external wall
  hallW: 3.555,                        //        hall, west side
  hallE: 4.555,                        //        hall, east side
  bed1E: 3.625,                        //        bedroom 1, east side
  bed3E: 2.515,                        //        bedroom 3, east side
  ensW: 6.235,                         //        en-suite, west side
  wcE: 1.395,                          //        WC, east side
};
const Y = {
  extN: T_EXT / 2,                     // 0.115  north (garden) external wall
  mainN: 3.485,                        //        original main block, rear wall
  extS: D_ENV - T_EXT / 2,             // 7.605  front wall, Ameysford Road
  bathS: 2.000,                        //        bathroom, south side
  offS: 2.950,                         //        office, south side
  ensS: 4.500,                         //        en-suite, south side
  wcS: 1.615,                          //        WC, south side
};

const ext = (at, opts = {}) => ({ at, t: T_EXT, kind: 'external', provenance: 'existing', ...opts });
const int = (at, opts = {}) => ({ at, t: T_INT, kind: 'internal', provenance: 'existing', ...opts });

// Storey heights. The roof pins these: the design study states a new
// ridge of about 7.8m at 35 degrees over the 7.72m depth, which puts the
// eaves at 5.00m, and two storeys plus a floor structure have to fit
// under that. See derivation.
const LEVELS = [
  { id: 'ground', name: 'Ground floor', code: 'G', elevation: 0, ceilingHeight: 2.40, sortOrder: 10 },
  { id: 'first', name: 'First floor', code: '1', elevation: 2.70, ceilingHeight: 2.30, sortOrder: 20 },
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
    planNorthOffsetDeg: 0,
    frontElevation: 'south',
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
    roofOverhang: 0.3,
  },
  envelope: { widthM: W_ENV, depthM: D_ENV },

  sources: [
    {
      id: 'agent-plan',
      kind: 'floor_plan',
      label: "Estate agent's floor plan, as the house stands",
      confidence: 'researched',
      supplies: ['room clear sizes to the centimetre', 'room adjacency', 'stair and fireplace positions'],
    },
    {
      id: 'design-study',
      kind: 'concept',
      label: 'Layout study: final version without right extensions',
      confidence: 'drafted',
      supplies: ['post-extension layout', 'room areas', 'envelope', 'roof form and ridge height', 'internal floor area'],
      note: 'The study labels itself a concept, not a design. Its figures are approximate by its own admission.',
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

    { of: 'room:post-extension/kitchen-diner', kind: 'areaM2', value: 18, source: 'design-study' },
    { of: 'room:post-extension/snug', kind: 'areaM2', value: 13, source: 'design-study' },
    { of: 'room:post-extension/living', kind: 'areaM2', value: 13, source: 'design-study' },
    { of: 'room:post-extension/boot', kind: 'areaM2', value: 5, source: 'design-study' },
    { of: 'room:post-extension/master', kind: 'areaM2', value: 13, source: 'design-study' },
    { of: 'room:post-extension/bed1', kind: 'areaM2', value: 13, source: 'design-study' },
    { of: 'room:post-extension/office', kind: 'areaM2', value: 8, source: 'design-study' },
    { of: 'room:post-extension/bed3', kind: 'areaM2', value: 7, source: 'design-study' },
    { of: 'room:post-extension/bathroom', kind: 'areaM2', value: 4, source: 'design-study' },

    { of: 'stage:post-extension', kind: 'envelopeWidthM', value: 8.2, source: 'design-study' },
    { of: 'stage:post-extension', kind: 'envelopeDepthM', value: 8.0, source: 'design-study', tolerance: 0.3, note: 'Stated to one decimal place in a headline. The same study\'s floor-area figure agrees with 7.72, not 8.00.' },
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
    residualMm: 0,
    note: 'The two front rooms and the envelope are both stated; the hall is what is left. 0.87m is narrow and entirely ordinary for a cottage of this age.',
  },
  {
    id: 'depth',
    question: 'How deep is the building?',
    working: `${T_EXT} + 3.14 (kitchen) + ${T_EXT} (shared wall) + 3.89 (front rooms) + ${T_EXT} = 7.72`,
    result: 'depth = 7.72, against a stated 8.00',
    residualMm: 280,
    note: 'The stated 8.0 is a headline rounded to one decimal. The SAME study states an internal floor area of about 112 square metres, and (8.20 - 0.46) x (7.72 - 0.46) x 2 = 112.4. At a depth of 8.00 it would be 116.7. The area figure adjudicates in favour of 7.72, so the model is built at 7.72 and the 280mm is reported rather than absorbed.',
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
    working: 'west infill a + 0.23 + 3.01 (wing) + 0.23 + east infill b = 7.74, with a x 3.14 sized to the stated 5 sq m boot room plus a WC',
    result: 'a = 2.07, b = 2.20; wing outer faces at x = 2.30 and 5.77',
    residualMm: 0,
    note: 'The agent\'s plan does not dimension this. It is pinned by the extension instead: the design study\'s boot room and kitchen-diner areas only work with the wing about here, and it puts the bathroom directly over the landing, which is what the agent\'s plan shows.',
  },
];

const SHARED_ASSUMPTIONS = [
  { id: 'wall-external', severity: 'medium', note: `External walls modelled at ${T_EXT}m solid brick. Not measured. A cavity wall on the new work would be nearer 0.30m, which would take about 70mm off each new room; modelling everything at ${T_EXT} is what reconciles with the design study's own floor-area figure.` },
  { id: 'wall-internal', severity: 'low', note: `Internal partitions modelled at ${T_INT}m. Not measured.` },
  { id: 'storey-heights', severity: 'medium', note: 'Ceiling heights of 2.40 and 2.30 are inferred from the roof, not measured. They are the weakest numbers in the model and everything vertical rests on them.' },
  { id: 'wing-offset', severity: 'high', note: 'The rear wing\'s position across the width is derived from the extension\'s room areas, not read off the agent\'s plan, which does not dimension it. If the wing is in fact offset, the boot room and the kitchen-diner both change size.' },
  { id: 'openings', severity: 'medium', note: 'Window and door widths and positions are scaled off the drawings and the photograph. None is dimensioned on any source.' },
  { id: 'stairs', severity: 'medium', note: 'A straight flight 0.80m wide, 13 risers at 0.208 with a 0.22 going, run north from the hall. The agent\'s plan shows the flight and the winder at the top but dimensions neither.' },
  { id: 'chimneys', severity: 'low', note: 'Both stacks are placed on the gable walls at the mid-depth of the front rooms, which is where the agent\'s plan draws the fireplaces. Stack heights are scaled off the photograph.' },
  { id: 'hall-is-not-a-passage', severity: 'high', note: 'The hall derives to 0.87m wide and a stair needs 0.76 of it, so the hall cannot also be the route to the back of the house. The model puts the flight in the back half and enters the kitchen from the dining room instead, which is ordinary in a cottage of this size but is NOT what either drawing shows. Either the hall is wider than the arithmetic says, the kitchen is entered from the dining room, or there is a step under the flight. Measure it.' },
  { id: 'depth-residual', severity: 'high', note: 'The building is modelled 7.72m deep. The design study states 8.0m. See the derivation: the study\'s own floor-area figure agrees with 7.72, but until someone measures it this is a 280mm question.' },
];

// --- Stage one: the house as it stands -------------------------------

const asBought = {
  id: 'as-bought',
  name: 'Day one - as bought',
  sequence: 10,
  status: 'existing',
  summary: 'The house as the agent\'s plan draws it: three rooms down, three up, a rear kitchen wing under its own roof, and a gabled main roof with a chimney on each gable.',
  derivation: DERIVATION.filter((d) => d.id !== 'wing-position' || true),
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
        'bed1-e': int(X.bed1E, { span: ['main-n', 'ext-s'] }),
        'land-e': int(X.hallE, { span: ['main-n', 'ext-s'] }),
      },
      y: {
        'n-wing': ext(Y.extN, { span: ['w-wing', 'e-wing'] }),
        'main-n': ext(Y.mainN, { span: ['w-main', 'e-main'] }),
        'ext-s': ext(Y.extS, { span: ['w-main', 'e-main'] }),
      },
    },
  },

  rooms: [
    { id: 'dining', level: 'ground', name: 'Dining Room', roomKey: 'dining', roomType: 'dining', label: '3.26 x 3.89m', bounds: { w: 'w-main', e: 'hall-w', n: 'main-n', s: 'ext-s' } },
    { id: 'hall', level: 'ground', name: 'Hallway', roomKey: 'hallway', roomType: 'hallway', bounds: { w: 'hall-w', e: 'hall-e', n: 'main-n', s: 'ext-s' } },
    { id: 'lounge', level: 'ground', name: 'Lounge', roomKey: 'lounge', roomType: 'living', label: '3.35 x 3.89m', bounds: { w: 'hall-e', e: 'e-main', n: 'main-n', s: 'ext-s' } },
    { id: 'kitchen', level: 'ground', name: 'Kitchen', roomKey: 'kitchen', roomType: 'kitchen', label: '3.01 x 3.14m', bounds: { w: 'w-wing', e: 'e-wing', n: 'n-wing', s: 'main-n' } },
    { id: 'bed1', level: 'first', name: 'Bedroom 1', roomKey: 'bedroom', roomType: 'bedroom', label: '3.33 x 3.89m', bounds: { w: 'w-main', e: 'bed1-e', n: 'main-n', s: 'ext-s' } },
    { id: 'landing', level: 'first', name: 'Landing', roomType: 'landing', bounds: { w: 'bed1-e', e: 'land-e', n: 'main-n', s: 'ext-s' } },
    { id: 'bed2', level: 'first', name: 'Bedroom 2', roomType: 'bedroom', label: '3.35 x 3.89m', bounds: { w: 'land-e', e: 'e-main', n: 'main-n', s: 'ext-s' } },
    { id: 'bathroom', level: 'first', name: 'Bathroom', roomKey: 'bathroom', roomType: 'bathroom', label: '3.01 x 3.14m', bounds: { w: 'w-wing', e: 'e-wing', n: 'n-wing', s: 'main-n' } },
  ],

  openings: [
    // Front elevation, ground. The photograph shows a wide window west of
    // the door and a narrower one east of it.
    { id: 'g-win-dining-s', level: 'ground', axis: 'y', line: 'ext-s', x: 1.86, width: 1.35, type: 'window' },
    { id: 'g-door-front', level: 'ground', axis: 'y', line: 'ext-s', x: 4.055, width: 0.90, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'north', angleDeg: 90 } },
    { id: 'g-win-lounge-s', level: 'ground', axis: 'y', line: 'ext-s', x: 6.295, width: 1.05, type: 'window' },
    // Rear wall of the main block: outside either side of the wing.
    { id: 'g-win-dining-n', level: 'ground', axis: 'y', line: 'main-n', x: 1.20, width: 1.05, type: 'window' },
    { id: 'g-door-kitchen', level: 'ground', axis: 'y', line: 'main-n', x: 3.00, width: 0.80, type: 'door', leaf: 'single', swing: { hinge: 'b', toward: 'north', angleDeg: 90 }, note: 'From the dining room. The hall cannot also be a passage: the stair takes 0.76 of its 0.87.' },
    { id: 'g-win-lounge-n', level: 'ground', axis: 'y', line: 'main-n', x: 6.80, width: 1.05, type: 'window' },
    // The wing.
    { id: 'g-win-kitchen-n', level: 'ground', axis: 'y', line: 'n-wing', x: 4.00, width: 1.20, type: 'window' },
    { id: 'g-win-kitchen-w', level: 'ground', axis: 'x', line: 'w-wing', y: 1.80, width: 0.90, type: 'window' },
    { id: 'g-door-back', level: 'ground', axis: 'x', line: 'e-wing', y: 2.60, width: 0.85, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'west', angleDeg: 90 } },
    { id: 'g-win-kitchen-e', level: 'ground', axis: 'x', line: 'e-wing', y: 1.10, width: 0.90, type: 'window' },
    // Gable windows, beside the chimney breasts.
    { id: 'g-win-dining-w', level: 'ground', axis: 'x', line: 'w-main', y: 6.80, width: 0.85, type: 'window' },
    { id: 'g-win-lounge-e', level: 'ground', axis: 'x', line: 'e-main', y: 6.80, width: 0.85, type: 'window' },
    // Internal doors off the hall.
    { id: 'g-door-dining', level: 'ground', axis: 'x', line: 'hall-w', y: 6.70, width: 0.80, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'west', angleDeg: 90 } },
    { id: 'g-door-lounge', level: 'ground', axis: 'x', line: 'hall-e', y: 6.70, width: 0.80, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'east', angleDeg: 90 } },

    { id: 'f-win-bed1-s', level: 'first', axis: 'y', line: 'ext-s', x: 1.86, width: 1.20, type: 'window' },
    { id: 'f-win-landing-s', level: 'first', axis: 'y', line: 'ext-s', x: 4.09, width: 0.75, type: 'window' },
    { id: 'f-win-bed2-s', level: 'first', axis: 'y', line: 'ext-s', x: 6.295, width: 1.20, type: 'window' },
    { id: 'f-win-bed1-n', level: 'first', axis: 'y', line: 'main-n', x: 1.20, width: 1.05, type: 'window' },
    { id: 'f-door-bathroom', level: 'first', axis: 'y', line: 'main-n', x: 4.09, width: 0.75, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'north', angleDeg: 90 } },
    { id: 'f-win-bed2-n', level: 'first', axis: 'y', line: 'main-n', x: 6.80, width: 1.05, type: 'window' },
    { id: 'f-win-bathroom-n', level: 'first', axis: 'y', line: 'n-wing', x: 4.00, width: 0.90, type: 'window', sill: 1.35 },
    { id: 'f-door-bed1', level: 'first', axis: 'x', line: 'bed1-e', y: 4.20, width: 0.75, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'west', angleDeg: 90 } },
    { id: 'f-door-bed2', level: 'first', axis: 'x', line: 'land-e', y: 4.20, width: 0.75, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'east', angleDeg: 90 } },
  ],

  stairs: [{
    id: 'main-stair',
    level: 'ground',
    from: 'hall',
    to: 'landing',
    footprint: [3.66, 3.62, 4.42, 5.86],
    upperVoid: [3.66, 4.50, 4.42, 5.86],
    direction: '-y',
    width: 0.76,
    risers: 13,
    rise: 0.2077,
    going: 0.22,
    winders: 4,
    handrail: 'east',
    note: 'Rises northward through the back half of the hall: 9 straight risers then a four-riser winder onto the landing. 13 risers at 0.2077 make the 2.70m storey height exactly. The front half of the hall is left as the entrance, which is the only way a 0.87m hall can hold both a stair and a front door.',
  }],

  roofs: [
    { id: 'roof-main', kind: 'gabled', over: [0, 3.37, W_ENV, D_ENV], ridgeAxis: 'x', pitchDeg: 35, eavesHeight: EAVES, overhang: 0.3, covering: 'plain tile', provenance: 'existing' },
    { id: 'roof-wing', kind: 'gabled', over: [2.30, 0, 5.77, 3.37], ridgeAxis: 'y', pitchDeg: 35, eavesHeight: EAVES, overhang: 0.3, covering: 'plain tile', provenance: 'existing' },
  ],

  chimneys: [
    { id: 'chimney-w', footprint: [0, 5.10, 0.56, 5.90], topHeight: 7.5, pots: 2, provenance: 'existing', note: 'West gable. Serves the dining room and bedroom 1 fireplaces.' },
    { id: 'chimney-e', footprint: [7.64, 5.10, W_ENV, 5.90], topHeight: 7.5, pots: 2, provenance: 'existing', note: 'East gable. Serves the lounge and bedroom 2 fireplaces.' },
  ],

  features: [
    { id: 'breast-dining', level: 'ground', room: 'dining', kind: 'chimney_breast', rect: [0.23, 5.10, 0.56, 5.90], projection: 0.33, height: 2.40 },
    { id: 'breast-lounge', level: 'ground', room: 'lounge', kind: 'chimney_breast', rect: [7.64, 5.10, 7.97, 5.90], projection: 0.33, height: 2.40 },
    { id: 'breast-bed1', level: 'first', room: 'bed1', kind: 'chimney_breast', rect: [0.23, 5.10, 0.56, 5.90], projection: 0.33, height: 2.30 },
    { id: 'breast-bed2', level: 'first', room: 'bed2', kind: 'chimney_breast', rect: [7.64, 5.10, 7.97, 5.90], projection: 0.33, height: 2.30 },
    { id: 'porch', level: 'ground', room: 'hall', kind: 'porch', rect: [3.58, D_ENV, 4.53, 8.62], height: 2.30, roofKind: 'gabled', note: 'The small tiled gable canopy over the front door in the photograph.' },
  ],
};

// --- Stage two: after the extension ----------------------------------
//
// Both sides of the rear wing filled in to square the footprint off at
// 8.2 x 7.72. The wing's west wall stays and becomes the boot room's
// east wall; its east wall goes, opening the old kitchen into the new
// east infill to make one 17 sq m kitchen-diner. Upstairs the main
// block's rear wall is removed east of the landing so the master can
// reach north past the en-suite. The right-hand gable and both
// fireplaces are untouched throughout, and one hipped roof replaces both
// existing roofs.

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
    { id: 'beam-over-master', severity: 'high', note: 'The master reaches north past the original rear wall, which means removing 3.35m of a load-bearing wall at first-floor level with the new roof over it. Assumed, not designed, and the most consequential structural assumption in this stage.' },
    { id: 'area-residual', severity: 'low', note: 'Room areas land within about 1 sq m of every figure the design study prints, which is what an "about" figure on a concept drawing should mean. The residuals are listed in the Survey view rather than tuned away.' },
  ],
  changes: [
    'Fill in the west side of the rear wing for a WC and a boot room / utility.',
    'Fill in the east side of the rear wing and remove the wing\'s east wall, making one kitchen-diner across the garden side.',
    'Remove the main block\'s rear wall at first-floor level east of the landing, so the master can take the en-suite.',
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
        'e-main': ext(X.eMain, { span: ['ext-n', 'ext-s'], segments: [
          { span: ['ext-n', 'main-n'], suffix: '-new', provenance: 'new' },
          { span: ['main-n', 'ext-s'], suffix: '' },
        ] }),
        'w-wing': ext(X.wWing, { span: ['ext-n', 'main-n'], kind: 'internal', note: 'The rear wing\'s original west wall, now internal: it divides the boot room from the kitchen-diner.' }),
        'wc-e': int(X.wcE, { span: ['ext-n', 'wc-s'], ...NEW }),
        'hall-w': int(X.hallW, { span: ['main-n', 'ext-s'] }),
        'hall-e': int(X.hallE, { span: ['main-n', 'ext-s'] }),
      },
      y: {
        'ext-n': ext(Y.extN, { span: ['w-main', 'e-main'], segments: [
          { span: ['w-main', 'w-wing'], suffix: '-w', provenance: 'new' },
          { span: ['w-wing', 'e-wing-line'], suffix: '', note: 'The rear wing\'s original north wall, kept.' },
          { span: ['e-wing-line', 'e-main'], suffix: '-e', provenance: 'new' },
        ] }),
        'wc-s': int(Y.wcS, { span: ['w-main', 'w-wing'], ...NEW }),
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
        'e-main': ext(X.eMain, { span: ['ext-n', 'ext-s'], segments: [
          { span: ['ext-n', 'main-n'], suffix: '-new', provenance: 'new' },
          { span: ['main-n', 'ext-s'], suffix: '' },
        ] }),
        'bed3-e': int(X.bed3E, { span: ['ext-n', 'main-n'], ...NEW }),
        'bed1-e': int(X.bed1E, { span: ['main-n', 'ext-s'] }),
        'land-e': int(X.hallE, { span: ['ext-n', 'ext-s'], ...NEW }),
        'ens-w': int(X.ensW, { span: ['off-s', 'ens-s'], ...NEW }),
      },
      y: {
        'ext-n': ext(Y.extN, { span: ['w-main', 'e-main'], segments: [
          { span: ['w-main', 'w-wing-line'], suffix: '-w', provenance: 'new' },
          { span: ['w-wing-line', 'e-wing-line'], suffix: '' },
          { span: ['e-wing-line', 'e-main'], suffix: '-e', provenance: 'new' },
        ] }),
        'bath-s': int(Y.bathS, { span: ['bed3-e', 'land-e'], ...NEW }),
        'off-s': int(Y.offS, { span: ['land-e', 'e-main'], ...NEW }),
        'ens-s': int(Y.ensS, { span: ['ens-w', 'e-main'], ...NEW }),
        'main-n': ext(Y.mainN, { span: ['w-main', 'land-e'], kind: 'internal', note: 'Kept west of the landing; removed east of it so the master can reach the en-suite.' }),
        'ext-s': ext(Y.extS, { span: ['w-main', 'e-main'] }),
      },
      marks: { 'w-wing-line': X.wWing, 'e-wing-line': X.eWing },
    },
  },

  rooms: [
    { id: 'wc', level: 'ground', name: 'WC', roomKey: 'wc', roomType: 'wc', bounds: { w: 'w-main', e: 'wc-e', n: 'ext-n', s: 'wc-s' } },
    { id: 'boot', level: 'ground', name: 'Boot room / utility', roomKey: 'boot-room', roomType: 'boot_room', rects: [
      { w: 'wc-e', e: 'w-wing', n: 'ext-n', s: 'wc-s' },
      { w: 'w-main', e: 'w-wing', n: 'wc-s', s: 'main-n' },
    ] },
    { id: 'kitchen-diner', level: 'ground', name: 'Kitchen-diner', was: 'kitchen', roomKey: 'kitchen', roomType: 'kitchen', bounds: { w: 'w-wing', e: 'e-main', n: 'ext-n', s: 'main-n' } },
    { id: 'snug', level: 'ground', name: 'Snug', was: 'dining', roomKey: 'dining', roomType: 'living', bounds: { w: 'w-main', e: 'hall-w', n: 'main-n', s: 'ext-s' } },
    { id: 'hall', level: 'ground', name: 'Hallway', roomKey: 'hallway', roomType: 'hallway', bounds: { w: 'hall-w', e: 'hall-e', n: 'main-n', s: 'ext-s' } },
    { id: 'living', level: 'ground', name: 'Living room', was: 'lounge', roomKey: 'lounge', roomType: 'living', bounds: { w: 'hall-e', e: 'e-main', n: 'main-n', s: 'ext-s' } },

    { id: 'bed3', level: 'first', name: 'Bedroom 3', roomType: 'bedroom', bounds: { w: 'w-main', e: 'bed3-e', n: 'ext-n', s: 'main-n' } },
    { id: 'bathroom', level: 'first', name: 'Bathroom', roomKey: 'bathroom', roomType: 'bathroom', bounds: { w: 'bed3-e', e: 'land-e', n: 'ext-n', s: 'bath-s' } },
    { id: 'landing', level: 'first', name: 'Landing', roomType: 'landing', rects: [
      { w: 'bed3-e', e: 'land-e', n: 'bath-s', s: 'main-n' },
      { w: 'bed1-e', e: 'land-e', n: 'main-n', s: 'ext-s' },
    ] },
    { id: 'office', level: 'first', name: 'Office', roomKey: 'office', roomType: 'office', bounds: { w: 'land-e', e: 'e-main', n: 'ext-n', s: 'off-s' } },
    { id: 'ensuite', level: 'first', name: 'En-suite', roomType: 'wc', note: 'A shower room, not a bathroom: 2.4 square metres takes a shower and a WC and nothing else.', bounds: { w: 'ens-w', e: 'e-main', n: 'off-s', s: 'ens-s' } },
    { id: 'master', level: 'first', name: 'Master bedroom', was: 'bed2', roomKey: 'bedroom', roomType: 'bedroom', rects: [
      { w: 'land-e', e: 'ens-w', n: 'off-s', s: 'ext-s' },
      // The en-suite's west wall stops at its own south wall, so below
      // that line the master is one room and there is no face to name.
      { w: X.ensW - T_INT / 2, e: 'e-main', n: 'ens-s', s: 'ext-s' },
    ] },
    { id: 'bed1', level: 'first', name: 'Bedroom 1', roomType: 'bedroom', bounds: { w: 'w-main', e: 'bed1-e', n: 'main-n', s: 'ext-s' } },
  ],

  openings: [
    { id: 'g-win-snug-s', level: 'ground', axis: 'y', line: 'ext-s', x: 1.86, width: 1.35, type: 'window' },
    { id: 'g-door-front', level: 'ground', axis: 'y', line: 'ext-s', x: 4.055, width: 0.90, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'north', angleDeg: 90 } },
    { id: 'g-win-living-s', level: 'ground', axis: 'y', line: 'ext-s', x: 6.295, width: 1.05, type: 'window' },
    { id: 'g-win-snug-w', level: 'ground', axis: 'x', line: 'w-main', y: 6.80, width: 0.85, type: 'window' },
    { id: 'g-win-living-e', level: 'ground', axis: 'x', line: 'e-main', y: 6.80, width: 0.85, type: 'window' },
    // The garden side.
    { id: 'g-doors-garden', level: 'ground', axis: 'y', line: 'ext-n', segment: '-e', x: 6.87, width: 2.10, type: 'door', leaf: 'bifold', provenance: 'new', note: 'Bifold doors from the dining end onto the garden.' },
    { id: 'g-win-kitchen-n', level: 'ground', axis: 'y', line: 'ext-n', x: 4.00, width: 1.20, type: 'window' },
    { id: 'g-win-wc-n', level: 'ground', axis: 'y', line: 'ext-n', segment: '-w', x: 0.78, width: 0.60, type: 'window', provenance: 'new' },
    { id: 'g-door-boot-w', level: 'ground', axis: 'x', line: 'w-main', segment: '-new', y: 2.05, width: 0.85, type: 'door', leaf: 'single', provenance: 'new', swing: { hinge: 'a', toward: 'east', angleDeg: 90 }, note: 'Back door into the boot room. The whole point of a boot room is that it is the door you actually use.' },
    { id: 'g-win-kitchen-e', level: 'ground', axis: 'x', line: 'e-main', segment: '-new', y: 1.60, width: 1.05, type: 'window', provenance: 'new' },
    // Internal.
    { id: 'g-door-wc', level: 'ground', axis: 'y', line: 'wc-s', x: 0.55, width: 0.70, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'north', angleDeg: 90 }, note: 'Opens into the WC. The boot room already has a back door and a door to the kitchen, and three leaves cannot share one corner.' },
    { id: 'g-door-boot', level: 'ground', axis: 'x', line: 'w-wing', y: 2.60, width: 0.80, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'west', angleDeg: 90 } },
    { id: 'g-open-kitchen-snug', level: 'ground', axis: 'y', line: 'main-n', x: 3.00, width: 0.95, type: 'door', leaf: 'cased', note: 'The snug opens straight through into the kitchen-diner. The hall still cannot be a passage, so this is how you reach the back of the house.' },
    { id: 'g-open-kitchen-living', level: 'ground', axis: 'y', line: 'main-n', x: 5.35, width: 1.40, type: 'door', leaf: 'double', swing: { hinge: 'a', toward: 'south', angleDeg: 90 }, note: 'Double doors between the living room and the dining end. Set toward the hall side, clear of the table, and swinging into the living room where there is floor for them.' },
    { id: 'g-door-snug', level: 'ground', axis: 'x', line: 'hall-w', y: 6.70, width: 0.80, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'west', angleDeg: 90 } },
    { id: 'g-door-living', level: 'ground', axis: 'x', line: 'hall-e', y: 6.70, width: 0.80, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'east', angleDeg: 90 } },

    { id: 'f-win-bed1-s', level: 'first', axis: 'y', line: 'ext-s', x: 1.86, width: 1.20, type: 'window' },
    { id: 'f-win-landing-s', level: 'first', axis: 'y', line: 'ext-s', x: 4.09, width: 0.75, type: 'window' },
    { id: 'f-win-master-s', level: 'first', axis: 'y', line: 'ext-s', x: 6.295, width: 1.20, type: 'window' },
    { id: 'f-win-bed1-w', level: 'first', axis: 'x', line: 'w-main', y: 6.80, width: 0.85, type: 'window' },
    { id: 'f-win-master-e', level: 'first', axis: 'x', line: 'e-main', y: 6.80, width: 0.85, type: 'window' },
    { id: 'f-win-bed3-n', level: 'first', axis: 'y', line: 'ext-n', segment: '-w', x: 1.30, width: 1.05, type: 'window', provenance: 'new' },
    { id: 'f-win-bathroom-n', level: 'first', axis: 'y', line: 'ext-n', x: 3.50, width: 0.90, type: 'window', sill: 1.35 },
    { id: 'f-win-office-n', level: 'first', axis: 'y', line: 'ext-n', segment: '-e', x: 6.60, width: 1.35, type: 'window', provenance: 'new' },
    { id: 'f-win-bed3-w', level: 'first', axis: 'x', line: 'w-main', segment: '-new', y: 1.80, width: 0.90, type: 'window', provenance: 'new' },
    { id: 'f-win-office-e', level: 'first', axis: 'x', line: 'e-main', segment: '-new', y: 1.40, width: 0.90, type: 'window', provenance: 'new' },
    // Internal.
    { id: 'f-door-bed3', level: 'first', axis: 'x', line: 'bed3-e', y: 2.80, width: 0.75, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'west', angleDeg: 90 } },
    { id: 'f-door-bathroom', level: 'first', axis: 'y', line: 'bath-s', x: 3.90, width: 0.75, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'north', angleDeg: 90 } },
    { id: 'f-open-landing', level: 'first', axis: 'y', line: 'main-n', x: 4.09, width: 0.80, type: 'door', leaf: 'cased', note: 'The landing runs through the original rear wall at the head of the stairs.' },
    { id: 'f-door-office', level: 'first', axis: 'x', line: 'land-e', y: 2.48, width: 0.75, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'east', angleDeg: 90 } },
    { id: 'f-door-master', level: 'first', axis: 'x', line: 'land-e', y: 4.60, width: 0.80, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'east', angleDeg: 90 } },
    { id: 'f-door-ensuite', level: 'first', axis: 'x', line: 'ens-w', y: 3.70, width: 0.70, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'west', angleDeg: 90 }, note: 'Opens into the master. At 1.7 square metres the en-suite has no floor to give a leaf.' },
    { id: 'f-door-bed1', level: 'first', axis: 'x', line: 'bed1-e', y: 4.20, width: 0.75, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'west', angleDeg: 90 } },
  ],

  stairs: [{
    id: 'main-stair',
    level: 'ground',
    from: 'hall',
    to: 'landing',
    footprint: [3.66, 3.62, 4.42, 5.86],
    upperVoid: [3.66, 4.50, 4.42, 5.86],
    direction: '-y',
    width: 0.76,
    risers: 13,
    rise: 0.2077,
    going: 0.22,
    winders: 4,
    handrail: 'east',
    note: 'Unchanged: the stair stays where it is, which is most of why the front door can stay centred.',
  }],

  roofs: [
    { id: 'roof-hipped', kind: 'hipped', over: [0, 0, W_ENV, D_ENV], ridgeAxis: 'x', pitchDeg: 35, eavesHeight: EAVES, overhang: 0.3, covering: 'plain tile', provenance: 'new', note: 'One hipped roof over the whole square: four hips, no valleys. The design study is explicit that avoiding valleys is the point of squaring the footprint off.' },
  ],

  chimneys: [
    { id: 'chimney-w', footprint: [0, 5.10, 0.56, 5.90], topHeight: 8.5, pots: 2, provenance: 'existing', note: 'Kept and raised to clear the new ridge, rising through the west slope.' },
    { id: 'chimney-e', footprint: [7.64, 5.10, W_ENV, 5.90], topHeight: 8.5, pots: 2, provenance: 'existing', note: 'Kept and raised. The east gable wall and both fireplaces are untouched.' },
  ],

  features: [
    { id: 'breast-snug', level: 'ground', room: 'snug', kind: 'chimney_breast', rect: [0.23, 5.10, 0.56, 5.90], projection: 0.33, height: 2.40 },
    { id: 'breast-living', level: 'ground', room: 'living', kind: 'chimney_breast', rect: [7.64, 5.10, 7.97, 5.90], projection: 0.33, height: 2.40 },
    { id: 'breast-bed1', level: 'first', room: 'bed1', kind: 'chimney_breast', rect: [0.23, 5.10, 0.56, 5.90], projection: 0.33, height: 2.30 },
    { id: 'breast-master', level: 'first', room: 'master', kind: 'chimney_breast', rect: [7.64, 5.10, 7.97, 5.90], projection: 0.33, height: 2.30 },
    { id: 'wardrobes-master', level: 'first', room: 'master', kind: 'fitted_wardrobe', rect: [4.62, 3.015, 6.17, 3.615], height: 2.30, note: 'Fitted wardrobes across the master\'s north end, as the design study draws them.' },
    { id: 'porch', level: 'ground', room: 'hall', kind: 'porch', rect: [3.58, D_ENV, 4.53, 8.62], height: 2.30, roofKind: 'gabled' },
  ],
};

export const stages = [asBought, postExtension];

// --- Variants --------------------------------------------------------
//
// Furniture only. A variant belongs to one stage and changes nothing
// structural, so the empty shell is a real thing you can look at rather
// than a rendering flag.
//
// Every rectangle here is a real size. A double bed is 1.4 x 1.9 because
// that is what a double bed is, not because it looked about right, and
// the same rectangle is what the 3D model extrudes and what the
// clearance check measures the walkway around. `clearance` is the floor
// an item needs kept free in front of it; `belongsTo` says a chair is
// allowed to stand in its own table's clearance, which is the whole
// point of a chair.
//
// Sizes are standard UK furniture, so they are `drafted`: nothing here
// has been measured against anything anybody owns.

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
    id: 'as-bought--moving-in',
    stage: 'as-bought',
    name: 'Moving in',
    derivedFrom: 'as-bought--empty',
    summary: 'Enough to live in the house as it stands, before any building work: two beds, a sofa, a table, and the kitchen it already has.',
    changes: [
      'A double in each of the two bedrooms.',
      'The dining room used as a dining room, because the kitchen is too small to eat in.',
      'Nothing built in: everything here could be carried back out.',
    ],
    furniture: [
      // Kitchen, 3.01 x 3.14. A galley down one side and the cooker on
      // the other, which is all a room this shape takes.
      F('ab-k-worktop-w', 'ground', 'kitchen', 'worktop', 'Worktop', [2.58, 0.28, 3.70, 0.88], { height: 0.92, fixed: true, facing: 's' }),
      F('ab-k-worktop-e', 'ground', 'kitchen', 'worktop', 'Worktop', [4.30, 0.28, 5.49, 0.88], { height: 0.92, fixed: true, facing: 's' }),
      F('ab-k-sink', 'ground', 'kitchen', 'sink', 'Sink', [3.70, 0.28, 4.30, 0.88], { height: 0.92, fixed: true, facing: 's' }),
      F('ab-k-cooker', 'ground', 'kitchen', 'oven', 'Cooker', [2.58, 1.10, 3.18, 1.70], { height: 0.90, facing: 'e', clearance: { front: 0.9 } }),
      F('ab-k-fridge', 'ground', 'kitchen', 'fridge', 'Fridge', [3.50, 2.72, 4.10, 3.32], { height: 1.80, facing: 'n' }),
      // Dining room, 3.26 x 3.89.
      F('ab-d-table', 'ground', 'dining', 'table', 'Dining table', [1.10, 4.90, 2.70, 6.10], { height: 0.75, clearance: { all: 0.6 } }),
      F('ab-d-chair-1', 'ground', 'dining', 'chair', 'Chair', [1.25, 4.35, 1.70, 4.80], { height: 0.9, belongsTo: 'ab-d-table' }),
      F('ab-d-chair-2', 'ground', 'dining', 'chair', 'Chair', [2.10, 4.35, 2.55, 4.80], { height: 0.9, belongsTo: 'ab-d-table' }),
      F('ab-d-chair-3', 'ground', 'dining', 'chair', 'Chair', [1.25, 6.20, 1.70, 6.65], { height: 0.9, belongsTo: 'ab-d-table' }),
      F('ab-d-chair-4', 'ground', 'dining', 'chair', 'Chair', [2.10, 6.20, 2.55, 6.65], { height: 0.9, belongsTo: 'ab-d-table' }),
      F('ab-d-sideboard', 'ground', 'dining', 'shelf', 'Sideboard', [0.70, 7.00, 2.20, 7.45], { height: 0.85, facing: 'n' }),
      // Lounge, 3.35 x 3.89, with the fireplace on the east gable.
      F('ab-l-sofa', 'ground', 'lounge', 'sofa', 'Sofa', [4.75, 4.60, 5.65, 6.20], { height: 0.85, facing: 'e' }),
      F('ab-l-armchair', 'ground', 'lounge', 'sofa', 'Armchair', [5.40, 6.60, 6.30, 7.40], { height: 0.85, facing: 'n' }),
      F('ab-l-stove', 'ground', 'lounge', 'stove', 'Stove', [7.19, 5.30, 7.64, 5.75], { height: 0.65, fixed: true, facing: 'w' }),
      F('ab-l-coffee', 'ground', 'lounge', 'table', 'Coffee table', [6.10, 5.20, 6.90, 5.90], { height: 0.42 }),
      // Bedrooms.
      F('ab-b1-bed', 'first', 'bed1', 'bed', 'Double bed', [0.90, 3.70, 2.30, 5.60], { height: 0.55, facing: 'n' }),
      F('ab-b1-bedside', 'first', 'bed1', 'shelf', 'Bedside table', [2.40, 3.70, 2.80, 4.10], { height: 0.55 }),
      F('ab-b1-wardrobe', 'first', 'bed1', 'wardrobe', 'Wardrobe', [1.60, 6.85, 3.00, 7.45], { height: 2.00, facing: 'n' }),
      F('ab-b2-bed', 'first', 'bed2', 'bed', 'Double bed', [5.60, 3.70, 7.00, 5.60], { height: 0.55, facing: 'n' }),
      F('ab-b2-wardrobe', 'first', 'bed2', 'wardrobe', 'Wardrobe', [5.20, 6.85, 6.60, 7.45], { height: 2.00, facing: 'n' }),
      // Bathroom, over the kitchen wing.
      F('ab-ba-bath', 'first', 'bathroom', 'bath', 'Bath', [2.60, 0.28, 4.30, 0.98], { height: 0.55, fixed: true, facing: 's' }),
      F('ab-ba-wc', 'first', 'bathroom', 'wc', 'WC', [2.60, 1.40, 3.00, 2.05], { height: 0.78, fixed: true, facing: 'e' }),
      F('ab-ba-basin', 'first', 'bathroom', 'basin', 'Basin', [2.60, 2.30, 3.15, 2.75], { height: 0.85, fixed: true, facing: 'e' }),
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
    id: 'post-extension--family',
    stage: 'post-extension',
    name: 'Furnished, as the study draws it',
    derivedFrom: 'post-extension--empty',
    summary: 'The design study\'s own arrangement: a 1.6m island with two stools, a bench seat down the east wall of the dining end, fitted wardrobes across the master, and desks in the snug.',
    changes: [
      'Kitchen run along the garden wall with the sink under the window.',
      '1.6m island with two stools, per the study.',
      'Dining table at the east end with a bench seat down the wall instead of a fourth chair.',
      'Boot room takes the washing machine, the dryer and the freezer, so none of them is in the kitchen.',
      'Desks in the snug rather than the office, because the snug has the light.',
      'No fourth dining chair and no armchair in the snug: the clearance check says neither leaves a way past.',
      'The kitchen-diner is reported as tight, and it is. The study lists the shorter island as a trade-off; this is what that trade-off costs.',
    ],
    furniture: [
      // --- Kitchen-diner, 5.44 x 3.14 -------------------------------
      F('kd-ff', 'ground', 'kitchen-diner', 'fridge', 'Fridge-freezer', [2.58, 0.28, 3.18, 0.88], { height: 1.85, fixed: true, facing: 's' }),
      F('kd-run-w', 'ground', 'kitchen-diner', 'worktop', 'Worktop', [3.18, 0.28, 3.68, 0.88], { height: 0.92, fixed: true, facing: 's' }),
      F('kd-sink', 'ground', 'kitchen-diner', 'sink', 'Sink', [3.68, 0.28, 4.28, 0.88], { height: 0.92, fixed: true, facing: 's' }),
      F('kd-dw', 'ground', 'kitchen-diner', 'dishwasher', 'Dishwasher', [4.28, 0.28, 4.88, 0.88], { height: 0.85, fixed: true, facing: 's' }),
      F('kd-run-e', 'ground', 'kitchen-diner', 'worktop', 'Worktop', [4.88, 0.28, 5.48, 0.88], { height: 0.92, fixed: true, facing: 's' }),
      F('kd-oven', 'ground', 'kitchen-diner', 'oven', 'Oven', [2.58, 0.95, 3.18, 1.55], { height: 0.90, fixed: true, facing: 'e' }),
      F('kd-hob', 'ground', 'kitchen-diner', 'hob', 'Hob', [2.58, 1.55, 3.18, 2.15], { height: 0.92, fixed: true, facing: 'e', clearance: { front: 0.7 } }),
      F('kd-island', 'ground', 'kitchen-diner', 'island', 'Island', [3.95, 1.78, 5.55, 2.58], { height: 0.92, fixed: true, facing: 's', clearance: { front: 0.7, back: 0.85 } }),
      F('kd-stool-1', 'ground', 'kitchen-diner', 'stool', 'Stool', [4.30, 2.58, 4.70, 2.90], { height: 0.70, belongsTo: 'kd-island' }),
      F('kd-stool-2', 'ground', 'kitchen-diner', 'stool', 'Stool', [4.85, 2.58, 5.25, 2.90], { height: 0.70, belongsTo: 'kd-island' }),
      F('kd-table', 'ground', 'kitchen-diner', 'table', 'Dining table', [6.30, 1.45, 7.55, 2.65], { height: 0.75, clearance: { all: 0.40 } }),
      F('kd-bench', 'ground', 'kitchen-diner', 'bench', 'Bench seat', [7.62, 1.35, 7.92, 2.75], { height: 0.45, fixed: true, facing: 'w', belongsTo: 'kd-table' }),
      F('kd-chair-1', 'ground', 'kitchen-diner', 'chair', 'Chair', [6.50, 1.00, 6.90, 1.40], { height: 0.90, belongsTo: 'kd-table' }),
      F('kd-chair-2', 'ground', 'kitchen-diner', 'chair', 'Chair', [6.50, 2.70, 6.90, 3.10], { height: 0.90, belongsTo: 'kd-table' }),
      // --- WC ---------------------------------------------------------
      F('wc-pan', 'ground', 'wc', 'wc', 'WC', [0.90, 0.30, 1.30, 0.95], { height: 0.78, fixed: true, facing: 'w' }),
      F('wc-basin', 'ground', 'wc', 'basin', 'Basin', [0.30, 0.30, 0.80, 0.72], { height: 0.85, fixed: true, facing: 's' }),
      // --- Boot room / utility ---------------------------------------
      F('bt-washer', 'ground', 'boot', 'washer', 'Washing machine', [0.28, 2.60, 0.88, 3.20], { height: 0.85, fixed: true, facing: 'n' }),
      F('bt-dryer', 'ground', 'boot', 'dryer', 'Tumble dryer', [0.93, 2.60, 1.48, 3.20], { height: 0.85, fixed: true, facing: 'n' }),
      F('bt-freezer', 'ground', 'boot', 'fridge', 'Freezer', [1.55, 0.30, 2.25, 0.90], { height: 1.70, facing: 's' }),
      F('bt-bench', 'ground', 'boot', 'bench', 'Bench and coats', [1.85, 1.75, 2.25, 2.15], { height: 0.45, fixed: true, facing: 'w' }),
      // --- Snug, 3.26 x 3.89 ------------------------------------------
      F('sn-sofa', 'ground', 'snug', 'sofa', 'Sofa', [0.35, 6.50, 2.35, 7.40], { height: 0.85, facing: 'n' }),
      F('sn-desk', 'ground', 'snug', 'desk', 'Desks', [0.80, 3.70, 2.40, 4.30], { height: 0.74, facing: 's', clearance: { front: 0.6 } }),
      F('sn-chair-1', 'ground', 'snug', 'chair', 'Chair', [1.00, 4.40, 1.40, 4.80], { height: 0.90, belongsTo: 'sn-desk' }),
      F('sn-chair-2', 'ground', 'snug', 'chair', 'Chair', [1.80, 4.40, 2.20, 4.80], { height: 0.90, belongsTo: 'sn-desk' }),
      F('sn-stove', 'ground', 'snug', 'stove', 'Stove', [0.56, 5.30, 1.01, 5.75], { height: 0.65, fixed: true, facing: 'e' }),
      // --- Living room, 3.35 x 3.89 -----------------------------------
      F('lv-sofa', 'ground', 'living', 'sofa', 'Sofa', [5.45, 6.55, 7.55, 7.45], { height: 0.85, facing: 'n' }),
      F('lv-armchair', 'ground', 'living', 'sofa', 'Armchair', [6.35, 4.40, 7.05, 5.15], { height: 0.85, facing: 's' }),
      F('lv-stove', 'ground', 'living', 'stove', 'Stove', [7.19, 5.30, 7.64, 5.75], { height: 0.65, fixed: true, facing: 'w' }),
      F('lv-coffee', 'ground', 'living', 'table', 'Coffee table', [5.70, 5.55, 6.60, 6.25], { height: 0.42 }),
      F('lv-media', 'ground', 'living', 'shelf', 'Media unit', [7.52, 4.40, 7.92, 5.00], { height: 0.55, facing: 'w' }),
      // --- First floor ------------------------------------------------
      F('b3-bed', 'first', 'bed3', 'bed', 'Single bed', [0.70, 0.30, 1.60, 2.20], { height: 0.55, facing: 'n' }),
      F('b3-wardrobe', 'first', 'bed3', 'wardrobe', 'Wardrobe', [0.28, 2.55, 1.30, 3.15], { height: 2.00, facing: 'n' }),
      F('b3-desk', 'first', 'bed3', 'desk', 'Desk', [1.75, 0.30, 2.40, 1.50], { height: 0.74, facing: 'w' }),
      F('ba-bath', 'first', 'bathroom', 'bath', 'Bath', [2.63, 0.28, 4.33, 0.98], { height: 0.55, fixed: true, facing: 's' }),
      F('ba-wc', 'first', 'bathroom', 'wc', 'WC', [2.62, 1.15, 3.02, 1.80], { height: 0.78, fixed: true, facing: 'e' }),
      F('ba-basin', 'first', 'bathroom', 'basin', 'Basin', [3.08, 1.30, 3.53, 1.80], { height: 0.85, fixed: true, facing: 'n' }),
      F('ld-shelf', 'first', 'landing', 'shelf', 'Bookshelves', [2.62, 2.12, 4.40, 2.42], { height: 1.90, fixed: true, facing: 's' }),
      F('of-desk', 'first', 'office', 'desk', 'PC desk', [7.25, 0.60, 7.90, 2.00], { height: 0.74, facing: 'w', clearance: { front: 0.7 } }),
      F('of-chair', 'first', 'office', 'chair', 'Chair', [6.65, 1.10, 7.10, 1.55], { height: 0.90, belongsTo: 'of-desk' }),
      F('of-shelf', 'first', 'office', 'shelf', 'Shelves', [4.70, 0.28, 6.20, 0.58], { height: 1.90, fixed: true, facing: 's' }),
      F('es-shower', 'first', 'ensuite', 'shower', 'Shower', [7.05, 3.08, 7.90, 3.93], { height: 2.00, fixed: true, facing: 'w' }),
      F('es-wc', 'first', 'ensuite', 'wc', 'WC', [6.38, 3.08, 6.78, 3.73], { height: 0.78, fixed: true, facing: 's' }),
      F('ms-bed', 'first', 'master', 'bed', 'King bed', [5.90, 4.60, 7.50, 6.60], { height: 0.55, facing: 'n' }),
      F('ms-bedside-1', 'first', 'master', 'shelf', 'Bedside table', [5.45, 4.60, 5.85, 5.05], { height: 0.55 }),
      F('ms-bedside-2', 'first', 'master', 'shelf', 'Bedside table', [7.55, 4.60, 7.92, 5.05], { height: 0.55 }),
      F('ms-chair', 'first', 'master', 'sofa', 'Chair', [4.75, 6.60, 5.40, 7.25], { height: 0.85, facing: 'n' }),
      F('b1-bed', 'first', 'bed1', 'bed', 'Double bed', [0.90, 3.70, 2.30, 5.60], { height: 0.55, facing: 'n' }),
      F('b1-bedside-1', 'first', 'bed1', 'shelf', 'Bedside table', [0.30, 3.70, 0.70, 4.10], { height: 0.55 }),
      F('b1-bedside-2', 'first', 'bed1', 'shelf', 'Bedside table', [2.40, 3.70, 2.80, 4.10], { height: 0.55 }),
      F('b1-wardrobe', 'first', 'bed1', 'wardrobe', 'Wardrobe', [1.50, 6.85, 2.90, 7.45], { height: 2.00, facing: 'n' }),
    ],
  },
];
