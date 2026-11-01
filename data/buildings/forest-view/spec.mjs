// Forest View, Tiptoe Road, Wootton - the authored source of the building model.
//
// READ THIS BEFORE CHANGING A NUMBER.
//
// Nothing here is surveyed. Every figure is read off the agent's floor plan
// and particulars (Mitchells, ref NWM260479) or the listing photographs, or
// derived from them by the arithmetic in `derivation` below. The house has
// not been bought. The source images are in PRIVATE storage
// (house-private/forest-view/, decision RA-06) and are never committed.
//
// PLAN SPACE. Metres. x runs west to east, y runs NORTH to SOUTH. The front
// door faces north onto Tiptoe Road (the particulars put the garden to the
// south - TO VERIFY WITH A COMPASS AT THE VIEWING). The origin is the outer
// north-west corner of the two-storey block. The agent's plan is drawn with
// the front at the bottom, so it reads as this plan turned through 180
// degrees: the agent's left is the house's east.
//
// THE SET-OUT. Walls are gridlines (centreline + thickness); rooms name the
// lines that bound them. tools/build-building.mjs does the arithmetic.

const T_EXT = 0.30;        // solid 9in brick plus plaster. Assumed - see assumptions.
const T_INT = 0.10;        // plastered partitions. Assumed.
const T_LIGHT = 0.15;      // lean-to and store outer walls. Assumed (photos show a lightweight lean-to).
const W_ENV = 9.91;        // external width, DERIVED - see derivation 'width'.
const D_ENV = 7.10;        // external depth, DERIVED - see derivation 'depth'.

const X = {
  wMain: T_EXT / 2,                    // 0.15  west external wall (sitting room gable, chimney)
  hallW: 4.02,                         //       hall / landing, west side
  kitE: 4.92,                          //       kitchen | dining partition (ground, rear)
  bathW: 3.37,                         //       bathroom west wall (first, takes a notch out of bedroom 4)
  hallE: 5.90,                         //       hall / landing, east side
  eMain: W_ENV - T_EXT / 2,            // 9.76  east external wall (family room, hipped end)
  rW: 4.585,                           //       rear range, west wall (lean-to)
  rMid: 7.06,                          //       lean-to | store
};

const Y = {
  front: T_EXT / 2,                    // 0.15  front wall, Tiptoe Road
  mid: 4.01,                           //       front rooms | rear rooms
  bathN: 5.25,                         //       bathroom north wall (first)
  rear: D_ENV - T_EXT / 2,             // 6.95  rear wall, garden
  rS: 9.375,                           //       rear range, south wall (outer face 9.45)
};

const ext = (at, opts = {}) => ({ at, t: T_EXT, kind: 'external', provenance: 'existing', ...opts });
const int = (at, opts = {}) => ({ at, t: T_INT, kind: 'internal', provenance: 'existing', ...opts });

const LEVELS = [
  { id: 'ground', name: 'Ground floor', code: 'G', elevation: 0, ceilingHeight: 2.60 },
  { id: 'first', name: 'First floor', code: '1', elevation: 2.90, ceilingHeight: 2.40 },
];
const EAVES = 5.30;

// The plot's features, from the plot rectangle and the envelope. Kept as
// a function so the zones move when either figure is corrected.
function plotFeatures() {
  const P = { x0: -9.0, y0: -6.5, w: 31.0, d: 33.0 };
  const x1 = P.x0 + P.w;
  const y1 = P.y0 + P.d;
  const backOfRange = 9.45;            // outer face of the store and lean-to
  return [
    { id: 'front-garden', kind: 'zone', label: 'Front garden', rect: [P.x0, P.y0, x1, 0],
      confidence: 'drafted', basis: 'Plot rectangle north of the front wall.' },
    { id: 'west-side', kind: 'zone', label: 'West side', rect: [P.x0, 0, 0, backOfRange],
      confidence: 'drafted', basis: 'Plot rectangle west of the house.' },
    { id: 'east-side', kind: 'zone', label: 'East side', rect: [W_ENV, 0, x1, backOfRange],
      confidence: 'drafted', basis: 'Plot rectangle east of the house.' },
    { id: 'rear-garden', kind: 'zone', label: 'Rear garden, south-facing', rect: [P.x0, backOfRange, x1, y1],
      confidence: 'drafted', basis: 'Plot rectangle south of the rear range; the particulars state a private south-facing rear garden.' },
    { id: 'parking', kind: 'parking', label: 'Off-road parking (position to confirm)', rect: [P.x0 + 1.0, P.y0 + 0.5, P.x0 + 6.5, -0.5],
      confidence: 'drafted', basis: 'The particulars state off-road parking but do not show where. Placed by the road on the west side, where the aerial shows open ground; confirm at the viewing.' },
    { id: 'overhead-line', kind: 'line', label: 'Overhead line (approximate; check the wayleave)', points: [[P.x0 + 4.0, P.y0], [P.x0 + 24.0, y1]],
      heightM: 6.0, confidence: 'drafted', basis: 'The photographs show a pole by the road and a line crossing the garden. Route and height are not measured; the title and a wayleave search will say whose it is and where it runs.' },
  ];
}

export const building = {
  id: 'forest-view',
  name: 'Forest View',
  addressLine: 'Forest View, Tiptoe Road, Wootton, New Milton',
  status: 'considering',
  bought: false,
  surveyed: false,
  defaultStage: 'as-bought',
  walls: { construction: 'solid', confidence: 'drafted', basis: 'Period red-brick cottage (particulars and photos); solid 9in brick expected, not yet seen. Lime plaster follows (standing full-restoration scope).' },
  note: 'A candidate property under offer by tender (closing midday 30 Nov 2026), not a purchase. Every dimension is read off the agent\'s drawing or derived from it; none may size a real job or order a real material until it is measured on site.',
  orientation: {
    planUpIs: 'north',
    frontFaces: 'north',  // the street side; the named viewpoints derive Front and Garden from it
    street: 'Tiptoe Road',
    note: 'The front door faces north onto Tiptoe Road; the rear garden faces south (particulars). The Wootton & Bashley Club is to the west and the lane (Wootton Rough) to the east. Orientation is to be checked with a compass at the viewing.',
  },
  // Where it is. The listing's own map pin (ra_evidence E63), not a
  // survey point: it places the house on the location map and nothing
  // else. OpenStreetMap's own labels carry Wootton, the open forest and
  // New Milton station, so no other marker is placed by hand.
  location: { lat: 50.781945, lon: -1.646092, zoom: 13, confidence: 'researched', source: 'Listing map pin (Zoopla, 30 Oct 2026; ra_evidence E63)' },
  grid: { cell: 1.0, originX: 0, originY: 0 },
  defaults: {
    wallExternal: T_EXT,
    wallInternal: T_INT,
    wallParty: 0.3,
    floorThickness: 0.3,
    doorHeight: 1.98,
    doorWidth: 0.78,
    windowSill: 0.9,
    windowHead: 2.10,
    garageDoorHeight: 2.13,
    eavesHeight: EAVES,
    roofPitchDeg: 40,
  },
  // The envelope is the whole footprint: the two-storey block plus the
  // single-storey store and lean-to behind it (outer face at y 9.45).
  envelope: { widthM: W_ENV, depthM: 9.45 },

  // THE PLOT. A schematic rectangle traced from the agent's aerial
  // photograph: about a quarter of an acre (stated), about 31 x 33m, the
  // house set about 6.5m back from Tiptoe Road and about 9m in from the
  // west boundary. Plus or minus several metres until the HM Land
  // Registry title plan is read. No hedge or planting is drawn: those
  // would dress an estimate up as a survey. The FEATURES below are drawn
  // because they change what can be built - where a car stands, where a
  // live wire crosses the garden - and each says how little is known.
  plot: {
    widthM: 31.0,
    depthM: 33.0,
    originX: -9.0,
    originY: -6.5,
    confidence: 'drafted',
    source: 'particulars',
    note: 'Schematic. The particulars state about a quarter of an acre with a south-facing rear garden and off-road parking; the rectangle and the house\'s position in it are traced from the aerial photograph. An overhead line crosses the garden (photos). Replace with the title plan.',
    neighbours: {
      north: 'Tiptoe Road',
      west: 'Wootton & Bashley Club (to check)',
      east: 'Wootton Rough (lane)',
      south: 'Fields and gardens',
    },
    // Drafted, every one. Zones are the plot rectangle cut by the house
    // envelope (arithmetic, not tracing); the parking and the line are
    // placed from the photographs and say so. The plan draws them dotted
    // and labelled; the 3D view draws only the line, on two poles.
    features: plotFeatures(),
  },

  sources: [
    {
      id: 'agent-plan',
      kind: 'floor_plan',
      label: 'Mitchells floor plan (in the particulars, NWM260479)',
      confidence: 'researched',
      supplies: ['room clear sizes to the centimetre', 'room adjacency', 'window, door and stair positions', 'fireplaces', 'level areas (72.5 and 59.8 m2, 132.3 total)'],
      storageKey: 'house-private/forest-view/particulars-NWM260479.pdf',
    },
    {
      id: 'particulars',
      kind: 'particulars',
      label: 'Mitchells particulars, 8 pages',
      confidence: 'researched',
      supplies: ['plot about a quarter of an acre', 'south-facing rear garden', 'off-road parking', 'mains gas, electricity, water and drainage', 'council tax band E'],
      storageKey: 'house-private/forest-view/particulars-NWM260479.pdf',
    },
    {
      id: 'listing-photos',
      kind: 'photograph',
      label: 'Listing photographs: front, rear, aerial and rooms',
      confidence: 'researched',
      supplies: ['window count and arrangement', 'slate roof, gable with chimney at the west end, hip at the east end', 'glazed porch', 'rear lean-to and store', 'kitchen sink, units and cooker; radiators'],
      storageKey: 'house-private/forest-view/particulars-NWM260479.pdf',
    },
  ],

  statedDimensions: [
    { of: 'room:as-bought/sitting', kind: 'clearSize', value: [3.67, 3.66], source: 'agent-plan', note: 'Printed 3.66 x 3.67; which way round is not stated.' },
    { of: 'room:as-bought/family', kind: 'clearSize', value: [3.66, 3.66], source: 'agent-plan' },
    { of: 'room:as-bought/kitchen', kind: 'clearSize', value: [4.45, 2.74], source: 'agent-plan' },
    { of: 'room:as-bought/dining', kind: 'clearSize', value: [4.64, 2.74], source: 'agent-plan', note: 'Printed as a maximum.' },
    { of: 'room:as-bought/bed1', kind: 'clearSize', value: [3.67, 3.66], source: 'agent-plan' },
    { of: 'room:as-bought/bed2', kind: 'clearSize', value: [3.66, 3.66], source: 'agent-plan' },
    { of: 'room:as-bought/bed3', kind: 'clearSize', value: [3.66, 2.74], source: 'agent-plan' },
    { of: 'room:as-bought/bed4', kind: 'areaM2', value: 10.06, source: 'agent-plan', note: 'Printed 2.74 x 3.67 overall (10.06 m2). The plan draws the bathroom taking a notch out of its south-east corner, so the L-shaped room is smaller by about the notch; the difference is reported, not absorbed.' },
  ],
};

const DERIVATION = [
  {
    id: 'width',
    question: 'How wide is the house, and the hall?',
    working: `${T_EXT} + 3.67 (sitting) + ${T_INT} + hall + ${T_INT} + 3.66 (family) + ${T_EXT} = width; hall scaled off the plan at 1.78`,
    result: `width = ${W_ENV}`,
    residualMm: 120,
    note: 'The front rooms are printed; the hall is scaled. The rear rooms (kitchen 4.45 + dining 4.64 + a 0.10 partition = 9.19) come out 120mm short of the front (9.31). The model keeps the printed dining width and lets the kitchen take the difference, so the Survey view reports 120mm on the kitchen rather than hiding it.',
  },
  {
    id: 'depth',
    question: 'How deep is the house?',
    working: `${T_EXT} + 3.66 (front rooms) + ${T_INT} + 2.74 (rear rooms) + ${T_EXT} = ${D_ENV}`,
    result: `depth = ${D_ENV}`,
    residualMm: 0,
    note: 'Both room depths are printed; scaling the plan gives 7.1 to 7.2m.',
  },
  {
    id: 'areas',
    question: 'Do the areas agree with the agent?',
    working: 'Ground: main rooms about 58.2 + store + lean-to + porch, against 72.5 stated. First: bedrooms about 46.1 + landing about 8.9 + bathroom about 3.6, against 59.8 stated.',
    result: 'ground about +0.3 m2; first about -1.2 m2',
    residualMm: 0,
    note: 'Reported, not absorbed. The agent\'s areas are approximate by their own label.',
  },
];

const SHARED_ASSUMPTIONS = [
  { id: 'wall-external', severity: 'medium', note: `External walls modelled at ${T_EXT}m solid brick with plaster. Not measured: measure a window reveal at the viewing.` },
  { id: 'wall-internal', severity: 'low', note: `Internal partitions modelled at ${T_INT}m. Not measured.` },
  { id: 'storey-heights', severity: 'medium', note: 'Ceilings of 2.60 (ground) and 2.40 (first) and eaves at 5.30 are typical for the age, not measured. Everything vertical rests on them.' },
  { id: 'rear-range', severity: 'medium', note: 'The store and lean-to are scaled off the plan (about 5.4 x 2.35m outside) with lightweight 0.15m outer walls; their roof is a single mono-pitch slope off the rear wall, as the photos show.' },
  { id: 'openings', severity: 'medium', note: 'Window and door positions and widths are scaled off the drawing, not dimensioned on it.' },
  { id: 'stairs', severity: 'medium', note: 'A straight flight up the west side of the hall rising south, 0.78 wide, 14 risers at 0.207 (2.90m) and 13 goings at 0.20. The plan shows the flight; nothing dimensions it.' },
  { id: 'chimneys', severity: 'medium', note: 'One stack is visible, on the west gable. Both front rooms upstairs and down have chimney breasts; the east breasts\' flue route through the hip is unknown - check in the loft.' },
  { id: 'orientation', severity: 'high', note: 'Front assumed to face north (particulars: south-facing rear garden). Check with a compass; if wrong, the sun study and every elevation label are wrong too.' },
];

const asBought = {
  id: 'as-bought',
  name: 'Day one - as bought',
  sequence: 10,
  status: 'existing',
  summary: 'The house as the agent\'s plan draws it: sitting room, hall and family room at the front, kitchen and dining room behind, a single-storey store and lean-to at the back, four bedrooms and a small bathroom upstairs, under a slate roof with a gable and chimney at the west end and a hip at the east.',
  derivation: DERIVATION,
  assumptions: SHARED_ASSUMPTIONS,
  levels: LEVELS,

  grid: {
    ground: {
      x: {
        'w-main': ext(X.wMain, { span: ['front', 'rear'] }),
        'hall-w': int(X.hallW, { span: ['front', 'mid'] }),
        'hall-e': int(X.hallE, { span: ['front', 'mid'] }),
        'kit-e': int(X.kitE, { span: ['mid', 'rear'] }),
        'e-main': ext(X.eMain, { span: ['front', 'rear'] }),
        'r-w': ext(X.rW, { t: T_LIGHT, span: ['rear', 'r-s'] }),
        'r-mid': int(X.rMid, { span: ['rear', 'r-s'] }),
        'r-e': ext(X.eMain, { span: ['rear', 'r-s'], note: 'The store\'s east wall continues the house\'s east wall line.' }),
      },
      y: {
        'front': ext(Y.front, { span: ['w-main', 'e-main'] }),
        'mid': int(Y.mid, { span: ['w-main', 'e-main'] }),
        'rear': ext(Y.rear, { span: ['w-main', 'e-main'] }),
        'r-s': ext(Y.rS, { t: T_LIGHT, span: ['r-w', 'r-e'] }),
      },
    },
    first: {
      x: {
        'w-main': ext(X.wMain, { span: ['front', 'rear'] }),
        'land-w': int(X.hallW, { span: ['front', 'bath-n'] }),
        'bath-w': int(X.bathW, { span: ['bath-n', 'rear'] }),
        'land-e': int(X.hallE, { span: ['front', 'rear'] }),
        'e-main': ext(X.eMain, { span: ['front', 'rear'] }),
      },
      y: {
        'front': ext(Y.front, { span: ['w-main', 'e-main'] }),
        'mid-w': int(Y.mid, { span: ['w-main', 'land-w'] }),
        'mid-e': int(Y.mid, { span: ['land-e', 'e-main'] }),
        'bath-n': int(Y.bathN, { span: ['bath-w', 'land-e'] }),
        'rear': ext(Y.rear, { span: ['w-main', 'e-main'] }),
      },
    },
  },

  rooms: [
    { id: 'sitting', level: 'ground', name: 'Sitting Room', roomKey: 'lounge', roomType: 'living', bounds: { w: 'w-main', e: 'hall-w', n: 'front', s: 'mid' } },
    { id: 'hall', level: 'ground', name: 'Hall', roomKey: 'hallway', roomType: 'hallway', bounds: { w: 'hall-w', e: 'hall-e', n: 'front', s: 'mid' } },
    { id: 'family', level: 'ground', name: 'Family Room', roomType: 'living', bounds: { w: 'hall-e', e: 'e-main', n: 'front', s: 'mid' } },
    { id: 'kitchen', level: 'ground', name: 'Kitchen', roomKey: 'kitchen', roomType: 'kitchen', bounds: { w: 'w-main', e: 'kit-e', n: 'mid', s: 'rear' } },
    { id: 'dining', level: 'ground', name: 'Dining Room', roomKey: 'dining', roomType: 'dining', bounds: { w: 'kit-e', e: 'e-main', n: 'mid', s: 'rear' } },
    { id: 'leanto', level: 'ground', name: 'Lean-to', roomType: 'utility', bounds: { w: 'r-w', e: 'r-mid', n: 'rear', s: 'r-s' } },
    { id: 'store', level: 'ground', name: 'Store', roomType: 'storage', bounds: { w: 'r-mid', e: 'r-e', n: 'rear', s: 'r-s' } },

    { id: 'bed1', level: 'first', name: 'Bedroom 1', roomKey: 'bedroom', roomType: 'bedroom', bounds: { w: 'w-main', e: 'land-w', n: 'front', s: 'mid-w' } },
    { id: 'landing', level: 'first', name: 'Landing', roomType: 'landing', bounds: { w: 'land-w', e: 'land-e', n: 'front', s: 'bath-n' } },
    { id: 'bed2', level: 'first', name: 'Bedroom 2', roomKey: 'bedroom', roomType: 'bedroom', bounds: { w: 'land-e', e: 'e-main', n: 'front', s: 'mid-e' } },
    { id: 'bed4', level: 'first', name: 'Bedroom 4', roomKey: 'bedroom', roomType: 'bedroom', rects: [
      { w: 'w-main', e: 'land-w', n: 'mid-w', s: 'bath-n' },
      // South of the bathroom's north wall, bedroom 4 stops at the
      // bathroom's west wall: the notch the agent's plan draws.
      { w: 'w-main', e: 'bath-w', n: 'bath-n', s: 'rear' },
    ] },
    { id: 'bathroom', level: 'first', name: 'Bathroom', roomKey: 'bathroom', roomType: 'bathroom', bounds: { w: 'bath-w', e: 'land-e', n: 'bath-n', s: 'rear' } },
    { id: 'bed3', level: 'first', name: 'Bedroom 3', roomKey: 'bedroom', roomType: 'bedroom', bounds: { w: 'land-e', e: 'e-main', n: 'mid-e', s: 'rear' } },
  ],

  openings: [
    // GROUND, front (north): two windows either side of the porch door.
    { id: 'g-win-sitting-n', level: 'ground', axis: 'y', line: 'front', x: 1.91, width: 1.40, type: 'window' },
    { id: 'g-door-front', level: 'ground', axis: 'y', line: 'front', x: 4.96, width: 0.82, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'south' }, note: 'Inner front door, inside the glazed porch.' },
    { id: 'g-win-family-n', level: 'ground', axis: 'y', line: 'front', x: 8.01, width: 1.40, type: 'window' },
    // GROUND, rear (south) and sides.
    { id: 'g-win-kitchen-s', level: 'ground', axis: 'y', line: 'rear', x: 2.86, width: 1.30, type: 'window', note: 'Over the sink (photo).' },
    { id: 'g-door-dining-leanto', level: 'ground', axis: 'y', line: 'rear', x: 5.40, width: 0.76, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'south' }, note: 'Dining room out to the lean-to (particulars: a door leading outside).' },
    { id: 'g-win-dining-s', level: 'ground', axis: 'y', line: 'rear', x: 7.61, width: 0.60, type: 'window', note: 'Small window onto the store roof area; scaled.' },
    { id: 'g-win-kitchen-w', level: 'ground', axis: 'x', line: 'w-main', y: 5.40, width: 1.00, type: 'window', note: 'Kitchen is double aspect (particulars).' },
    { id: 'g-win-dining-e', level: 'ground', axis: 'x', line: 'e-main', y: 5.40, width: 1.00, type: 'window', note: 'Dining room is double aspect (particulars).' },
    // GROUND, internal.
    { id: 'g-door-sitting', level: 'ground', axis: 'x', line: 'hall-w', y: 0.80, width: 0.78, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'west' } },
    { id: 'g-door-family', level: 'ground', axis: 'x', line: 'hall-e', y: 3.35, width: 0.78, type: 'door', leaf: 'single', swing: { hinge: 'b', toward: 'east' } },
    { id: 'g-door-hall-dining', level: 'ground', axis: 'y', line: 'mid', x: 5.40, width: 0.76, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'south' }, note: 'Off the back of the hall; the agent\'s plan draws a small lobby with doors to the kitchen and dining room here.' },
    { id: 'g-door-kitchen-dining', level: 'ground', axis: 'x', line: 'kit-e', y: 4.70, width: 0.76, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'west' } },
    // REAR RANGE.
    { id: 'g-door-back', level: 'ground', axis: 'x', line: 'r-w', y: 8.30, width: 0.80, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'east' }, note: 'Lean-to door to the garden (plan and rear photo).' },
    { id: 'g-door-store', level: 'ground', axis: 'x', line: 'r-mid', y: 8.20, width: 0.76, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'east' } },
    { id: 'g-win-leanto-s', level: 'ground', axis: 'y', line: 'r-s', x: 5.85, width: 1.20, type: 'window' },

    // FIRST, front (north): three windows, the middle one lights the landing over the porch.
    { id: 'f-win-bed1-n', level: 'first', axis: 'y', line: 'front', x: 1.91, width: 1.40, type: 'window' },
    { id: 'f-win-landing-n', level: 'first', axis: 'y', line: 'front', x: 4.96, width: 0.90, type: 'window' },
    { id: 'f-win-bed2-n', level: 'first', axis: 'y', line: 'front', x: 8.01, width: 1.40, type: 'window' },
    // FIRST, rear (south).
    { id: 'f-win-bed4-s', level: 'first', axis: 'y', line: 'rear', x: 1.81, width: 1.40, type: 'window' },
    { id: 'f-win-bath-s', level: 'first', axis: 'y', line: 'rear', x: 4.51, width: 0.80, type: 'window', sill: 1.35 },
    { id: 'f-win-bed3-s', level: 'first', axis: 'y', line: 'rear', x: 8.81, width: 1.40, type: 'window' },
    // FIRST, internal.
    { id: 'f-door-bed1', level: 'first', axis: 'x', line: 'land-w', y: 0.95, width: 0.75, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'west' } },
    { id: 'f-door-bed2', level: 'first', axis: 'x', line: 'land-e', y: 0.95, width: 0.75, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'east' } },
    { id: 'f-door-bed4', level: 'first', axis: 'x', line: 'land-w', y: 4.60, width: 0.72, type: 'door', leaf: 'single', swing: { hinge: 'b', toward: 'west' } },
    { id: 'f-door-bed3', level: 'first', axis: 'x', line: 'land-e', y: 4.60, width: 0.72, type: 'door', leaf: 'single', swing: { hinge: 'b', toward: 'east' } },
    { id: 'f-door-bath', level: 'first', axis: 'y', line: 'bath-n', x: 4.60, width: 0.70, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'south' } },
  ],

  stairs: [{
    id: 'main-stair',
    level: 'ground',
    from: 'hall',
    to: 'landing',
    footprint: [4.07, 1.36, 4.85, 3.96],
    upperVoid: [4.07, 1.36, 4.85, 3.96],
    direction: '+y',
    width: 0.78,
    risers: 14,
    rise: 0.2071,
    going: 0.20,
    winders: 0,
    note: '14 risers at 0.2071 make the assumed 2.90m storey; 13 goings at 0.20 make the 2.60m run, from just inside the sitting-room door to the back of the hall.',
  }],

  roofs: [
    { id: 'roof-main', kind: 'hipped', hipEnds: ['end'], over: [0, 0, W_ENV, D_ENV], ridgeAxis: 'x', pitchDeg: 40, eavesHeight: EAVES, overhang: 0.3, covering: 'slate', provenance: 'existing', note: 'Gable at the west (sitting-room) end with the chimney; hip at the east (family-room) end, as the photos show.' },
    { id: 'roof-rear', kind: 'mono', over: [4.51, D_ENV, W_ENV, 9.45], ridgeAxis: 'x', pitchDeg: 15, eavesHeight: 2.65, overhang: 0.15, covering: 'sheet', coversLevel: 'ground', provenance: 'existing', note: 'One slope off the rear wall over the store and lean-to; old sheeting - asbestos survey before it is touched.' },
  ],

  chimneys: [
    { id: 'chimney-w', footprint: [0, 3.15, 0.60, 3.95], topHeight: 9.30, pots: 2, provenance: 'existing', note: 'West gable, the only stack visible in the photos. Serves the sitting room and bedroom 1.' },
  ],

  features: [
    { id: 'breast-sitting', level: 'ground', room: 'sitting', kind: 'chimney_breast', rect: [0.30, 1.25, 0.72, 2.65], height: 2.60, note: 'Timber surround with tiled backing (particulars).' },
    { id: 'breast-family', level: 'ground', room: 'family', kind: 'chimney_breast', rect: [9.19, 1.25, 9.61, 2.65], height: 2.60, note: 'Cast-iron fireplace (particulars). Flue route through the hip unknown.' },
    { id: 'breast-bed1', level: 'first', room: 'bed1', kind: 'chimney_breast', rect: [0.30, 1.25, 0.72, 2.65], height: 2.40 },
    { id: 'breast-bed2', level: 'first', room: 'bed2', kind: 'chimney_breast', rect: [9.19, 1.25, 9.61, 2.65], height: 2.40 },
    { id: 'porch', level: 'ground', room: 'hall', kind: 'porch', rect: [4.01, -1.45, 5.91, 0], height: 2.95, eavesM: 2.30, cheekM: 0.12, overhang: 0.08, note: 'A small gabled, glazed porch over the front door (photos), about 1.9 x 1.45m, scaled. Modelled with the engine\'s porch: cheeks and a pitched roof.' },
  ],
};

export const stages = [asBought];

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
    name: 'The fittings in the photos',
    derivedFrom: 'as-bought--empty',
    summary: 'Only what the particulars show fixed in place: the kitchen\'s sink under the rear window and the bathroom\'s suite. Whether any of it works is unconfirmed (the agent says the kitchen is not functional).',
    changes: [
      'Sink and worktop along the kitchen\'s rear wall, under the window.',
      'Bath along the bathroom\'s rear wall, WC and basin at its east end.',
    ],
    furniture: [
      F('ab-k-sink', 'ground', 'kitchen', 'sink', 'Sink', [2.31, 6.20, 3.41, 6.80], { height: 0.92, fixed: true, facing: 'n' }),
      F('ab-k-worktop', 'ground', 'kitchen', 'worktop', 'Worktop', [3.41, 6.20, 4.60, 6.80], { height: 0.92, fixed: true, facing: 'n' }),
      F('ab-ba-bath', 'first', 'bathroom', 'bath', 'Bath', [3.45, 6.10, 5.05, 6.80], { height: 0.55, fixed: true, facing: 'n' }),
      F('ab-ba-wc', 'first', 'bathroom', 'wc', 'WC', [5.30, 6.15, 5.75, 6.80], { height: 0.78, fixed: true, facing: 'n' }),
      F('ab-ba-basin', 'first', 'bathroom', 'basin', 'Basin', [5.30, 5.32, 5.80, 5.75], { height: 0.85, fixed: true, facing: 's' }),
    ],
  },
];
