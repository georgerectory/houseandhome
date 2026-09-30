// road-ahead-seed-rows.mjs - the kit extract as table rows.
//
// Pure: the private extract in, plain row objects out, one function per
// table. road-ahead-seed.mjs writes them as SQL. How each kit record
// lands is decided here once (the build plan's Appendix B), so a reload
// lands the same way. No figure is written in this file: every value
// comes from the extract at run time.

import { REGISTRY } from '../assets/js/engine/road-ahead/registry.js';

const MEANING = Object.fromEntries(REGISTRY.map((r) => [r.key, r.meaning]));
export const KIT = 'Rectory kit v5.0';
// The register (register_v5.py) and the owner's listing-queue words are
// dated 30 Sep 2026 by the kit's changelog; the auction calendar was
// last checked on 28 Sep 2026.
export const REGISTER_ON = '2026-09-30';
const CALENDAR_CHECKED = '2026-09-28';

// ---------------------------------------------------------------
// Matching one house described two ways ("15 Eastern Road, Havant PO9"
// and "Eastern Road, Havant"): two distinctive words in common.
// ---------------------------------------------------------------
const GENERIC = new Set(['road', 'lane', 'close', 'street', 'avenue', 'drive', 'way', 'gardens', 'cottage', 'cottages',
  'house', 'the', 'and', 'what', 'bought', 'with', 'extension', 'years', 'auction', 'lot', 'pearsons', 'online',
  'nr', 'near', 'hants', 'wilts', 'dorset', 'southampton', 'end-terrace', 'acre', 'private', 'sale']);
const words = (s) => String(s ?? '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[£\d][\d,.k]*/g, ' ')
  .split(/[^a-z-]+/).filter((w) => w.length > 2 && !GENERIC.has(w) && !/^[a-z]{1,2}\d/.test(w));
export function sameHouse(a, b, need = 2) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  const shared = [...B].filter((w) => A.has(w)).length;
  // "Upham Street, Upham" has one distinctive word; all of it must match.
  return shared > 0 && shared >= Math.min(need, A.size, B.size);
}

// The last postcode outside any brackets: "SO51 Hants (on the A27)" is SO51.
export const postcodeOf = (s) => {
  const all = [...String(s ?? '').replace(/\([^)]*\)/g, ' ').matchAll(/\b([A-Z]{1,2}\d[A-Z\d]?)(?:\s+\d[A-Z]{2})?\b/g)];
  return all.length ? all[all.length - 1][0] : null;
};
const lotOf = (s) => /\blot (\w+)/i.exec(String(s ?? ''))?.[1] ?? null;
const bedsOf = (s) => {
  const m = /^\s*(\d+)/.exec(String(s ?? '')) ?? /(\d+)-bed/i.exec(String(s ?? ''));
  return m ? Number(m[1]) : null;
};
export const detachedOf = (t) => {
  if (!t) return null;
  if (/semi|terrace|link-detached/i.test(t)) return false;
  return /detached/i.test(t) ? true : null;
};
const priceIn = (s, re) => {
  const m = re.exec(String(s ?? ''));
  return m ? Number(m[1].replace(/,/g, '')) : null;
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** "Feb 2019" as the first of its month; anything else, null. */
export function monthYear(s) {
  const m = /\b([A-Za-z]{3})[a-z]*\.?\s+(\d{4})\b/.exec(String(s ?? ''));
  const i = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  return i < 0 ? null : `${m[2]}-${pad(i + 1)}-01`;
}

/** A checkpoint's "when" as a date: the end of the period it names. */
export function dueOf(when) {
  const s = String(when ?? '');
  const y = /(\d{4})/.exec(s)?.[1];
  if (!y) return null;
  if (/^mid/i.test(s)) return `${y}-06-30`;
  if (/^early/i.test(s)) return `${y}-03-31`;
  if (/^late/i.test(s)) return `${y}-12-31`;
  const ms = [...s.matchAll(/\b([A-Za-z]{3})[a-z]*/g)].map((m) => MONTHS.indexOf(m[1].toLowerCase())).filter((i) => i >= 0);
  if (!ms.length) return null;
  const mo = ms[ms.length - 1] + 1;
  return `${y}-${pad(mo)}-${pad(lastDay(Number(y), mo))}`;
}

/** "Fri 23 Oct 2026" anywhere in a text, as a date. */
const dayIn = (s) => {
  const m = /\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})\b/.exec(String(s ?? ''));
  const i = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  return i < 0 ? null : `${m[3]}-${pad(i + 1)}-${pad(m[1])}`;
};

// ---------------------------------------------------------------
// Auction houses, and which house a piece of text names.
// ---------------------------------------------------------------
const shortName = (name) => name.split(' (')[0].replace(/ (Property )?Auctions$/, '');
export function houseIn(X, text) {
  if (!text) return null;
  for (const [code, a] of Object.entries(X.data.auctions.auctioneers)) if (text.includes(shortName(a.name))) return code;
  return null;
}
const auctionAt = (X, house, date) => {
  const e = X.data.auctions.events.find((x) => x.a === house && x.d === date && /^\d{1,2}:\d{2}$/.test(x.t));
  return e ? `${date} ${e.t}` : null;
};
const saleMethod = (house, text) => {
  if (house) return 'auction';
  if (/MMoA|iamsold|Pattinson|modern method/i.test(text ?? '')) return 'mmoa';
  if (/private|charters/i.test(text ?? '')) return 'private';
  return 'unknown';
};

export const auctionHouses = (X) => Object.entries(X.data.auctions.auctioneers).map(([code, a]) => ({
  code, name: a.name, format: a.format ?? null, covers: a.covers ?? null, cadence: a.cadence ?? null,
  link: a.link ?? null, why: a.why ?? null,
}));

// ---------------------------------------------------------------
// Listings: the v5 register (L01-L25), the Part N appraisals the
// register never took in (L26 on), and the older register (G01-G35).
// ---------------------------------------------------------------
function registerStatus(kit) {
  const chase = /^Chase(?: \((.+)\))?$/.exec(kit);
  if (chase) return { status: 'chase', reaction: chase[1] ?? null };
  if (/^Offer test/.test(kit)) return { status: 'chase', note: kit };
  if (/^Check result/.test(kit)) return { status: 'watch', note: kit, next: 'The auction result' };
  if (/^Watch/.test(kit)) return { status: 'watch', note: kit === 'Watch' ? null : kit };
  if (kit === 'Dropped') return { status: 'dropped' };
  if (kit === 'Closed') return { status: 'closed' };
  throw new Error(`a register status the load does not know: ${kit}`);
}

/** Portal property refs (P-001) named in the older register, by the house they describe. */
const portalRefs = (X) => X.data.listings.slice(1).filter((r) => /^P-\d{3}$/.test(r[2])).map((r) => ({ ref: r[2], address: r[3] }));

export function registerListings(X) {
  const refs = portalRefs(X);
  return X.register.map((r) => {
    const house = houseIn(X, r.source);
    const st = registerStatus(r.status);
    const closing = st.status === 'dropped' || st.status === 'closed';
    return {
      code: r.code, kit_ref: r.kit_ref, name: r.name, address: r.name, postcode: postcodeOf(r.name),
      links: r.link ? [r.link] : [], source: r.source, house_code: house, lot: lotOf(r.source),
      auction_on: house && r.date ? r.date : null, auction_at: house && r.date ? auctionAt(X, house, r.date) : null,
      sale_method: saleMethod(house, r.source), property_type: r.type, detached: detachedOf(r.type), beds: r.beds,
      minutes_from_home: r.mins, fee: r.fee ?? 0, fee_pct: r.pct ?? 0, purpose: 'candidate',
      status: st.status, status_reason: closing ? r.flag : (st.note ?? null), reaction: st.reaction ?? null,
      flag: r.flag || null, category: null, notes: null, next: st.next ?? null,
      property_ref: refs.find((p) => sameHouse(p.address, r.name))?.ref ?? null,
      confidence: 'researched', checked_on: REGISTER_ON,
    };
  });
}

/** Each Part N appraisal's listing: the register's, else a new L-code. */
export function appraisalListings(X, register) {
  let next = Math.max(...register.map((l) => Number(l.code.slice(1)))) + 1;
  const out = [];
  for (const a of X.data.appraisals.appraisals) {
    const hit = register.find((l) => sameHouse(l.name, a.address));
    if (hit) { out.push({ ap: a.id, code: hit.code, listing: null }); continue; }
    const code = `L${pad(next++)}`;
    const where = /\(([^)]+)\)\s*$/.exec(a.address)?.[1] ?? null;
    const house = houseIn(X, `${where ?? ''} ${a.asking ?? ''}`);
    out.push({
      ap: a.id, code, listing: {
        code, kit_ref: a.id, name: a.address.replace(/\s*\([^)]*\)\s*$/, ''), address: a.address,
        postcode: postcodeOf(a.address), links: a.link ? [a.link] : [], source: where, house_code: house,
        lot: lotOf(a.asking), auction_on: /auction/i.test(a.asking ?? '') ? dayIn(a.asking) : null, auction_at: null,
        sale_method: /auction/i.test(a.asking ?? '') ? 'auction' : saleMethod(house, where), property_type: a.type,
        detached: detachedOf(a.type), beds: bedsOf(/(\d+)-bed/.exec(a.type ?? '')?.[0]), minutes_from_home: null,
        guide_price: priceIn(a.asking, /Guide £([\d,]+)/i), fee: 0, fee_pct: 0, purpose: 'candidate',
        status: 'dropped', status_reason: a.verdict, reaction: null, flag: a.rules ?? null, category: null, notes: null,
        property_ref: null, confidence: 'researched', checked_on: a.date,
      },
    });
  }
  return out;
}

/** The older register (listings.csv) as G-codes, per the plan's Appendix B. */
export function olderListings(X, register) {
  const [head, ...rows] = X.data.listings;
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  return rows.map((r, i) => {
    const get = (k) => (r[col[k]] === '' || r[col[k]] == null ? null : String(r[col[k]]));
    const cat = get('category') ?? '';
    const ref = get('id');
    const price = Number(get('price'));
    const text = `${get('status') ?? ''}`;
    let status = 'unreviewed';
    let reason = null;
    let duplicateOf = null;
    let property = /^P-\d{3}$/.test(ref) ? ref : null;
    const twin = register.find((l) => sameHouse(l.name, get('address')));
    if (/^endgame/.test(cat)) status = 'watch';
    else if (/^(fails-lock|outside-radius|trap)/.test(cat)) { status = 'dropped'; reason = cat; }
    else if (cat === 'lost') { status = 'lost'; reason = text; }
    else if (cat === 'closed') { status = 'closed'; reason = text; }
    else if (cat === 'ruled-out' || (/^LIVE/.test(cat) && twin)) {
      status = 'closed';
      reason = twin ? `The same house as ${twin.code}, which carries it now` : text;
      if (twin && property) property = null;
    }
    // Whatever its status, a row that is a register house says so.
    duplicateOf = twin?.code ?? null;
    const sqft = /^\d+$/.test(get('sqft') ?? '') ? Number(get('sqft')) : null;
    const notes = [['EPC', get('epc')], ['council tax', get('ctax')], ['features', get('features')], ['beds as listed', get('beds')],
      ['listed', text]].filter(([, v]) => v && v !== 'ask').map(([k, v]) => `${k}: ${v}`).join('; ');
    const auction = /auction|MMoA|modern method/i.test(text);
    return {
      code: `G${pad(i + 1)}`, kit_ref: ref, name: get('address'), address: [get('address'), get('area')].filter(Boolean).join(', '),
      postcode: postcodeOf(get('area')), links: get('url') ? [get('url')] : [], source: `${KIT} data/listings.csv`,
      house_code: null, lot: null, auction_on: null, auction_at: null,
      sale_method: /MMoA|iamsold|modern method/i.test(text) ? 'mmoa' : auction ? 'auction' : 'private',
      property_type: get('type'), detached: detachedOf(get('type')), beds: bedsOf(get('beds')), baths: bedsOf(get('baths')),
      floor_area_m2: sqft ? Math.round(sqft * 0.09290304 * 10) / 10 : null, condition: get('condition'),
      minutes_from_home: null, guide_price: auction && price ? price : null, asking_price: !auction && price ? price : null,
      fee: 0, fee_pct: 0, purpose: /^endgame/.test(cat) ? 'benchmark' : 'candidate', status, status_reason: reason,
      reaction: null, flag: null, category: cat || null, notes: notes || null, property_ref: property, duplicate_of: duplicateOf,
      confidence: 'researched', checked_on: null,
    };
  });
}

// ---------------------------------------------------------------
// Appraisals and comparables.
// ---------------------------------------------------------------
const REGISTER_LABELS = { likely_buy: 'ESTIMATE', fin_lo: 'ESTIMATE', fin_hi: 'ESTIMATE', works: 'ESTIMATE', mins: 'ESTIMATE', fee: 'CHECK', pct: 'CHECK' };

export function registerAppraisals(X, listings) {
  return X.register.map((r) => {
    const out = X.results.register_v5.find((w) => w.id === r.kit_ref);
    if (!out) throw new Error(`no published register row for ${r.kit_ref}`);
    const l = listings.find((x) => x.code === r.code);
    return {
      code: r.code, appraised_on: REGISTER_ON, protocol: 'register-v5',
      inputs: { likely_buy: r.likely_buy, fin_lo: r.fin_lo, fin_hi: r.fin_hi, works: r.works, fee: r.fee ?? 0, pct: r.pct ?? 0, mins: r.mins },
      outputs: out, fits: r.fits, verdict: out.grade, override_grade: r.override_grade ?? null,
      override_reason: r.override_grade ? `Set by hand in the kit's register_v5.py; its flag reads: ${r.flag}` : null,
      next_checks: l?.next ? [l.next] : [], sources: [{ what: `${KIT}, model/register_v5.py`, on: REGISTER_ON }],
      labels: REGISTER_LABELS, narrative: null,
    };
  });
}

export function partNAppraisals(X, mapping) {
  return X.data.appraisals.appraisals.map((a) => {
    const { comps, ...narrative } = a;
    return {
      code: mapping.find((m) => m.ap === a.id).code, appraised_on: a.date, protocol: 'part-n',
      inputs: {}, outputs: null, fits: [], verdict: a.grade ?? null, override_grade: null, override_reason: null,
      next_checks: [], sources: [{ what: `${KIT}, data/appraisals.yaml`, id: a.id }],
      labels: { finished_value: 'ESTIMATE', works: 'ESTIMATE', comparables: 'VERIFIED' }, narrative,
    };
  });
}

// What kind of price a comparable is, as the kit's own words say: an
// asking price or a guide is not a sale, and an estimate is neither.
export const comparableKind = (type, when) => (/\(asking\)/i.test(type ?? '') ? 'asking'
  : /\(guide\)/i.test(type ?? '') ? 'guide' : /^estimate$/i.test(String(when ?? '').trim()) ? 'estimate' : 'sold');

export function comparables(X, mapping) {
  return X.data.appraisals.appraisals.flatMap((a) => (a.comps ?? []).map(([address, type, when, price]) => ({
    code: mapping.find((m) => m.ap === a.id).code, address, property_type: type ?? null, price,
    kind: comparableKind(type, when), when_text: when ?? null, on_date: monthYear(when),
    source: `${KIT}, data/appraisals.yaml ${a.id}`,
  })));
}

// ---------------------------------------------------------------
// Variables, scenarios, roads and rules.
// ---------------------------------------------------------------
export function variables(X) {
  const rows = Object.entries(X.variables).map(([key, v]) => ({
    key, label: MEANING[key] ?? null, value: v.value, unit: v.unit ?? null, low: v.low ?? null, high: v.high ?? null,
    evidence: v.evidence, certainty: v.certainty ?? null, confidence: v.confidence, confirmed_at: v.confirmed_at ?? null,
    source: v.source ?? null, source_date: v.as_of || null, status: 'active', resolution: null,
  }));
  const old = X.superseded['mortgage.house1_max_multiple'];
  if (old) {
    rows.push({ key: 'mortgage.house1_max_multiple', label: MEANING['mortgage.house1_max_multiple'] ?? null, value: old.value,
      unit: old.unit ?? null, low: null, high: null, evidence: old.evidence ?? 'ESTIMATE', certainty: old.certainty ?? null,
      confidence: 'drafted', confirmed_at: null, source: old.source ?? null, source_date: old.as_of || null,
      status: 'retired', resolution: `Retired: ${old.why}` });
  }
  return rows;
}

const describe = (o) => Object.entries(o ?? {}).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join('; ');
// Where each scenario came from in the kit, and the two the owner chose
// by name on 30 Sep 2026 ("Both": Optimistic and Highly optimistic).
const SCENARIO_SOURCE = {
  base: 'the variables as they stand', promotion: 'model/roads_v4.py PROMO', job_change: 'model/roads_v4.py DOWN',
  family_longer: 'model/roads_v4.py (inline variant)', bad_luck: 'model/roads_v4.py (inline variant)',
  no_child: 'model/roads_v4.py (inline variant)', no_help: 'model/roads_v4.py (help switched off)',
  optimistic: 'model/register_v5.py OPT', optimistic_promotion: 'model/register_v5.py OPT with roads_v4.py PROMO',
  highly_optimistic: 'data/listing_queue.yaml requested_scenario (the owner, 30 Sep 2026)',
  career: 'model/roads_v3.py CAREER', route_kit: 'model/engine.py, as the kit\'s 43 tests ran it',
};
const OWNER_CHOSE = new Set(['optimistic', 'highly_optimistic']);
export function scenarios(X) {
  return Object.entries(X.scenarios).map(([key, s]) => ({
    key, name: s.name, overrides: s.overrides ?? {}, works_factor: s.works_factor ?? null, help: s.help !== false,
    is_builtin: true, is_default: key === 'base', status: s.status ?? 'active',
    resolution: s.status === 'retired' ? 'Belongs to the retired v3 roads only' : null,
    description: [describe(s.overrides), s.works_factor != null ? `works x ${s.works_factor}` : '', s.help === false ? 'no local help' : '']
      .filter(Boolean).join('; ') || 'The variables as they stand',
    source: `${KIT}, ${SCENARIO_SOURCE[key] ?? 'data'}`, confidence: OWNER_CHOSE.has(key) ? 'confirmed' : 'drafted',
  }));
}

const decisionAnswer = (X, id) => X.data.decisions.decisions.find((d) => d.id === id)?.answer ?? '';
const render = (o) => Object.entries(o).map(([k, v]) => (typeof v === 'string' ? `${k}: ${v}`
  : Array.isArray(v) ? `${k}:\n${v.map((x) => `- ${typeof x === 'string' ? x : x.text ?? JSON.stringify(x)}`).join('\n')}`
    : `${k}: ${JSON.stringify(v)}`)).join('\n');

export function roads(X) {
  const out = X.roads.active.map((r, i) => ({
    code: r.code, name: r.name, kind: 'road', rank_label: r.rank ?? null, family: null, near: r.near, stages: r.stages,
    narrative: null, sort_order: (i + 1) * 10, status: 'active', retired_by: null, resolution: null, source: `${KIT}, model/roads_v4.py`,
  }));
  const retired = (by, why) => `Retired by ${by}: ${why}`;
  X.roads.retired.forEach((r, i) => out.push({
    code: r.code, name: r.name, kind: 'road', rank_label: null, family: r.family ?? null, near: null, stages: r.stages,
    narrative: r.career ? 'A career-path road' : null, sort_order: 200 + i, status: 'retired', retired_by: 'R-04',
    resolution: retired('R-04', decisionAnswer(X, 'R-04')), source: `${KIT}, model/roads_v3.py`,
  }));
  Object.entries(X.data.roads.roads).forEach(([id, r], i) => out.push({
    code: `V2-${id}`, name: r.short ?? id, kind: 'road', rank_label: null, family: null, near: null, stages: [],
    narrative: render(r), sort_order: 300 + i, status: 'retired', retired_by: 'R-03',
    resolution: retired('R-03', decisionAnswer(X, 'R-03')), source: `${KIT}, data/roads.yaml`,
  }));
  (X.data.roads.set_aside ?? []).forEach((r, i) => out.push({
    code: `V2-X${i + 1}`, name: r.road, kind: 'road', rank_label: null, family: null, near: null, stages: [],
    narrative: null, sort_order: 400 + i, status: 'retired', retired_by: null,
    resolution: `Set aside: ${r.why}`, source: `${KIT}, data/roads.yaml (set aside; ${r.src})`,
  }));
  Object.entries(X.routes).forEach(([id, r], i) => out.push({
    code: id, name: r.label, kind: 'ladder', rank_label: null, family: null, near: null, stages: [{ kind: 'route', ...r }],
    narrative: null, sort_order: 500 + i, status: 'retired', retired_by: 'R-03',
    resolution: 'The older route model, which the kit\'s 43 tests exercise; the roads replaced it (R-03)', source: `${KIT}, data/routes.yaml`,
  }));
  return out;
}

export function rules(X) {
  const S = X.data.appraisals.standard;
  const out = (S.hard_rules ?? []).map((rule, i) => ({ code: `HR-${i + 1}`, scope: 'all', kind: 'hard', rule, params: [], severity: 'block',
    source: `${KIT}, data/appraisals.yaml hard_rules` }));
  const scopeOf = (k) => (k.startsWith('rules.forever') ? 'forever' : k.startsWith('rules.house1') ? 'house1' : k.startsWith('rules.rent') ? 'renting' : 'all');
  const RULE_TEXT = {
    'rules.forever_max_minutes': 'The forever home is within this many minutes of home',
    'rules.house1_max_minutes': 'House 1 is within this many minutes of home',
    'rules.house1_min_beds': 'House 1 has at least this many bedrooms as found (the House 1 default: AP-008, AP-013)',
    'rules.rent_max_months': 'Renting lasts no more than this many months',
  };
  Object.keys(X.variables).filter((k) => k.startsWith('rules.')).forEach((k, i) => out.push({
    code: `RV-${i + 1}`, scope: scopeOf(k), kind: /min_beds/.test(k) ? 'default' : 'hard',
    rule: RULE_TEXT[k] ?? `See ${k}`, params: [k], severity: /min_beds/.test(k) ? 'warn' : 'block',
    source: X.variables[k].source,
  }));
  Object.entries(S.defaults ?? {}).forEach(([k, rule], i) => out.push({ code: `DF-${i + 1}`, scope: 'house1', kind: 'default',
    rule: `${k}: ${rule}`, params: [], severity: 'warn', source: `${KIT}, data/appraisals.yaml defaults` }));
  return out;
}

// ---------------------------------------------------------------
// Decisions, checkpoints, signals, evidence and auctions.
// ---------------------------------------------------------------
export function decisions(X, register = []) {
  const refs = portalRefs(X);
  return X.data.decisions.decisions.map((d) => {
    // A decision about a candidate house is scoped to its portal property
    // where it has one, and otherwise linked to the listing it names.
    const candidate = d.topic === 'Candidates';
    const property = candidate ? refs.find((p) => sameHouse(p.address, d.q, 1))?.ref ?? null : null;
    const about = candidate && !property ? register.filter((l) => sameHouse(l.name, d.q, 1)).map((l) => l.code) : [];
    return {
      code: d.id, topic: d.topic, title: d.q, decided: d.answer ?? null,
      rationale: [d.note, d.supersedes_note].filter(Boolean).join(' ') || null, decided_on: d.date,
      status: d.status === 'superseded' ? 'superseded' : 'active',
      firmness: ['locked', 'lean', 'open'].includes(d.status) ? d.status : null,
      door: d.door ?? null, evidence: d.source ?? null, certainty: d.conf ?? null, reopen_if: d.reopen_if ?? null,
      checkpoint: d.checkpoint ?? null, source: `${KIT}, data/decisions.yaml`, property_ref: property, about,
      supersedes: d.supersedes ?? [], confirms: d.confirms ? [].concat(d.confirms) : [],
    };
  });
}

export const checkpoints = (X) => X.data.decisions.checkpoints.map((c, i) => ({
  key: c.id.toLowerCase(), title: `${c.id}: ${String(c.settles).split(/[(,;]/)[0].trim()}`,
  description: `${c.settles}. When: ${c.when}${dueOf(c.when) ? ' (the date is the end of that period, approximate)' : ''}.`,
  due_on: dueOf(c.when), sort_order: (i + 1) * 10,
}));

export function signals(X, register) {
  const P = X.data.preferences;
  const src = `${KIT}, data/preferences.yaml`;
  const out = P.signals.map((s) => ({
    code: s.id, kind: 'signal', words: s.words, context: s.context ?? null, implies: s.implies ?? null,
    open_question: s.open ?? null, conflicts: s.conflicts ?? [], certainty: s.confidence ?? null, rating: null, said_on: null,
    notes: [s.note, s.round1 != null ? `Round 1: ${typeof s.round1 === 'string' ? s.round1 : JSON.stringify(s.round1)}` : null]
      .filter(Boolean).join(' ') || null, source: src, about: [],
  }));
  let n = Math.max(...P.signals.map((s) => Number(/\d+/.exec(s.id)[0])));
  for (const q of X.data.listing_queue?.luke_signals ?? []) {
    n += 1;
    out.push({ code: `S-${n}`, kind: 'signal', words: q.words, context: q.listing, implies: q.status ?? null, open_question: null,
      conflicts: [], certainty: 'H', rating: null, said_on: REGISTER_ON, notes: null, source: `${KIT}, data/listing_queue.yaml`,
      about: register.filter((l) => sameHouse(l.name, q.listing)).map((l) => l.code) });
  }
  P.round1_reactions.forEach((r, i) => out.push({
    code: `R1-${pad(i + 1)}`, kind: 'reaction', words: r.why ? `${r.rating}: ${r.why}` : r.rating, context: r.item,
    implies: null, open_question: null, conflicts: [], certainty: null, rating: r.rating, said_on: r.date ?? null, notes: null,
    source: `${src} round1_reactions`, about: [],
  }));
  P.patterns.forEach((p, i) => out.push({
    code: `PT-${i + 1}`, kind: 'pattern', words: p.p, context: p.cards ?? null, implies: null, open_question: null,
    conflicts: [], certainty: p.conf ?? null, rating: null, said_on: null, notes: p.test ?? null, source: `${src} patterns`, about: [],
  }));
  return out;
}

export function evidence(X) {
  const [head, ...rows] = X.data.evidence;
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  return rows.map((r) => ({ code: r[col.id], period: r[col.date] || null, topic: r[col.topic] || null, claim: r[col.claim],
    figure: r[col.figure] || null, source: r[col.source] || null, used_in: r[col.used_in] || null }));
}

export const calendar = (X) => X.data.auctions.events.map((e) => ({
  house_code: e.a, kind: e.kind === 'cat' ? 'catalogue' : e.kind === 'open' ? 'bidding_opens' : 'auction', on_date: e.d,
  title: e.note ? `${e.t} · ${e.note}` : e.t, checked_on: CALENDAR_CHECKED,
}));

export const results = (X) => X.data.auctions.results.map((r) => ({
  house_code: r.auctioneer, sold_on: r.date, lot: r.lot, property_type: r.type && r.type !== '—' ? r.type : null,
  guide: r.guide ?? null, sold: r.sold ?? null, outcome: r.sold != null ? 'sold' : 'watched', lesson: r.lesson ?? null,
  source: `${KIT}, data/auctions.yaml`,
}));

export function playbook(X) {
  const pb = X.data.auctions.playbook;
  return [
    ...(pb.weekly ?? []).map((body, i) => ({ code: `W${i + 1}`, kind: 'weekly', body, sort_order: (i + 1) * 10 })),
    ...(pb.what_did_not_work ?? []).map((body, i) => ({ code: `X${i + 1}`, kind: 'did_not_work', body, sort_order: 100 + (i + 1) * 10 })),
  ];
}

// ---------------------------------------------------------------
// The kit's published results as the first accepted baseline, one
// headline per road and scenario (the full results are in the frozen
// kit-v5 scenario).
// ---------------------------------------------------------------
const KIT_RUNS = { base: 'base', promotion: 'promotion', job_change: 'job_change', family_longer: 'family_longer',
  stress: 'bad_luck', nochild: 'no_child', no_help: 'no_help' };
const headline = (r) => ({
  forever_today: r.forever_today ?? null, forever_price: r.forever_price ?? null, forever_when: r.forever_when ?? null,
  min_cash: r.min_cash ?? null, min_cash_when: r.min_cash_when ?? null, fa_used: r.fa_used ?? null,
  works_done: r.works_done ?? null, works_left: r.works_left ?? null,
  profits: (r.ledger ?? []).filter((e) => String(e.step).startsWith('Sell')).map((e) => e.profit),
});
export function kitRuns(X) {
  const out = [];
  for (const [code, res] of Object.entries(X.results.roads_v4)) {
    for (const [kitKey, scenario] of Object.entries(KIT_RUNS)) {
      if (res[kitKey]) out.push({ road_code: code, scenario_key: scenario, run_name: 'main', summary: headline(res[kitKey]) });
    }
    if (res.if_found_jan_2028) out.push({ road_code: code, scenario_key: 'base', run_name: 'found_later', summary: headline(res.if_found_jan_2028) });
    if (res.if_found_jan_2028_family) out.push({ road_code: code, scenario_key: 'family_longer', run_name: 'found_later', summary: headline(res.if_found_jan_2028_family) });
    if (res.sustainability) out.push({ road_code: code, scenario_key: 'base', run_name: 'sustainability', summary: { table: res.sustainability } });
  }
  for (const [code, o] of Object.entries(X.results.optimistic_v5)) {
    out.push({ road_code: code, scenario_key: 'optimistic', run_name: 'main', summary: o });
  }
  return out;
}
