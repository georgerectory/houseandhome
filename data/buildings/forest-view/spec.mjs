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
  { id: 'wall-external', severity: 'high', note: `External walls modelled at ${T_EXT}m solid brick with plaster. Not measured. The front brickwork in the listing photo reads as stretcher bond (no headers), which usually means a CAVITY wall (ra_evidence E72, contradiction fv-wall-construction): measure a window reveal at the viewing before the plaster spec (lime or gypsum) is decided.` },
  { id: 'wall-internal', severity: 'low', note: `Internal partitions modelled at ${T_INT}m. Not measured.` },
  { id: 'storey-heights', severity: 'medium', note: 'Ceilings of 2.60 (ground) and 2.40 (first) and eaves at 5.30 are typical for the age, not measured. Everything vertical rests on them.' },
  { id: 'rear-range', severity: 'medium', note: 'The store and lean-to are scaled off the plan (about 5.4 x 2.35m outside) with lightweight 0.15m outer walls; their roof is a single mono-pitch slope off the rear wall, as the photos show.' },
  { id: 'openings', severity: 'medium', note: 'Window and door positions and widths are scaled off the drawing, not dimensioned on it.' },
  { id: 'stairs', severity: 'medium', note: 'A straight flight up the west side of the hall rising south, 0.78 wide, 14 risers at 0.207 (2.90m) and 13 goings at 0.20. The plan shows the flight; nothing dimensions it.' },
  { id: 'chimneys', severity: 'high', note: 'One stack only, on the west gable (every external and aerial photo). The plan and photos put fireplaces on the EAST wall in the family room, dining room, bedroom 2 and bedroom 3, so the east stack has been taken down (E74). Check in the loft that what remains is supported and the flues are capped and vented; the west gable shows salt bloom along its flue line (E75).' },
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
    { id: 'g-win-dining-e', level: 'ground', axis: 'x', line: 'e-main', y: 6.42, width: 0.60, type: 'window', note: 'Dining room is double aspect (particulars). Small, beside the chimney breast near the south corner (photo 3), so not centred.' },
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
    // The rear east pair, drawn on the agent's plan and seen in the photos:
    // the dining room's fireplace (gas fire, with an old cast-iron copper in
    // the north alcove) and bedroom 3's. Their stack is gone (assumption
    // chimneys). Position along the wall scaled off the plan and photo 3.
    { id: 'breast-dining', level: 'ground', room: 'dining', kind: 'chimney_breast', rect: [9.19, 4.86, 9.61, 6.06], height: 2.60, note: 'Cabinet gas fire of the back-boiler type; a cast-iron copper or range in the north alcove (photo 3). Flue route unknown: no east stack.' },
    { id: 'breast-bed3', level: 'first', room: 'bed3', kind: 'chimney_breast', rect: [9.19, 4.86, 9.61, 6.06], height: 2.40, note: 'Drawn on the agent\'s plan; stacked over the dining room\'s breast.' },
    { id: 'porch', level: 'ground', room: 'hall', kind: 'porch', rect: [4.01, -1.45, 5.91, 0], height: 2.95, eavesM: 2.30, cheekM: 0.12, overhang: 0.08, note: 'A small gabled, glazed porch over the front door (photos), about 1.9 x 1.45m, scaled. Modelled with the engine\'s porch: cheeks and a pitched roof.' },
  ],
};

// ---------------------------------------------------------------------
// THE DESIGN STAGES. The owner's five ideas (31 Oct 2026): kitchen and
// dining opened into one room, a downstairs WC, a boot room, the best use
// of the store and lean-to, and an en-suite upstairs. Each stage is a
// FORK - a full copy of the stage it derives from, with its own geometry -
// so stageDiff() measures what changed and a narrative that disagrees
// with the geometry is caught. Nothing here is designed by an engineer or
// agreed with the National Park; every structural move is an assumption,
// and the checkers report what does not fit rather than moving it.
// ---------------------------------------------------------------------
const NEW = { provenance: 'new' };
const copy = (o) => JSON.parse(JSON.stringify(o));
const without = (list, ids) => list.filter((o) => !ids.includes(o.id));

const X2 = {
  wcE: 8.21,      // S1: WC | utility, in the old store
  ensE: 2.37,     // S2a: en-suite east wall, in old bedroom 4
};
const Y2 = {
  ensS: 5.31,     // S2a: en-suite south wall
};

// S1 - GROUND FLOOR OPENED. Kitchen and dining become one room; the rear
// range is rebuilt on its own footprint as boot room, WC and utility.
const s1Ground = copy(asBought.grid.ground);
delete s1Ground.x['kit-e'];
s1Ground.x['r-w'] = ext(X.rW, { t: T_LIGHT, span: ['rear', 'r-s'], ...NEW, note: 'Rear range rebuilt on the same line.' });
s1Ground.x['r-e'] = ext(X.eMain, { span: ['rear', 'r-s'], ...NEW, note: 'Rear range rebuilt; continues the house\'s east wall line.' });
s1Ground.x['wc-e'] = int(X2.wcE, { span: ['rear', 'r-s'], ...NEW });
s1Ground.y['r-s'] = ext(Y.rS, { t: T_LIGHT, span: ['r-w', 'r-e'], ...NEW, note: 'Rear range rebuilt on the same line.' });

const groundOpen = {
  id: 'ground-floor-open',
  name: 'S1 - Kitchen-diner, boot room, WC and utility',
  sequence: 20,
  status: 'planned',
  derivedFrom: 'as-bought',
  summary: 'The kitchen and dining room opened into one kitchen-diner across the garden side (about 25.5 m2), and the store and lean-to rebuilt on their own footprint as a boot room by the back door, a downstairs WC and a utility. First floor unchanged.',
  derivation: DERIVATION,
  assumptions: [
    ...SHARED_ASSUMPTIONS,
    { id: 's1-beam', severity: 'high', note: 'The kitchen | dining partition (kit-e) is assumed load-bearing (bedroom 4 and the bathroom sit over it), so removing it needs a steel beam on padstones, a structural engineer and building control. Assumed, not designed.' },
    { id: 's1-no-island', severity: 'medium', note: 'The kitchen-diner is 2.74m deep. An island with 0.9m clear round it needs about 3.3m (0.6 run + 0.9 + 0.9 island + 0.9), so an island does NOT fit; the lived-in arrangement uses a run and a table. A peninsula or a deeper room (S2b does not deepen it) are the alternatives.' },
    { id: 's1-range', severity: 'medium', note: 'The owner wants a range "in the heart of the home". The dining room\'s east breast has an old cast-iron copper or range in its north alcove (photo 3): the natural place for one. But that breast\'s stack is gone (E74), so a range there needs a new flue (twin-wall, or a reinstated stack: NFNPA). Until that is settled the range is drawn on the kitchen end.' },
    { id: 's1-rear-range', severity: 'high', note: 'The rear range is rebuilt on the existing footprint and lines (walls still modelled at 0.15m, so the rooms keep their drawn size; a real insulated wall is thicker and takes from them). Rebuilding on the same footprint MAY be permitted development in the National Park: check with the NFNPA before relying on it. Asbestos survey before the old roof sheeting is touched.' },
    { id: 's1-wc-drain', severity: 'medium', note: 'The WC drains to the rear; where the existing drain runs is unknown until the viewing (soil-stack position).' },
    { id: 's1-front-boot-room', severity: 'low', note: 'Alternative noted for the sit-down (owner, 1 Nov 2026): a boot room at the FRONT by the porch with the WC off the hall, as in the owner\'s earlier layouts. Not drawn here, because nothing on the plan supports it yet.' },
  ],
  changes: [
    'Remove the partition between the kitchen and the dining room (kit-e) on a steel beam, making one kitchen-diner across the garden side.',
    'Remove the kitchen to dining door, which no longer has a wall.',
    'Rebuild the rear range on its own footprint: new west, south and east walls and a new slate mono-pitch roof.',
    'Turn the lean-to into a boot room by the existing back door, reached from the kitchen-diner through the existing rear door.',
    'Divide the store into a WC (off the boot room) and a utility (off the kitchen-diner, through a new door in the rear wall).',
    'Block the dining room\'s small rear window, which would open into the WC; give the WC and the utility windows in the new south wall.',
  ],
  levels: LEVELS,
  grid: { ground: s1Ground, first: copy(asBought.grid.first) },
  rooms: [
    ...without(asBought.rooms, ['kitchen', 'dining', 'leanto', 'store']),
    { id: 'kitchen-diner', was: 'kitchen', level: 'ground', name: 'Kitchen-diner', roomKey: 'kitchen', roomType: 'kitchen', bounds: { w: 'w-main', e: 'e-main', n: 'mid', s: 'rear' } },
    { id: 'boot', was: 'leanto', level: 'ground', name: 'Boot room', roomKey: 'boot-room', roomType: 'boot_room', bounds: { w: 'r-w', e: 'r-mid', n: 'rear', s: 'r-s' } },
    { id: 'wc', was: 'store', level: 'ground', name: 'WC', roomType: 'wc', bounds: { w: 'r-mid', e: 'wc-e', n: 'rear', s: 'r-s' } },
    { id: 'utility', level: 'ground', name: 'Utility', roomType: 'utility', bounds: { w: 'wc-e', e: 'r-e', n: 'rear', s: 'r-s' } },
  ],
  openings: [
    ...without(asBought.openings, ['g-door-kitchen-dining', 'g-win-dining-s', 'g-door-store']),
    { id: 'g-door-wc', level: 'ground', axis: 'x', line: 'r-mid', y: 7.60, width: 0.76, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'east' }, note: 'WC off the boot room, moved north of the old store door so the pan clears the swing.' },
    { id: 'g-door-utility', level: 'ground', axis: 'y', line: 'rear', x: 8.98, width: 0.76, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'south' }, note: 'New: kitchen-diner to utility.' },
    { id: 'g-win-wc-s', level: 'ground', axis: 'y', line: 'r-s', x: 7.63, width: 0.50, type: 'window', sill: 1.40, note: 'New, high: WC with an extract fan.' },
    { id: 'g-win-utility-s', level: 'ground', axis: 'y', line: 'r-s', x: 9.00, width: 0.80, type: 'window', note: 'New.' },
  ],
  stairs: copy(asBought.stairs),
  roofs: [
    asBought.roofs[0],
    { id: 'roof-rear-new', kind: 'mono', over: [4.51, D_ENV, W_ENV, 9.45], ridgeAxis: 'x', pitchDeg: 15, eavesHeight: 2.65, overhang: 0.15, covering: 'slate', coversLevel: 'ground', provenance: 'new', note: 'The rear range\'s roof rebuilt as one slope off the rear wall, in slate to match (National Park materials).' },
  ],
  chimneys: copy(asBought.chimneys),
  features: copy(asBought.features),
};

// A child of S1 inherits S1's rebuilt walls as EXISTING: provenance is
// relative to the stage a fork derives from, so a child's takeoff prices
// only what the child adds, and the rear range is never counted twice.
const asBuilt = (grid) => {
  const g = copy(grid);
  for (const axis of ['x', 'y']) {
    for (const w of Object.values(g[axis])) if (w.provenance === 'new') w.provenance = 'existing';
  }
  return g;
};

// S2a - EN-SUITE WITHIN THE FOOTPRINT. Taken from the west end of bedroom
// 4, against bedroom 1's south wall, entered from bedroom 1.
const s2aFirst = copy(asBought.grid.first);
s2aFirst.x['ens-e'] = int(X2.ensE, { span: ['mid-w', 'ens-s'], ...NEW });
s2aFirst.y['ens-s'] = int(Y2.ensS, { span: ['w-main', 'ens-e'], ...NEW });

const ensuiteWithin = {
  ...copy(groundOpen),
  id: 'ensuite-within',
  name: 'S2a - En-suite to bedroom 1, from bedroom 4',
  sequence: 30,
  derivedFrom: 'ground-floor-open',
  summary: 'S1, plus an en-suite to bedroom 1 taken from the west end of bedroom 4 and entered through a new door in bedroom 1\'s south wall. Bedroom 4 stays, smaller, as a study or nursery. Inside the existing footprint: building control only.',
  assumptions: [
    ...groundOpen.assumptions,
    { id: 's2a-size', severity: 'medium', note: 'The en-suite is about 2.0 x 1.2m clear: shower, WC and basin, no bath. Bedroom 4 is left at about 6.1 m2 - below the 6.5 m2 asked for and below the national space standard\'s 7.5 m2 single bedroom, so it is a study or nursery, not a bedroom, in this stage. Reported, not enlarged.' },
    { id: 's2a-drain', severity: 'high', note: 'The en-suite sits on the west gable, away from the bathroom; its waste is assumed to drop down the gable to the kitchen\'s drain. If the soil stack is at the bathroom (east of bedroom 4), a macerator or a longer run is needed. The soil-stack position is a viewing question.' },
    { id: 's2a-why-west', severity: 'low', note: 'Taking the en-suite from bedroom 4\'s EAST end (next to the bathroom) would cut bedroom 4 off from the landing: its only door is in that end. The west end keeps bedroom 4\'s door and still touches bedroom 1.' },
  ],
  changes: [
    'Build two new stud walls in the west end of bedroom 4, making an en-suite of about 2.0 x 1.2m against bedroom 1\'s south wall.',
    'Cut a new door through bedroom 1\'s south wall (mid-w) into the en-suite.',
    'Add a small obscured window in the west gable for the en-suite.',
    'Bedroom 4 keeps its landing door and becomes a study or nursery of about 6.1 m2.',
  ],
  grid: { ground: asBuilt(s1Ground), first: s2aFirst },
  rooms: [
    ...without(groundOpen.rooms, ['bed4']),
    { id: 'ensuite', level: 'first', name: 'En-suite', roomType: 'bathroom', bounds: { w: 'w-main', e: 'ens-e', n: 'mid-w', s: 'ens-s' } },
    { id: 'bed4', level: 'first', name: 'Study (bedroom 4)', roomKey: 'bedroom', roomType: 'office', rects: [
      { w: 'ens-e', e: 'land-w', n: 'mid-w', s: 'bath-n' },
      { w: 'w-main', e: 'bath-w', n: 'ens-s', s: 'rear' },
    ] },
  ],
  openings: [
    ...groundOpen.openings,
    { id: 'f-door-ensuite', level: 'first', axis: 'y', line: 'mid-w', x: 1.55, width: 0.76, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'north' }, note: 'New, opening into bedroom 1 so the swing clears the en-suite\'s fittings.' },
    { id: 'f-win-ensuite-w', level: 'first', axis: 'x', line: 'w-main', y: 4.66, width: 0.60, type: 'window', sill: 1.40, note: 'New, obscured.' },
  ],
};

// S2b - A TWO-STOREY ADDITION OVER THE STORE. The S1 ground floor, with a
// first-floor en-suite to bedroom 3 built over the WC and utility.
const s2bFirst = copy(asBought.grid.first);
s2bFirst.x['r-mid'] = ext(X.rMid, { t: T_LIGHT, span: ['rear', 'r-s'], ...NEW });
s2bFirst.x['r-e'] = ext(X.eMain, { span: ['rear', 'r-s'], ...NEW });
s2bFirst.y['r-s'] = ext(Y.rS, { t: T_LIGHT, span: ['r-mid', 'r-e'], ...NEW });

const rearTwoStorey = {
  ...copy(groundOpen),
  id: 'rear-two-storey',
  name: 'S2b - Two-storey addition with an en-suite to bedroom 3',
  sequence: 31,
  derivedFrom: 'ground-floor-open',
  summary: 'S1, plus a first floor built over the old store (about 2.7 x 2.4m outside) holding an en-suite to bedroom 3, under its own gabled slate roof tied into the main roof. Needs planning permission and counts towards the National Park\'s 30% limit.',
  assumptions: [
    ...groundOpen.assumptions,
    { id: 's2b-planning', severity: 'high', note: 'New floor area in the New Forest National Park: full planning permission, and it counts against policy DP36\'s 30% cap over the 1982 floorspace (about 40 m2 of headroom if the house is unextended since 1982 - unconfirmed).' },
    { id: 's2b-structure', severity: 'high', note: 'The store\'s light walls cannot carry a storey: the ground walls under the addition are assumed rebuilt in brick on new foundations. The upper walls are modelled at the existing 0.15m so the room keeps the store\'s footprint; a real build-up takes from it.' },
    { id: 's2b-bed3-window', severity: 'medium', note: 'Bedroom 3\'s rear window becomes the en-suite door, so bedroom 3 gets a new window in the east wall.' },
  ],
  changes: [
    'Build a first floor over the WC and utility: new west, south and east walls on the rear range\'s lines.',
    'Fit an en-suite to bedroom 3 in it, entered where bedroom 3\'s rear window was.',
    'Give bedroom 3 a new window in the east wall.',
    'Roof the addition with a gabled slate roof tied into the main roof; the boot room keeps the rebuilt mono-pitch roof.',
  ],
  grid: { ground: asBuilt(s1Ground), first: s2bFirst },
  rooms: [
    ...groundOpen.rooms,
    { id: 'ensuite3', level: 'first', name: 'En-suite (bedroom 3)', roomType: 'bathroom', bounds: { w: 'r-mid', e: 'r-e', n: 'rear', s: 'r-s' } },
  ],
  openings: [
    ...without(groundOpen.openings, ['f-win-bed3-s']),
    { id: 'f-door-ensuite3', level: 'first', axis: 'y', line: 'rear', x: 7.80, width: 0.76, type: 'door', leaf: 'single', swing: { hinge: 'a', toward: 'south' }, note: 'New, where bedroom 3\'s rear window was.' },
    { id: 'f-win-bed3-e', level: 'first', axis: 'x', line: 'e-main', y: 5.40, width: 1.00, type: 'window', note: 'New.' },
    { id: 'f-win-ensuite3-s', level: 'first', axis: 'y', line: 'r-s', x: 8.40, width: 0.60, type: 'window', sill: 1.40, note: 'New, obscured.' },
  ],
  roofs: [
    asBought.roofs[0],
    { id: 'roof-rear-new', kind: 'mono', over: [4.51, D_ENV, X.rMid, 9.45], ridgeAxis: 'x', pitchDeg: 15, eavesHeight: 2.65, overhang: 0.15, covering: 'slate', coversLevel: 'ground', provenance: 'existing', note: 'The boot room\'s slope, as rebuilt in S1, now stopping at the addition.' },
    { id: 'roof-addition', kind: 'gabled', over: [X.rMid, D_ENV - 0.3, W_ENV, 9.45], ridgeAxis: 'y', pitchDeg: 40, eavesHeight: EAVES, overhang: 0.15, covering: 'slate', provenance: 'new', note: 'Gabled to the garden, ridge running back from the main roof\'s rear slope. Tie-in assumed, not designed.' },
  ],
};

export const stages = [asBought, groundOpen, ensuiteWithin, rearTwoStorey];

const F = (id, level, room, kind, name, rect, extra = {}) => ({
  id, level, room, kind, name, rect, confidence: 'drafted', ...extra,
});

const empty = (stage, name) => ({
  id: `${stage}--empty`, stage, name: 'Empty shell',
  summary: `${name}, with nothing in it.`, furniture: [],
});

// Lived-in furniture for the rooms each design stage creates. Sizes are
// ordinary catalogue sizes; positions keep doors, swings and windows
// clear. The clearance check REPORTS anything tight - it never moves
// a piece, and nothing here is nudged to make a check pass.
const S1_FURNITURE = [
  F('s1-k-run-w', 'ground', 'kitchen-diner', 'worktop', 'Worktop', [0.30, 6.20, 2.31, 6.80], { height: 0.92, fixed: true, facing: 'n' }),
  F('s1-k-sink', 'ground', 'kitchen-diner', 'sink', 'Sink', [2.31, 6.20, 3.41, 6.80], { height: 0.92, fixed: true, facing: 'n' }),
  F('s1-k-run-e', 'ground', 'kitchen-diner', 'worktop', 'Worktop', [3.41, 6.20, 4.40, 6.80], { height: 0.92, fixed: true, facing: 'n' }),
  F('s1-k-range', 'ground', 'kitchen-diner', 'oven', 'Range cooker', [0.30, 4.06, 1.30, 4.66], { height: 0.92, fixed: true, facing: 's', note: 'Placed on the kitchen end until the dining fireplace is found at the viewing (assumption s1-range).' }),
  F('s1-k-fridge', 'ground', 'kitchen-diner', 'fridge', 'Fridge', [1.40, 4.06, 2.00, 4.66], { height: 1.85, fixed: true, facing: 's' }),
  F('s1-k-table', 'ground', 'kitchen-diner', 'table', 'Dining table', [6.20, 4.90, 8.00, 5.80], { height: 0.75 }),
  F('s1-b-bench', 'ground', 'boot', 'bench', 'Boot bench', [5.60, 8.90, 7.01, 9.30], { height: 0.45 }),
  F('s1-b-coats', 'ground', 'boot', 'shelf', 'Coat and boot store', [4.66, 8.90, 5.50, 9.30], { height: 2.00, fixed: true, facing: 'n' }),
  F('s1-w-wc', 'ground', 'wc', 'wc', 'WC', [7.40, 8.65, 7.85, 9.30], { height: 0.78, fixed: true, facing: 'n' }),
  F('s1-w-basin', 'ground', 'wc', 'basin', 'Basin', [7.76, 8.20, 8.16, 8.60], { height: 0.85, fixed: true, facing: 'w' }),
  F('s1-u-washer', 'ground', 'utility', 'washer', 'Washing machine', [8.26, 8.70, 8.86, 9.30], { height: 0.85, fixed: true, facing: 'n' }),
  F('s1-u-sink', 'ground', 'utility', 'sink', 'Utility sink', [8.86, 8.70, 9.61, 9.30], { height: 0.92, fixed: true, facing: 'n' }),
];

const lived = (stage, name, summary, changes, furniture) => ({
  id: `${stage}--lived-in`, stage, name: 'Lived in', derivedFrom: `${stage}--empty`,
  summary, changes, furniture,
});

export const variants = [
  empty('ground-floor-open', 'S1'),
  lived('ground-floor-open', 'S1',
    'S1 furnished: a kitchen run under the rear window, a range on the kitchen end, a table at the dining end, a bench by the back door, and the WC and utility fitted.',
    ['Kitchen run, sink and range at the west end; table at the east end. No island: the room is 2.74m deep.',
      'Boot bench and coat store by the back door.', 'WC pan and basin; washer and sink in the utility.'],
    S1_FURNITURE),
  lived('ensuite-within', 'S2a',
    'S2a furnished: S1, plus the en-suite fitted and bedroom 4 as a study.',
    ['As S1 downstairs.', 'En-suite: shower, WC and basin.', 'Study: a desk under the rear window.'],
    [...S1_FURNITURE,
      F('s2a-e-shower', 'first', 'ensuite', 'shower', 'Shower', [0.30, 4.06, 1.10, 5.26], { height: 2.00, fixed: true, facing: 'e' }),
      F('s2a-e-wc', 'first', 'ensuite', 'wc', 'WC', [1.25, 4.58, 1.62, 5.26], { height: 0.78, fixed: true, facing: 'n' }),
      F('s2a-e-basin', 'first', 'ensuite', 'basin', 'Basin', [1.82, 4.81, 2.32, 5.26], { height: 0.85, fixed: true, facing: 'n' }),
      F('s2a-s-desk', 'first', 'bed4', 'desk', 'Desk', [1.10, 6.20, 2.50, 6.80], { height: 0.75, facing: 'n' })]),
  lived('rear-two-storey', 'S2b',
    'S2b furnished: S1, plus the en-suite over the store fitted.',
    ['As S1 downstairs.', 'En-suite to bedroom 3: WC, basin and shower.'],
    [...S1_FURNITURE,
      F('s2b-e-wc', 'first', 'ensuite3', 'wc', 'WC', [7.20, 8.65, 7.65, 9.30], { height: 0.78, fixed: true, facing: 'n' }),
      F('s2b-e-basin', 'first', 'ensuite3', 'basin', 'Basin', [7.80, 8.85, 8.30, 9.30], { height: 0.85, fixed: true, facing: 'n' }),
      F('s2b-e-shower', 'first', 'ensuite3', 'shower', 'Shower', [8.71, 8.40, 9.61, 9.30], { height: 2.00, fixed: true, facing: 'w' })]),
  empty('ensuite-within', 'S2a'),
  empty('rear-two-storey', 'S2b'),
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
