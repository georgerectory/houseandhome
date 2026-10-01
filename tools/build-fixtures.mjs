// build-fixtures.mjs - generate the demo dataset the front end renders
// before a real database exists.
//
// The content is Sean's own seed list from the planning brief, turned
// into rows. EVERY row is marked 'drafted' - none of it is confirmed,
// none of it has been costed properly, and the interface is required to
// show it as provisional. That is the point: the launch condition is
// that the system works, and is honest, with nothing yet verified.
import { writeFileSync, mkdirSync } from 'node:fs';
import { rank } from '../assets/js/engine/priority.js';
import { shoppingList, shoppingTotals } from '../assets/js/engine/demand.js';
import { readinessReport } from '../assets/js/engine/readiness.js';

const ROOMS = [
  ['hallway','Hallway','hallway',4], ['lounge','Lounge','living',4],
  ['kitchen','Kitchen','kitchen',5], ['dining','Dining room','dining',3],
  ['office','Office','office',3], ['bedroom','Main bedroom','bedroom',4],
  ['bathroom','Bathroom','bathroom',5], ['pantry','Pantry','pantry',2],
  ['boot-room','Boot room','boot_room',3], ['gym','Gym','gym',2],
  ['garage','Garage','garage',2], ['loft','Loft','loft',1],
  ['garden','Garden','garden',3], ['shed','Shed','shed',2],
  ['greenhouse','Greenhouse','greenhouse',1], ['log-store','Log store','outbuilding',1],
];

const THEME_W = { make_safe:5, make_dry:5, make_secure:4, make_warm:4, make_working:4,
  make_clean:3, systems_tech:3, storage:3, cosmetic:2, outdoor:2, comfort:2 };
const BENEFIT_W = { safety:5, habitability:5, preservation:4, running_cost:4,
  defect_cost:3, property_value:3, time_saved:3, comfort:2, enjoyment:1 };

// [title, room, kind, trade, theme, benefit, costBest, costWorst, minMinutes, maxMinutes, matcher]
const WORK = [
  ['Test every socket and switch','hallway','repair','electrical','make_safe','safety',0,0,30,60,{tools:['multimeter'],demand:'light',setting:'indoor'}],
  ['Fit smoke and CO alarms','hallway','improvement','electrical','make_safe','safety',40,90,45,90,{tools:['drill'],demand:'light',posture:['overhead']}],
  ['Clear and check the gutters','garden','maintenance','roofing','make_dry','preservation',0,120,60,180,{tools:['ladder'],setting:'outdoor',weather:['dry'],demand:'heavy'}],
  ['Change all exterior locks','hallway','improvement','security','make_secure','safety',80,180,45,90,{tools:['drill','chisel'],demand:'light'}],
  ['Draught-proof windows and doors','lounge','improvement','glazing','make_warm','running_cost',30,90,60,180,{tools:[],demand:'light',posture:['kneeling']}],
  ['Top up loft insulation','loft','improvement','heating','make_warm','running_cost',150,400,120,300,{tools:[],demand:'heavy',posture:['kneeling','bending'],mess:'dusty'}],
  ['Bleed and balance radiators','lounge','maintenance','heating','make_warm','running_cost',0,25,30,90,{tools:['radiator key'],demand:'light',posture:['kneeling']}],
  ['Deep clean the kitchen','kitchen','cleaning','cleaning','make_clean','habitability',20,40,120,240,{tools:[],demand:'moderate',mess:'wet'}],
  ['Replace bathroom light switch','bathroom','repair','electrical','make_safe','safety',10,20,20,40,{tools:['screwdriver'],demand:'light'}],
  ['Re-grout and seal the bath','bathroom','repair','plumbing','make_dry','preservation',15,40,90,180,{tools:['grout float'],demand:'moderate',posture:['kneeling'],mess:'wet',drying:24}],
  ['Fill, sand and paint the hallway','hallway','decoration','decorating','cosmetic','property_value',60,140,240,480,{tools:['brush','roller'],demand:'moderate',mess:'dusty',drying:6}],
  ['Paint the main bedroom','bedroom','decoration','decorating','cosmetic','comfort',50,120,240,480,{tools:['brush','roller'],demand:'moderate',drying:6}],
  ['Lay carpet in the main bedroom','bedroom','renovation','flooring','cosmetic','comfort',300,700,180,360,{tools:['knee kicker'],demand:'heavy',posture:['kneeling']}],
  ['Run ethernet to the office','office','improvement','networking','systems_tech','time_saved',60,160,120,300,{tools:['drill','fish tape'],demand:'moderate',mess:'dusty'}],
  ['Mount shelving in the pantry','pantry','improvement','carpentry','storage','time_saved',40,90,60,150,{tools:['drill','level'],demand:'light'}],
  ['Build a storage rack in the garage','garage','improvement','carpentry','storage','time_saved',80,200,180,420,{tools:['drill','saw'],demand:'heavy',mess:'dusty'}],
  ['Set up the gym floor matting','gym','improvement','organisation','comfort','enjoyment',60,150,45,120,{tools:[],demand:'moderate'}],
  ['Clear and level the log store base','log-store','renovation','groundwork','outdoor','preservation',30,90,120,300,{tools:['spade','rake'],setting:'outdoor',weather:['dry'],demand:'heavy'}],
  ['Plant the bush perimeter','garden','improvement','planting','outdoor','enjoyment',120,350,180,420,{tools:['spade'],setting:'outdoor',weather:['dry','frost-free'],demand:'heavy',season:['autumn','winter']}],
  ['Install external security lighting','garden','improvement','security','make_secure','safety',70,180,90,180,{tools:['drill'],setting:'outdoor',weather:['dry'],demand:'moderate',daylight:true}],
  ['Set up the compost area','garden','improvement','planting','outdoor','enjoyment',30,80,60,150,{tools:['spade'],setting:'outdoor',demand:'moderate'}],
  ['Hang the bonsai bench','garden','improvement','carpentry','outdoor','enjoyment',60,150,90,180,{tools:['drill','saw'],setting:'outdoor',weather:['dry'],demand:'moderate'}],
];

// [title, category, costBest, costWorst, theme, benefit, room]
const BUY = [
  ['Cordless drill','tool',60,140,'systems_tech','time_saved','garage'],
  ['Ladder','tool',60,150,'make_safe','safety','garage'],
  ['Hand tool set','tool',40,120,'systems_tech','time_saved','garage'],
  ['Sledgehammer and pick axe','tool',35,80,'outdoor','time_saved','shed'],
  ['Lawn mower','tool',120,400,'outdoor','time_saved','shed'],
  ['Strimmer','tool',50,150,'outdoor','time_saved','shed'],
  ['Hose, watering cans and buckets','tool',40,90,'outdoor','time_saved','shed'],
  ['Shovels and rakes','tool',35,80,'outdoor','time_saved','shed'],
  ['Paint brushes, rollers and mixers','material',30,70,'cosmetic','property_value','garage'],
  ['Storage boxes and box racks','material',80,220,'storage','time_saved','garage'],
  ['Hoover','each',80,250,'make_clean','habitability','hallway'],
  ['Brooms, dustpans and brushes','each',20,45,'make_clean','habitability','boot-room'],
  ['Spice rack and spices','each',30,70,'comfort','enjoyment','kitchen'],
  ['Towels and linen','textile',60,150,'comfort','comfort','bathroom'],
  ['Welcome mats','textile',20,50,'make_clean','comfort','hallway'],
  ['Rugs and throws','textile',120,350,'cosmetic','comfort','lounge'],
  ['Dining room set','furniture',250,900,'comfort','enjoyment','dining'],
  ['Computer desk','furniture',100,300,'comfort','time_saved','office'],
  ['Sofa bed','furniture',200,700,'comfort','comfort','lounge'],
  ['Two smart televisions','each',300,900,'systems_tech','enjoyment','lounge'],
  ['WiFi router and extenders','each',80,220,'systems_tech','time_saved','office'],
  ['Ethernet cables','material',25,60,'systems_tech','time_saved','office'],
  ['Cameras and doorbell','each',120,350,'make_secure','safety','hallway'],
  ['Motion sensors and automated lights','each',90,260,'systems_tech','comfort','hallway'],
  ['Air purifiers','each',100,300,'comfort','comfort','lounge'],
  ['Outside chairs','furniture',80,250,'outdoor','enjoyment','garden'],
  ['Terracotta pots and hanging flowers','each',60,160,'outdoor','enjoyment','garden'],
  ['Staddle stones','each',80,300,'outdoor','enjoyment','garden'],
  ['Fire pit, pokers and grills','each',90,280,'outdoor','enjoyment','garden'],
  ['Outdoor heater','each',80,250,'outdoor','comfort','garden'],
  ['Outside electric lanterns','each',50,140,'outdoor','enjoyment','garden'],
  ['Pull-up and dip bars','each',70,200,'comfort','enjoyment','gym'],
  ['Weights set','each',150,500,'comfort','enjoyment','gym'],
  ['Rowing machine','each',200,700,'comfort','enjoyment','gym'],
  ['Running machine','each',250,900,'comfort','enjoyment','gym'],
  ['Rope pulls','each',30,80,'comfort','enjoyment','gym'],
  ['Second freezer','each',180,450,'storage','time_saved','pantry'],
  ['Printer and scanner','each',80,220,'systems_tech','time_saved','office'],
  ['Clocks and alarm clocks','each',40,110,'comfort','comfort','hallway'],
  ['Candles and house lights','each',50,140,'cosmetic','comfort','lounge'],
  ['Christmas decorations and wreath','decoration',80,250,'comfort','enjoyment','loft'],
  ['Halloween decorations and wreath','decoration',40,120,'comfort','enjoyment','loft'],
  ['Flag pole and British flag','each',70,200,'outdoor','enjoyment','garden'],
  ['Padlocks and key holders','each',25,60,'make_secure','safety','boot-room'],
  ['Umbrella and outdoor wear','each',60,180,'comfort','comfort','boot-room'],
  ['Trailer','each',400,1200,'outdoor','time_saved','garage'],
];

const uid = (p, i) => `${p}-${String(i).padStart(4, '0')}`;
const mid = (a, b) => Math.round(((a + b) / 2) * 100) / 100;

const rooms = ROOMS.map(([key, name, room_type, room_weight], i) => ({
  id: uid('room', i), key, name, room_type, room_weight, condition: 'unknown', confidence: 'drafted',
}));
const roomBy = Object.fromEntries(rooms.map((r) => [r.key, r]));

let items = [];
WORK.forEach(([title, roomKey, kind, trade, theme, benefit, cb, cw, dmin, dmax, m], i) => {
  items.push({
    id: uid('work', i), title, kind, trade, theme, benefit_type: benefit,
    room_id: roomBy[roomKey]?.id ?? null, room_key: roomKey, room_name: roomBy[roomKey]?.name ?? null,
    cost_best: cb, cost_worst: cw, cost_expected: mid(cb, cw), cost_confidence: 'drafted',
    duration_min_minutes: dmin, duration_max_minutes: dmax,
    min_session_minutes: Math.min(dmin, 15),
    tools_required: m.tools ?? [], setting: m.setting ?? 'indoor',
    physical_demand: m.demand ?? 'moderate', posture: m.posture ?? [],
    mess_level: m.mess ?? 'clean', weather_needs: m.weather ?? [],
    needs_daylight: !!m.daylight, drying_or_curing_hours: m.drying ?? null,
    season_window: m.season ?? [], materials_ready: false,
    status: 'planned', horizon: 'someday', allocated_balance: 0,
    house_benefit: null, benefit_status: null, confidence: 'drafted',
    roomWeight: roomBy[roomKey]?.room_weight ?? 3,
    themeWeight: THEME_W[theme] ?? 3, benefitWeight: BENEFIT_W[benefit] ?? 3,
  });
});
BUY.forEach(([title, category, cb, cw, theme, benefit, roomKey], i) => {
  items.push({
    id: uid('buy', i), title, kind: 'purchase', trade: null, theme, benefit_type: benefit,
    room_id: roomBy[roomKey]?.id ?? null, room_key: roomKey, room_name: roomBy[roomKey]?.name ?? null,
    category, cost_best: cb, cost_worst: cw, cost_expected: mid(cb, cw), cost_confidence: 'drafted',
    duration_min_minutes: null, duration_max_minutes: null, min_session_minutes: null,
    tools_required: [], setting: 'indoor', physical_demand: 'light', posture: [],
    mess_level: 'clean', weather_needs: [], needs_daylight: false,
    drying_or_curing_hours: null, season_window: [], materials_ready: true,
    status: 'planned', horizon: 'someday', allocated_balance: 0,
    house_benefit: null, benefit_status: null, confidence: 'drafted',
    roomWeight: roomBy[roomKey]?.room_weight ?? 3,
    themeWeight: THEME_W[theme] ?? 3, benefitWeight: BENEFIT_W[benefit] ?? 3,
  });
});

// CHECKLIST SECTIONS. Work items that carry their content in `details`
// as `- [ ]` lines, read by the Plan page through engine/checklist.js.
//
// They are here because the front-end gate forces demo mode: without a
// fixture the Plan page renders nothing, and the gate's "a page that
// renders nothing fails" assertion would catch it as an empty page
// rather than as a missing fixture. Two sections is enough to exercise
// the parser's three block kinds and the tier chip.
const CHECKS = [
  ['Before you view', 10, 'tier:offer',
   'What to have in hand before the day itself.',
   `PAPERWORK
- [ ] Title register and title plan
- [ ] EPC records
- [ ] Planning history
Ask the agent for anything already in existence rather than commissioning it twice.
- [ ] Proof of deposit ready`],
  ['On the day', 20, 'tier:financing',
   'The go/no-go checks, before anything else.',
   `SERVICES - these decide whether it can be mortgaged at all
- [ ] A WC that flushes
- [ ] Running water at a tap
- [ ] A fixed heat source that fires
FABRIC
- [ ] Damp course visible, and ground below it
- [ ] No daylight in the loft`],
];
CHECKS.forEach(([title, sort_order, tier, summary, details], i) => {
  items.push({
    id: uid('check', i), title, summary, details, sort_order,
    tags: ['viewing', tier], kind: 'research', trade: 'admin',
    theme: 'make_safe', benefit_type: 'safety',
    room_id: null, room_key: null, room_name: null,
    cost_best: 0, cost_worst: 0, cost_expected: 0, cost_confidence: 'drafted',
    duration_min_minutes: 20, duration_max_minutes: 60, min_session_minutes: 20,
    tools_required: [], setting: 'either', physical_demand: 'light', posture: [],
    mess_level: 'clean', weather_needs: [], needs_daylight: false,
    drying_or_curing_hours: null, season_window: [], materials_ready: true,
    status: 'ready', horizon: 'now', allocated_balance: 0,
    house_benefit: null, benefit_status: null, confidence: 'drafted',
    roomWeight: 3, themeWeight: THEME_W.make_safe ?? 5,
    benefitWeight: BENEFIT_W.safety ?? 5,
  });
});

// Rank exactly as the database would, then band the top of the list.
// rank() returns the ENGINE's vocabulary - score and explain. The
// database stores those as priority_score and priority_explain, and the
// front end reads the database's names. Translating here, once, is what
// stops a page rendering correctly against the fixture and blankly
// against the real thing.
items = rank(items).map(({ score, explain, roomWeight, themeWeight, benefitWeight, ...i }) => ({
  ...i,
  priority_score: score,
  priority_explain: explain,
  // Until a property is bound every renovation cost is a forecast
  // against a generic house, never an observation of a real one.
  cost_basis: 'predicted',
}));
const HORIZON = (p) => (p <= 6 ? 'now' : p <= 16 ? 'next' : p <= 34 ? 'later' : 'someday');
items = items.map((i) => ({ ...i, horizon: HORIZON(i.priority) }));

// THE DERIVED VIEWS, mirrored for demo mode.
//
// The front-end gate forces demo mode, so a page reading shopping_list
// would render blank against the fixture and the gate would report it
// as an empty page rather than as a missing fixture. These are built by
// the same pure rule the database uses; `npm run test:parity` runs both
// against the same rows and fails on any disagreement.
//
// TWO LINKS are authored deliberately. Without them every purchase is
// `standalone` and the dormant path - the whole reason the view exists
// - would never render in any test.
const digJob = items.find((i) => i.kind !== 'purchase');
const dormantBuys = items.filter((i) => i.kind === 'purchase').slice(0, 2);
const knowledge_links = dormantBuys.map((buy, i) => ({
  id: uid('link', i),
  from_type: 'work_item', from_id: digJob?.id ?? null,
  to_type: 'work_item', to_id: buy.id,
  kind: 'requires_material', confidence: 'derived', valid_to: null,
}));
// The job they hang off is parked, so both read dormant.
if (digJob) { digJob.status = 'idea'; digJob.horizon = 'someday'; }

// A date this many days from the build, as YYYY-MM-DD.
const dayOffset = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const shopping_list = shoppingList(items, knowledge_links);
const work_item_readiness = readinessReport(items, knowledge_links);
const shopping_totals = shoppingTotals(shopping_list);

const bills = [
  ['Council tax', 'council_tax', 'monthly'], ['Energy', 'energy', 'monthly'],
  ['Water', 'water', 'monthly'], ['Broadband', 'broadband', 'monthly'],
  ['Buildings and contents insurance', 'insurance', 'annual'],
  ['Mobile', 'mobile', 'monthly'], ['TV licence', 'tv_licence', 'annual'],
].map(([name, category, cadence], i) => ({
  id: uid('bill', i), name, category, cadence,
  amount: null, confidence: 'drafted', is_active: true, cost_class: 'running',
  // A bill for a house nobody owns is a forecast. Only the mobile is a
  // bill anyone is actually paying today.
  basis: category === 'mobile' ? 'current' : 'predicted',
}));

// The fixed equipment register. Coordinates are metres in the plan's own
// space (data/buildings/48-ameysford-road/, the AS-BOUGHT stage), so each
// of these resolves to a grid reference on the floor plan and to a marker
// at the same spot in the 3D model. A null pair means "in that room,
// position not recorded" - shown at the room's centre and labelled
// approximate, never as a measured position.
//
// Every one of these is DRAFTED, including the coordinates: they are
// plausible positions in a house nobody has bought, not a survey.
//
// A room the as-bought house does not have (an office, a garage) keeps
// its room and gets NO coordinates, so it appears under "not on the
// plan" rather than being quietly dropped or invented a position.
//
// [name, category, roomKey, planX, planY]
const assets = [
  ['Boiler', 'heating', 'kitchen', 5.20, 0.60],
  ['Consumer unit', 'electrical', 'hallway', 4.10, 7.20],
  ['Water stopcock', 'plumbing', 'kitchen', 2.80, 3.10],
  ['Cooker', 'appliance', 'kitchen', 2.90, 1.30],
  ['Fridge freezer', 'appliance', 'kitchen', 2.90, 2.90],
  ['Second freezer', 'appliance', 'garage', null, null],
  ['Washing machine', 'appliance', 'kitchen', 5.20, 1.20],
  ['WiFi router', 'network', 'office', null, null],
  ['Network switch', 'network', 'office', null, null],
  ['WiFi extender', 'network', 'hallway', 4.05, 4.20],
  ['Air conditioner (lounge)', 'climate', 'lounge', 7.70, 4.00],
  ['Air conditioner (main bedroom)', 'climate', 'bedroom', 0.60, 4.20],
  ['Air purifier', 'climate', 'lounge', 5.00, 7.20],
  ['Smart television', 'av', 'lounge', 7.70, 6.60],
  ['Lawn mower', 'garden_machine', 'shed', null, null],
].map(([name, category, roomKey, planX, planY], i) => ({
  id: uid('asset', i), name, category, room_key: roomKey,
  room_name: roomBy[roomKey]?.name ?? null,
  plan_x_m: planX, plan_y_m: planY,
  make: null, model: null, status: 'wanted', warranty_expires_on: null, confidence: 'drafted',
}));

const data = {
  meta: {
    generated: new Date().toISOString().slice(0, 10),
    note: 'Demo dataset. Every row is drafted and unconfirmed: no figure here has been checked, and the interface must present all of it as provisional.',
  },
  household: { id: 'demo', name: 'House & Home' },
  // The one active property. Demo mode names the same house the geometry
  // under data/buildings/ draws, so the header reads the same either way.
  property: { ref: 'P-001', name: '48 Ameysford Road', status: 'active', offer_status: 'none' },
  pot: { name: 'House pot', monthly_contribution: 400, contribution_confidence: 'drafted', unallocated_balance: 0 },
  allocation_settings: { decay: 0.85, floor_share: 0.10 },
  rooms, items, bills, assets,
  shopping_list, shopping_totals, knowledge_links, work_item_readiness,
  stock_plan: [], review_queue: [],
  // The diary, dated FROM THE BUILD so the demo never shows a countdown
  // that has already run out. Live mode reads whats_next, which counts
  // the days in Postgres; this only has to be the same shape.
  whats_next: [
    {
      source: 'event', id: uid('ev', 0), key: null,
      title: 'Open house at 48 Ameysford Road',
      description: 'Take the viewing checklist, a torch, a tape and a practical friend.',
      on_date: dayOffset(3), starts_at: null,
      location: '48 Ameysford Road, Ferndown, Dorset BH22 9QA',
      status: 'planned', days_until: 3, open_items: 0,
    },
    {
      source: 'milestone', id: uid('ms', 0), key: 'open-house',
      title: 'Open house', description: 'Guide price plus an open house signals a best-and-final round.',
      on_date: dayOffset(3), starts_at: null, location: null,
      status: 'planned', days_until: 3, open_items: 2,
    },
    {
      source: 'milestone', id: uid('ms', 1), key: 'gate',
      title: 'The decision gate',
      description: 'Consent, three fixed quotes, value evidence, finance agreed. All pass: build. Any fail: sell with consent.',
      on_date: dayOffset(475), starts_at: null, location: null,
      status: 'planned', days_until: 475, open_items: 0,
    },
  ],
  // The specification. Two rows so the demo page shows a row that leads
  // with what to reject and a row carrying the two lighting numbers.
  theme_book: [
    {
      id: uid('theme', 0), category: 'paint', surface: 'wall',
      name: 'Wall paint on lime plaster',
      spec: 'Limewash, clay paint or mineral silicate. Vapour-open, matt.',
      reject_if: 'Any vinyl or acrylic emulsion. Anything sold as wipeable.',
      rationale: 'A solid wall dries inwards, and a paint film that does not breathe undoes the replastering.',
      status: 'idea', confidence: 'drafted', sort_order: 10,
      is_shoppable: true, is_trusted: false, hex: null, kelvin: null, cri: null,
    },
    {
      id: uid('theme', 1), category: 'lighting', surface: 'lighting',
      name: 'Living and bedroom lamps',
      spec: '2700K, CRI 90 or above, dimmable, trailing-edge compatible.',
      reject_if: 'Anything at or above 3000K in a living room. CRI below 90.',
      rationale: 'At CRI 80 the red in the brick goes grey.',
      status: 'idea', confidence: 'drafted', sort_order: 90,
      is_shoppable: true, is_trusted: false, hex: null, kelvin: 2700, cri: 90,
    },
  ],
  // Two sections, because the front-end gate forces demo mode: without
  // them plan.html renders its document half empty and the gate passes
  // a page nobody could read.
  document_sections: [
    {
      id: uid('doc', 0), part: 'PART A · 1', title: 'The whole plan in 30 seconds',
      lede: 'Buy well, fix it, win consent, then decide whether to build.',
      body: 'STEP\nWHEN\nWHAT HAPPENS\nWin the house\nSep - Dec 2026\nViewing, offer, survey, solicitor\nBuy and move in\nJan 2027\nDeposit and mortgage',
      page_from: 3, page_to: 3, sort_order: 30, confidence: 'researched',
    },
    {
      id: uid('doc', 1), part: 'PART B · 9 COSTS', title: 'Detailed cost plan',
      lede: 'Who does the work matters more than the design.',
      body: 'Item\nOptimistic\nBase\nAdverse\nPurchase price\n255k\n265k\n280k\nContingency on works\n7%\n10%\n15%',
      page_from: 41, page_to: 41, sort_order: 410, confidence: 'researched',
    },
  ],
  storage: [
    { id: uid('store', 0), name: 'Loft boxes', kind: 'box', room_key: 'loft', label_code: 'L-01' },
    { id: uid('store', 1), name: 'Garage rack', kind: 'rack', room_key: 'garage', label_code: 'G-01' },
    { id: uid('store', 2), name: 'Boot room shelf', kind: 'shelf', room_key: 'boot-room', label_code: 'B-01' },
  ],
  // Illustrative accounts, so the demo exercises the netting and the
  // liability rendering. SYNTHETIC, and deliberately including one
  // unconfirmed row so the "counts toward nothing" path is covered.
  accounts: [
    { id: 'acct-0', name: 'Sample savings', provider: 'Sample', kind: 'savings',
      is_liability: false, balance: 0, facility_limit: null, earmark_pct: 100,
      earmarked_for: 'house deposit', as_of: null, confidence: 'drafted', is_active: true },
    { id: 'acct-1', name: 'Sample current account', provider: 'Sample', kind: 'current_account',
      is_liability: true, balance: 0, facility_limit: 1000, earmark_pct: 0,
      earmarked_for: null, as_of: null, confidence: 'drafted', is_active: true },
  ],
  // Illustrative carried-over lines, so the demo exercises the archive's
  // rendering. SYNTHETIC, like everything else in this file, and marked
  // unreviewed so it is excluded from every total exactly as real
  // carried data would be.
  carried_finance: [
    { id: 'carried-0', source_system: 'rec', source_group: 'ongoing_bills',
      source_ref: 'sample-1', label: 'Sample carried bill', amount: 0,
      cadence: 'monthly', review_status: 'pending' },
    { id: 'carried-1', source_system: 'rec', source_group: 'shopping_list',
      source_ref: 'sample-2', label: 'Sample carried purchase', amount: 0,
      cadence: null, review_status: 'pending' },
  ],
  inventory: [
    { id: uid('inv', 0), name: 'Christmas decorations', category: 'seasonal', storage: 'Loft boxes', season_window: ['winter'], confidence: 'drafted' },
    { id: uid('inv', 1), name: 'Halloween decorations', category: 'seasonal', storage: 'Loft boxes', season_window: ['autumn'], confidence: 'drafted' },
  ],
};

mkdirSync('data/fixtures', { recursive: true });
writeFileSync('data/fixtures/demo.json', JSON.stringify(data, null, 2) + '\n');

const checks = items.filter((i) => (i.tags ?? []).includes('viewing')).length;
const jobs = items.filter((i) => i.kind !== 'purchase').length;
const buys = items.filter((i) => i.kind === 'purchase').length;
console.log(`fixtures: ${items.length} items (${jobs} jobs, ${buys} purchases, ${checks} checklist), ${rooms.length} rooms, ${bills.length} bills, ${assets.length} assets`);
console.log(`top of list: ${items.slice(0, 5).map((i) => `${i.priority}. ${i.title}`).join(' | ')}`);
