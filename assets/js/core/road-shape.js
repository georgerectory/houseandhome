// road-shape.js - the columns the Road Ahead page reads, in one place.
//
// Two sources have to agree: loadRoadAhead() in store.js selects exactly
// these columns from Supabase, and tools/build-road-fixture.mjs refuses to
// write a demo row with any more or fewer. So the page renders the demo
// and the live data from one shape, and a column the page starts relying
// on cannot exist in one and not the other. Pure: no DOM, no fetch.

export const ROAD_SHAPE = Object.freeze({
  variables: ['key', 'label', 'value', 'unit', 'low', 'high', 'evidence', 'certainty', 'confidence',
    'confirmed_at', 'source', 'source_date'],
  scenarios: ['key', 'name', 'description', 'overrides', 'works_factor', 'help', 'is_builtin', 'is_default',
    'status', 'confidence'],
  roads: ['code', 'name', 'kind', 'rank_label', 'family', 'near', 'stages', 'fit', 'narrative', 'sort_order', 'status'],
  rules: ['code', 'scope', 'kind', 'rule', 'check_id', 'params', 'severity', 'decision_code'],
  // ra_register: a listing, its latest appraisal with figures, its
  // current judgements and the next pipeline step.
  register: ['id', 'code', 'kit_ref', 'name', 'address', 'postcode', 'links', 'source', 'house_code', 'lot',
    'auction_on', 'auction_at', 'sale_method', 'property_type', 'detached', 'beds', 'baths', 'floor_area_m2',
    'plot_acres', 'condition', 'minutes_from_home', 'guide_price', 'asking_price', 'fee', 'fee_pct', 'purpose',
    'status', 'status_reason', 'reaction', 'flag', 'category', 'notes', 'confidence', 'checked_on',
    'appraised_on', 'protocol', 'inputs', 'outputs', 'fits', 'verdict', 'override_grade', 'override_reason',
    'positives', 'negatives', 'red_flags', 'next_checks', 'days_to_auction', 'judgements', 'next_step',
    'write_up_on', 'write_up_verdict', 'sources', 'labels'],
  // listing_code is resolved from listing_id by the loader.
  comparables: ['listing_code', 'address', 'property_type', 'price', 'kind', 'when_text', 'on_date', 'source',
    'url', 'confidence'],
  pipeline: ['listing_id', 'code', 'name', 'house_code', 'house_name', 'lot', 'auction_on', 'auction_at',
    'listing_status', 'step_key', 'label', 'settles', 'sort_order', 'due_on', 'days_until', 'done_on', 'outcome',
    'is_done'],
  // whats_next, from today on.
  next: ['source', 'title', 'on_date', 'days_until', 'open_items'],
  ledger: ['measure', 'model_value', 'model_confidence', 'model_source', 'ledger_value', 'ledger_as_of'],
});

/** The columns of one part as a PostgREST select list. */
export const columns = (part) => ROAD_SHAPE[part].join(', ');
