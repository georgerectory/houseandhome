# Property brain overhaul: the plan

Approved 6 Nov 2026 in a plan-mode session (S-108). Nothing below is built yet; each stage ships on its own.
Repository `georgerectory/houseandhome`; Supabase `fggexvcodgmpkxkgpxet`.
CLAUDE.md binds every stage: privacy, RLS in the same change, nothing deleted, confidence ladder,
`house.change_why`, verify by re-reading, `npm test` green.

## Context

The system grew by conversation over a year: a house manager for one house, then Road Ahead (the
Rectory kit port), candidate houses, auctions, west roads and four research waves. It works, but nobody
(owner or Claude) can say exactly what it is, and Claude only reaches part of it. The goal (S-108) is
**one organised, linked, trustworthy store** that can:
- answer any question;
- weigh any link I'm sent against your preferences, the market and your money;
- take in every conversation;
- focus on one house once it is chosen.

### Decisions taken in this session (write as R-22 to R-25 when Stage 0 runs)
1. **Fit and money are scored separately, never blended.** DF-2 ("location only through profit") and G-P01R ("numbers only") are retired with a reason.
2. **Link intake: one page, on request.** No crawling. Agent and auctioneer pages are fetched directly. Portal pages are read through your browser (Claude in Chrome) or from pasted text. Every fact carries the URL and the date.
3. **Forest View (P-003) is archived because finance refused it.** The system goes into search mode, and Forest View becomes the worked example for focus mode.
4. **Clean table names, with the old names kept as views for one stage**, then the views are dropped.

## Phase 0 findings: the as-is picture (one page)

**What it is today.** Three systems share one database and one site.
- **(A) The house manager:** work_items, priority, allocation, a derived shopping list, a 3D building model, takeoff, roadmap and Handbook. Built for P-001, then rebuilt around P-003.
- **(B) Road Ahead:** a JavaScript port of the Rectory kit v5 Python, held to it by a golden master.
  - roads, scenarios, a listings register, appraisals and auctions;
  - the `ra_*` tables and the 20 `ra_` SQL functions.
- **(C) A research and knowledge layer bolted on in the last week:**
  - `tools/ingest-research.mjs`;
  - `routes.js`, the rent-or-buy month walker;
  - evidence, contradictions and signals.

**Data (live counts).**

| Table | Rows | Table | Rows |
|---|---|---|---|
| change_log | 594 | knowledge_links | 136 |
| ra_evidence | 414 | contradictions | 112 (94 open) |
| ra_variables | 408 | ra_listings | 103 |
| work_items | 361 | decisions | 100 |
| ra_sensitivity | 290 | ra_appraisals | 51 |
| ra_comparables | 283 | ra_signals | 144 |

- 85 tables, about 25 of them empty (invoices, quotes, spend_events, deposits, allocations, learning_*, assets' children, recipes, monthly_actuals).
- `pg_stat` counts are stale and under-report; use `count(*)`.

**What is wrong, in order of harm**
1. **`ra_variables` is a junk drawer: 408 keys under 57 prefixes.**
   - *Duplicate families:* cost/costs, road/roads, mortgage/lending/lenders/help, house1/fa/yfh.
   - *Property facts filed as global keys:* per-house key families (one per candidate house, the largest 13-14 keys), offer.*.
   - *Computed answers stored as inputs:* buyer.cash_left_<house>_<price>, buyer.payment_<price>, appraisal.*, verdict.*, buy.max_price_model. They go stale silently.
   - *Place statistics encoded in key names:* about 12 west.detached_median_<place> keys.
   - *44 JSON blobs:* area.west_villages, lending.products, research.route_results, research.chart_series, 10 forecast.* objects, market.*, timeline.*, routes.inputs.
2. **Evidence is not connected.**
   - 414 rows with about 170 free-text topics, case-inconsistent (Lending/lending, P-004/p004).
   - `used_in` is free text (West, Routes, Wave, L55…), not links.
   - No confidence, no label, no URL column.
   - Comparables hang off one `listing_id`, with no strength or place: L53 has 84, while live candidates have 1–3.
3. **The link graph is thin.** 136 links with no strength. Evidence, comparables, contradictions, sources, properties and events cannot be linked at all; they are not registered as entity types.
4. **There is no preference model.** Your preferences live in 144 signals (free-text rating/certainty), 100 decisions, 4 hard rules and prose. Nothing scores fit.
5. **Five month-by-month cash simulators:** cashOverTime, routes.walk, allocate.projectFunding, road-ahead simulate and ladder.runRoute.
   - Three month formats: strings, tuples and days.
   - Variable lookup written four times.
   - Three appraisal protocols with free-text verdicts.
6. **Forest View is hard-coded into generic code:**
   - `cash-plan.js` design groups;
   - `pages/forest/*` (the `fv-` prefix, lender and term labels);
   - `building-data.js` `BUILDING='forest-view'`, which takeoff, stages-sql and rooms-sql regex-scrape;
   - `ingest-research.mjs` `LISTING_FOR` and dated `ALIASES`;
   - `ingest-document.mjs` strips the footer of 48 Ameysford Road (P-001).
7. **Docs are stale or overlapping.**
   - CLAUDE.md, STATE, P-003, FOREST-VIEW-PLAN, OFFER and the ROUTES map still say Forest View is the plan.
   - PLAN.md (1236 lines) §5 and §14 no longer match the schema.
   - PLAN §8.5 ("batch questions") contradicts WORKING_STYLE ("one clickable question").
   - Benchmark pseudo-listings L50–L54 stand in for roads.
   - ra_sensitivity is from 1 Oct.
   - The last STATE commit (S-108 pause) sits on `claude/property-development-plan-yh5u11`, not main.

**What Claude can reach easily today:**
- `road_ahead_context()`: variables, roads, rules, decisions, contradictions, register, next actions;
- `road_ahead_agenda()`;
- `house_context()`.

**What it cannot reach easily:**
- evidence, signals, comparables and appraisals (none are in any context call);
- "everything about the lead house";
- a search across the text: there is no full-text search, no trigram index and no pgvector (vector 0.8.2 is available but not installed);
- documents and emails, which leave no trace.

**What works and stays:** see "What I would not change" at the end.

**Recall from past chats.** This session has no tool to search claude.ai chats.
- The Claude Code sessions are visible. The relevant ones:
  - "Property development comprehensive plan" (31 Oct–6 Nov), whose recall already landed as `Recall:` and `Road recall` evidence rows;
  - "Road Ahead portal feature plan" (30 Sep–3 Oct; auctions);
  - "Property renovation planning and design options" (24–25 Sep);
  - "Home renovation planning system" (13–15 Sep; savings and deposit);
  - "Multi-profile house search system" (Aug);
  - the June Apify/Rightmove scraper sessions, a dead mechanism in an older repo.
- The claude.ai chat recall is a task in the hand-off prompt (RECALL_LEDGER block; the prompt itself is private). The loader already takes it.

---

## Target design (what the brain is)

### Modes
- **SEARCH:** no active house; the default from Stage 0.
- **FOCUS:** one chosen house.
- **OWN:** after completion; the house manager as today.

Scopes stay as they are: USER, BRIEF (it becomes the preference matrix), TEMPLATE, LIBRARY, PROPERTY.

### Canonical entities (new name ← old)

| Entity | Table | From |
|---|---|---|
| Listing (every house ever seen) | `listings` | `ra_listings` |
| Listing attribute (EPC, heating, drainage, flood band, broadband, floor area, plot, covenants…) | `listing_facts` (listing, attribute, value, unit, source_id, as_of, label, confidence) | per-house key families; LISTINGS extra columns |
| Deep-modelled house | `properties` (unchanged) | linked 1:1 by `listings.property_id` |
| Place (village, ward, postcode sector, MSOA) | `places` | `area.west_villages`, VILLAGES block |
| Market statistic | `market_stats` (place, metric, segment, period, value, n, source_id) | `west.detached_median_*` and postcode-sector keys |
| Comparable | `comparables` (+ place_id, beds, m2, lat/lng optional) | `ra_comparables` |
| Forecast | `forecasts` (forecaster, area, published, horizon, pct) | `forecast.*` blobs |
| Lender / product / rule | `lenders`, `lending_products`, `lending_rules` (condition, retention, LTI wording) | `lending.products`, `mortgage.*` lender keys |
| Party (agent, broker, solicitor, surveyor, auctioneer) | `parties` | `contractors` stays for trades |
| Source (web page, email, PDF, chat, research reply) | `sources` | `source_documents`, extended with url, publisher, retrieved_on, kind |
| Evidence | `evidence` (+ topic_key, label, confidence, source_id) | `ra_evidence` |
| Topic taxonomy | `topics` (key, label, parent) | about 170 free topics mapped to about 25 |
| Assumption (model input) | `assumptions` | the `ra_variables` that stay inputs |
| Signal, decision, contradiction, judgement | `signals`, `decisions`, `contradictions`, `judgements` | `ra_signals`, `ra_judgements` |
| Criterion (preference matrix) | `criteria` + `criterion_history` (append-only) | new |
| Assessment (scored verdict) | `assessments` | new; old `ra_appraisals` kept read-only |
| Dated action | `scheduled_events` (+ listing_id, party_id) | |
| Link | `knowledge_links` **extended** (not replaced) | |

**Naming rules (go in docs/ARCHITECTURE.md):**
- Tables are plural domain nouns with no history prefix; Road Ahead-only machinery keeps `ra_` (roads, scenarios, road_runs, sensitivity, auctions).
- Codes are `L`/`G` for listings, `S` signals, `R`/`RA`/`G`/`P` decisions, `E` evidence, `C` criteria, `A` assessments.
- Assumption keys are `<namespace>.<thing>`, with these namespaces only:
  - `me` (income, cash, pension, commitments);
  - `lending`;
  - `tax`;
  - `fees`;
  - `costs` (running and works rates);
  - `market` (indices, uplift, rents);
  - `model` (timeline, horizon, route inputs, targets).
- No property, place or lender name ever appears in a key.
- A computed figure is never stored as an assumption.

### Links (extend `knowledge_links`)
- **New columns:**
  - `strength numeric(3,2)` 0–1;
  - `basis text`: how it was set (owner, claude, or engine:<rule>);
  - `source_id`;
  - `property_id`, nullable.
- Register every entity above in `link_entity_types`.
- New kinds: `supports`, `contradicts`, `comparable_for`, `located_in`, `evidence_for`, `drives` (criterion ← signal/decision), `from_party`.
- **Engine-set strengths:**
  - comparable_for = f(same sector or distance, type match, beds and m² similarity, recency);
  - evidence_for = label weight (VERIFIED 1.0, ESTIMATE 0.5, CHECK 0.3) × recency.
- Owner or Claude links default to 1.0 unless stated.

### Retrieval for an AI
- **`brain_context()`:** one lean start-of-session call.
  - mode, active or lead houses, open dated actions, criteria summary, top open contradictions, counts;
  - it replaces chaining road_ahead_context and house_context. Both stay as specialist calls.
- **`brain_about(type, code_or_id)`:** everything about X in one call.
  - the row, its facts, links sorted by strength, evidence, comparables, signals, decisions, contradictions, the latest assessment, events and sources.
- **`brain_search(q, types[])`:** full-text search ranked across evidence, signals, decisions, listings, facts, sources and notes.
  - `tsvector` generated columns plus GIN;
  - `pg_trgm` for addresses and names;
  - `unaccent`.
- **`brain_agenda()`:** extends road_ahead_agenda with:
  - signals not reflected in criteria;
  - listings missing facts the matrix weights highly;
  - stale assessments;
  - expiring DIP and rates.
- **pgvector: not now.** It needs an embedding API key through an Edge Function. At about 2k text rows, full-text search plus links plus brain_about is enough. Revisit (open decision 6) if search misses things in practice.

---

## Stages (each ships on its own; `npm test` green and advisors clean at the end of each)

### Stage 0: Truth and housekeeping (0.5 session)
- **Goal:** the repo and data say what is true today.
- **Data:**
  - Write decisions R-22 to R-25 (the four above), drafted, then confirm with you.
  - Archive P-003 via `set_property_status` with the refusal as the reason, which empties the house switcher's active slot. L45 → `closed`.
  - Close the four stale 31 Oct `scheduled_events` and the 10 `fv-` contradictions as superseded, with a reason.
  - `offer.property_ref` is retired.
- **Docs:**
  - Move P-003 docs to `docs/properties-archive/` with the ARCHIVED header.
  - Fold the paused STATE commit from `claude/property-development-plan-yh5u11` into this branch.
  - STATE rewritten for search mode.
  - CLAUDE.md "active property" section → "no active house; search mode", pending Stage 7's rewrite.
- **Code:** the site with no active property must render without errors (check index, money, plan, handbook). Fix any crash.
- **Tests:** frontend gate with the fixture set to no active property; a lifecycle SQL test that archive leaves rows intact.
- **Risk:** low. Archive is reversible with `make_active`.
- **You'll see:** the header says Search; nothing claims Forest View is live.

### Stage 1: Inventory, glossary, naming, dead-code list (1 session)
- **Goal:** the as-is map is written down, and every rename is decided before any is done.
- **Docs:**
  - `docs/ARCHITECTURE.md`: the entity model, modes, scopes, naming rules, the module map, and what each table is for.
  - GLOSSARY refreshed.
  - PLAN.md marked as the historical design record, with a header listing which sections are superseded. It is not rewritten.
- **The rename ledger (a script output, committed without values):**
  - `docs/migration/variable-keys.md`: each of the 57 prefixes → action (rename, to_row, to_listing_fact, retire_computed or keep).
  - `docs/migration/topics.md`: about 170 evidence topics → about 25 topic keys.
- **Dead-code removal list (removed in the stage that touches them):**
  - unused exports: `sensitivity.lowestCash`, `money.cmpMonth`, `prefs.getOneOf`, `pages.ALL_PAGES`;
  - the stale reference to `road-ahead-kit.test.mjs`;
  - the routes.js doc-comment mismatch;
  - the `loadRoadAhead()` over-fetch on Money, Plan and Handbook (about 21 queries for one table);
  - the empty `recipes`/`recipe_ingredients`/`consumables` tables if you confirm they are out of scope (open decision 4);
  - the benchmark pseudo-listings L50–L54, closed with a reason and re-expressed as route fixtures.
- **Tests:** none new. The secrets gate covers the new docs.
- **Risk:** none (docs only).
- **You'll see:** one page that explains the whole system.

### Stage 2: Data model, links and retrieval (3–4 sessions; the big one, split 2a–2d)
- **2a. New tables and the rename.**
  - Create the tables above, with RLS and policies in the same migration.
  - Rename `ra_listings`→`listings`, `ra_comparables`→`comparables`, `ra_evidence`→`evidence`, `ra_signals`→`signals`, `ra_judgements`→`judgements`, `ra_variables`→`assumptions`.
  - Each old name stays as an updatable view (`security_invoker`) for one stage.
  - SQL functions repointed; `core/road-shape.js` and `store.js` updated.
  - Schema files renumbered by domain under the same `NN_domain.sql` rule.
- **2b. Blobs → rows:**
  - `area.west_villages` and the VILLAGES block → `places`;
  - `west.detached_median_*` etc. → `market_stats`;
  - `lending.products` → `lending_products`;
  - forecast.* → `forecasts`;
  - `research.route_results`/`chart_series` → `route_results` rows, or retired as computed;
  - per-house key families → `listing_facts`;
  - derived keys (buyer.cash_left_*, payment_*, appraisal.*, verdict.*, buy.max_price_model) → `status='retired', resolution='computed by engine (Stage 4)'`. They are never deleted.
  - The rest are renamed into the seven namespaces through `key_aliases`, so old keys still resolve for one stage.
- **2c. Provenance.**
  - `sources` back-filled from `source` text, URLs and source_documents.
  - Every evidence, fact, comparable and assumption gets `source_id`, `as_of`, `label` and `confidence`. The research replies give dates, and any that cannot be dated are labelled CHECK.
  - evidence.topic → topic_key.
  - `used_in` is parsed into `evidence_for` links where it names a code (L55, P-004, R-10, a variable key). The text is kept.
  - Comparables get `place_id` and `comparable_for` links with computed strength.
- **2d. Retrieval:** `brain_context`, `brain_about`, `brain_search`, `brain_agenda`. Extensions: `pg_trgm`, `unaccent`.
- **No data lost; the migration is proven by a reconciliation query committed as `tools/migration-ledger.sql`:**
  - every old row id appears in its new home or in a retired state;
  - counts match per table;
  - every old variable key resolves through `key_aliases`.
  - Run before and after; the result is stored in `change_log`.
- **Tests:**
  - SQL: RLS isolation for each new table; the old-name views read and write the same as the new tables; `brain_about` returns the expected sections on a fixture.
  - Parity: the JS and SQL appraisals are unchanged.
  - Checksums: the Rectory kit figures are unchanged. **This is the guard: the rename must not move a single published figure.**
  - Schema fingerprint matches.
- **Risk:** high (wide rename). Mitigations: views for the old names, one domain per migration, the kit checksums, and a Supabase branch (`create_branch`) to rehearse 2a on before main.
- **You'll see:** "tell me everything about the lead house" returns one complete answer from one call.

### Stage 3: The preference matrix (2 sessions + your review sit-downs)
- **Schema:**
  - **`criteria`:** code C-nn, group (house, plot, location, services, risk, money, project), label, attribute, scale (numeric, ordinal, boolean or category).
    - The attribute is a `listing_facts` attribute or a computed metric such as drive_minutes or cash_left.
    - `ideal`, `acceptable` and `dealbreaker` as typed ranges.
    - `weight` 0–10; `flexibility` none, low, medium or high, held as a tolerance multiplier.
    - `confidence`, `status`; the source is held as links (`drives`) to signals and decisions.
  - **`criterion_history`** (append-only): old, new, why, signal or decision code, at, by.
  - A trigger refuses a change without a why, like the money fields.
- **Seeding pass:**
  - Claude reads S-1..S-108 and the R/RA/G/P decisions.
  - HR-1..4 become dealbreakers on type; RV-1..4 become drive-time and rent-months criteria; R-20 sets drive time ≤120 minutes; R-21 makes a 3-bed with a real plot acceptable.
  - Expect 40–60 criteria. Everything lands `drafted`, and the source links are written.
- **Review:** a sit-down, one clickable question per criterion. Weight and range first, flexibility second; each answer is written and read back, and moves `confidence` to `confirmed`.
- **Feedback loop:** every new signal or decision proposes criterion changes (CAPTURE playbook). `brain_agenda` lists signals with no `drives` link.
- **Tests:** SQL tests that the history trigger refuses a change with no reason and that RLS holds. A unit test for the range-parsing helpers.
- **Risk:** your time; mitigate by seeding hard rules and confirmed decisions first, then reviewing the rest in 15-minute sit-downs.
- **You'll see:** a Preferences page, with each criterion's weight, range, flexibility, source and full history.

### Stage 4: Scoring and valuation engine (3 sessions)
- **Pure functions under `assets/js/engine/brain/`** (no DOM, no fetch; about 400 lines per module):
  - `fit.js`: per criterion, satisfaction s∈[0,1].
    - Ideal gives 1. Between the ideal and acceptable edges it falls linearly from 1 to 0.6; between acceptable and dealbreaker, from 0.6 to 0.
    - At the dealbreaker: a FAIL gate unless flexibility ≥ medium, in which case it is FLEXED (s=0, flagged).
    - Unknown data is excluded and reported as coverage, never counted as a fail.
    - Fit = Σw·s / Σw over known criteria; coverage = Σw(known) / Σw(all).
    - The working is a table: criterion, value, band, s, w, contribution, and how close it came.
  - `value.js`: value as it stands and finished.
    - From comparables weighted by link strength: £/m², time-adjusted by a `market_stats` index; sector median fallback.
    - Output p25/p50/p75 and a confidence from n and spread.
    - Over/under-value = price vs the band.
  - `money.js`: affordability per lender product.
    - LTI and LTV caps from `lending_rules` and products; SDLT reuses `road-ahead/money.js` sdlt; fees.
    - Cash left, monthly payment, share of net pay.
    - Running costs: council tax band × place, heating fuel, insurance, broadband, drainage.
    - Works: coarse, £/m² by condition from `price_references` and `work_item_templates`. The full takeoff is used only in focus mode.
  - `route-impact.js`: runs `routes.walk` with this house as the buy route and reports the months to each forever-home price target, and the change in wealth by 2030. Thresholds come from assumptions, not code.
  - `verdict.js`: the fixed short format (below).
- **Consolidation in this stage:**
  - one `engine/core/months.js` (a single month type plus adapters for the kit's tuples, with the kit golden master untouched);
  - one `engine/core/assumptions.js` lookup replacing the four copies;
  - cash-over-time keeps walking; its date helpers move out.
- **SQL side:**
  - `assess_listing(code)` gathers the inputs into one JSON object (like `ra_assess_inputs`).
  - The JS engine runs in a session through a CLI, `tools/assess.mjs`, and writes `assessments` (inputs, fit_working, value, money, route_impact, verdict, engine_version).
  - This is one engine, in JS only: no SQL mirror for the new engine. The parity burden stays only where it already exists.
- **Verdict format** (numbers first):
  - `L55: GOOD FIT, FAIRLY PRICED. Fit 82 (coverage 71%). Value p50 ±. Cash left. Payment as a share of take-home. Routes: target home in N months (−2).`
  - Then: passes (top 3), fails and flexes (top 3), unknowns that matter (top 3), next checks.
  - Every figure is labelled with its confidence. It never says "affordable" on unconfirmed inputs; it says "on unconfirmed figures".
- **Proof:** golden tests in `tests/unit/brain-*.test.mjs` on invented fixtures (`tests/fixtures/brain/*.json`) covering:
  - hand-computed fit scores;
  - a dealbreaker gate;
  - flex;
  - coverage with missing data;
  - a valuation with known comps;
  - an SDLT and LTV edge;
  - route-impact deltas.
  Private-input checksums, if wanted, follow the existing gitignored-extract pattern.
- **Risk:** medium (the model choice). It is made transparent: every weight and band is a row you can change.
- **You'll see:** any listing gets a verdict with the working shown, and re-scoring all live listings is one command.

### Stage 5: Intake pipelines (2 sessions)
- **One loader:**
  - `tools/ingest-research.mjs` → `tools/ingest.mjs`, the same block format, now with a `LISTING_FACTS` block and `for` codes resolved by search rather than the hard-coded `LISTING_FOR`;
  - `ALIASES` moves to `key_aliases` rows;
  - ROUTE_RESULTS targets become parameters.
  - It writes to the new tables, sources first.
- **Link → verdict:**
  1. A playbook fetches one page (decision 2) and extracts a LISTINGS + LISTING_FACTS block.
  2. Dedupe via `brain_search` (postcode, trigram on address, URL).
  3. Load, then auto-link comparables and the place.
  4. `tools/assess.mjs`, then reply in the verdict format and record your reaction as a signal.
- **Research reply → load:** as today, plus a dry-run summary (new, updated, contradicted, NOT FOUND) before commit.
- **Conversation → signals → criteria:** the CAPTURE playbook at the end of every session. New S-codes and decisions, proposed criterion changes as one clickable question each, and history written.
- **Emails and documents → evidence, events and parties:**
  - `ingest-document.mjs` generalised, with the Ameysford footer and handbook layout moved to a per-document profile.
  - An email pasted or forwarded becomes a `sources` row (kind=email), evidence rows, `scheduled_events` with dates, and `parties`.
- **Tests:** loader unit tests extended (existing 9 + new blocks); a fixture email → expected rows; a dedupe test.
- **Risk:** low to medium.
- **You'll see:** send a link, get a verdict in one reply.

### Stage 6: Focus mode (2 sessions)
- **`focus_on(listing_code)`** SQL function, idempotent:
  - promote the listing → property (reuse `ra_promote_listing`, `new_property`, `make_active`);
  - copy listing_facts into house_facts;
  - seed work_items from `work_item_templates` by the property's scope decision;
  - open the checklist as `scheduled_events`;
  - set mode=FOCUS.
- `release_focus()` archives the property the same way (the Stage 0 pattern).
- **De-Forest-View the generic code:**
  - `cash-plan.js` design groups → data from `building_stages`/`work_phases`;
  - `pages/forest/*` → `pages/focus/*` filtered by `property_id`, with no `fv-` prefix and labels from sources;
  - `building-data.js` BUILDING → the active property's `building_key`, and tools take `--building`;
  - `offer.js` comments made generic.
- **Playbook `FOCUS.md`:** drawings → `data/buildings/<key>` → stages → takeoff → work items → shopping → cash plan → offer → Handbook, each step naming its tool and its gate.
- **Tests:**
  - SQL: focus_on on an invented listing creates the expected rows, and release restores search mode.
  - Unit: the focus pages render for an invented building; the Forest View archive still renders under `property_compare`.
  - The geometry gate is unchanged.
- **Risk:** medium (the house pages are large, and `house.js` at 493 lines is split here).
- **You'll see:** "we're going for L55" turns the whole site to that house in one step.

### Stage 7: Playbooks and a lean CLAUDE.md (1 session; each stage also updates its own playbook as it lands)
- **`docs/playbooks/`**, each in the same shape (when, ground, steps with SQL/tools, what to write, gates, how to close):

| Playbook | Built from |
|---|---|
| ASSESS-LISTING | road-ahead/ASSESS_PROPERTY + RULES |
| RESEARCH-WAVE (writing the prompt) | new; the private hand-off prompt, made generic, is its template |
| LOAD-RESEARCH | ROUTES "Loading research" |
| CAPTURE (conversation → signals and criteria) | new |
| SIT-DOWN (one shape, two agendas: house review and search calibration) | REVIEW + CALIBRATION |
| PREFERENCES-REVIEW | new |
| BUILD-MODEL-FROM-DRAWINGS | BUILDING-MODEL + SOURCE-FIDELITY + FOREST-VIEW-PLAN §3/§10 |
| TAKEOFF (including reconciling against stock_targets) | DECISIONS + FOREST-VIEW-PLAN §5 |
| SHOPPING-LIST | DECISIONS |
| CORRESPONDENCE (agent, broker, solicitor) | new; the S-89 tone (courteous, guidance-seeking, gives nothing away); every email logged as a source |
| OFFER | OFFER.md, made generic |
| RECORD-SPEND | new; the full invoice → spend_events → close → learning loop |
| FOCUS-SWITCH, ARCHIVE-PROPERTY | RENOVATION-SYSTEM lifecycle |

- **CLAUDE.md:** about 120 lines.
  - What the brain is, the three modes, the non-negotiables (unchanged), the confidence ladder.
  - Session start = `brain_context()`.
  - A table of playbooks, testing gates, and links to ARCHITECTURE and FRONTEND.
- **STATE discipline:** ≤40 lines, mode, in flight and waiting on you; overwritten at every session end (unchanged rule).
- **Tests:** a docs gate (in lint) that every playbook named in CLAUDE.md exists and every file under `docs/playbooks/` is listed.
- **You'll see:** any new session does a task the same way.

### Stage 8: Pages (2–3 sessions; read-only; conversation stays the interface)
- **Search mode:**
  - Brain home (agenda, lead houses, latest verdicts, what changed);
  - Listings (register with fit, value band, money and status filters);
  - Listing detail (verdict and working, facts with sources, comparables by strength, evidence, signals, timeline);
  - Preferences (matrix and history);
  - Money (lenders, affordability, cash);
  - Routes;
  - Sources and evidence browser.
- **Focus mode:** today's House, Roadmap, Backlog, Shopping, Money, Plan, Handbook and Offer, scoped to the focus house.
- The road page splits into Listings and Routes.
- The house switcher becomes a mode indicator plus a candidate switcher.
- **Tests:** the frontend gate's six viewports × two themes on each new page; fixtures from invented data.
- **You'll see:** your phone shows the same picture Claude reasons over.

### Stage 9: Research hand-off (0.5 session; can run any time after Stage 0, ideally after Stage 2 so it loads into the clean model)
- The hand-off prompt is stored privately: a `sources` row plus your copy. It is **not committed**, because it names addresses and lenders.
- A generic template version goes to `docs/playbooks/RESEARCH-WAVE.md`.

### Effort and order
- **Sessions per stage:** S0 0.5 · S1 1 · S2 3–4 · S3 2 + reviews · S4 3 · S5 2 · S6 2 · S7 1 (plus updates in each stage) · S8 2–3 · S9 0.5.
- **Total:** about 17–20 Claude Code sessions.
- **Order:** 0 → 1 → 2 → 3 → 4 → 5, then 6, 7 and 8 in any order. Stage 9 can be sent once Stage 2 lands.
- Lead-house decisions do not wait on this: a Stage 0 to 2 brain already answers "everything about L55".

---

## Open decisions for you (answer one at a time; the plan works on the defaults shown)
1. The **verdict thresholds** (what counts as a good fit or fairly priced). Default: fit ≥75 good, 60–75 possible, <60 poor; price inside p25–p75 is fair.
2. **Criteria weight scale:** 0–10 integers (default) or pairwise ranking.
3. **Routes kept in the brain:** Default:
   - kept: renting near home, the parents' house (P-004), West Country W1–W4 and the forever-home targets;
   - archived: H1–H4 and the Golden Egg auction road.
4. **Out of scope:** recipes, consumables, inventory, assets. Default: leave the tables, hide them from context calls, no removal.
5. Whether **ra_appraisals' 51 old verdicts** are re-scored under the new engine. Default: re-score live listings only; keep the old ones as history.
6. **pgvector embeddings:** default not now; revisit after Stage 5 if search misses things.
7. **The old-name views** are dropped at the end of Stage 3 (default) or kept longer.
8. Whether **P-004 (the parents' house)** stays a property candidate or goes back to being a listing with facts until chosen. Default: listing plus facts, with its modelling kept.

## What I would not change
- Supabase as the only private store and the public repo as code only; RLS on everything; the secrets gate.
- The confidence ladder, the STATED/VERIFIED/ESTIMATE/CHECK labels, `change_log`, and nothing deleted.
- The Rectory kit port and its golden master and checksums: it stays the route engine and the regression guard.
- The zero-build front end, tokens, lint, and the six-viewport frontend gate.
- The building model (stages and variants, the right-handed frame, the drawings decide), takeoff, the derived shopping list, computed priority and allocation, and parity tests where they exist.
- Conversation as the interface; one clickable question at a time; drafted until you confirm.
- The research block format (it already loads nine block types) and the review/sit-down shape.

## Verification (every stage)
- `npm test` (8 gates) green.
- `get_advisors` (security): zero tables without RLS and zero anon-executable SECURITY DEFINER functions.
- The schema fingerprint matches between live and repo.
- `tools/migration-ledger.sql` shows zero lost rows (Stage 2 on).
- Every write is read back. STATE updated. Committed and pushed to `claude/planning-session-el1l9o`.
- End-to-end acceptance after Stage 5: send the lead listing's link → one verdict reply with the working; `brain_about('listing','L55')` returns facts, comps by strength, evidence, signals, decisions, contradictions and events.

---

