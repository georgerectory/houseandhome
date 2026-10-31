# Forest View: from the chat to the house system

*Plan of record, 31 October 2026 (decisions RA-05 to RA-07 made the same day). Goes in the repo as `docs/FOREST-VIEW-PLAN.md`.*
*Owner: the homeowner. Builders: Claude (chat) for data and decisions, Claude Code for the repo.*

**Goal.** Everything learned about Forest View (purchase, mortgage, condition, drawings,
ideas and costs) lives in one place, the house system (`georgerectory/houseandhome` and its
Supabase project). From that one place come: a live site, a full 3D model before and
after renovation, bird's-eye views, maps and plans, costed development options, and one
handbook PDF that always opens. It's the same machinery that produced the 48 Ameysford
Road handbook and the Rectory Kit.

---

## 0. Why this fortnight went wrong, and the rules that fix it

| What went wrong | Cause | Rule from now on |
|---|---|---|
| PDFs that wouldn't open | Built ad hoc in a chat sandbox, delivered through the app's viewer, rebuilt dozens of times | **One renderer.** The PDF is printed from the site's Handbook page (print stylesheet), opened from a link in Safari, never from a chat attachment |
| Documents moved, renamed, lost | Each chat turn re-versioned files (Pack v1.5 to v2.9) in a sandbox that resets | **Generated, never assembled.** Every document is regenerated from the data by repo code. Fixed names, no version in the filename |
| Facts forgotten or contradicted | Facts lived in PDFs, chat and the database at once | **One source of truth.** Data in Supabase, geometry and code in the repo. The chat writes rows; it never ships a document of record |
| Re-explaining the house each time | No single brief a new session reads first | **One central chat** (a Claude Project) whose instructions point at `CLAUDE.md`, `docs/STATE.md` and this plan |
| Private material at risk | The repo is public | **Public repo, private data.** Geometry and code in git; agent photos, the floor-plan image, finances and evidence in Supabase (row-level security, private storage) |

---

## 1. What already exists

**In Supabase (house system project).** Road Ahead holds Forest View as listing **L45**:
evidence E49-E70, judgements (mortgageability, finished value), signals to S-84,
contradictions, comparables, scheduled events, and every money variable (the decision in principle, the tender figure, cash at
completion, the planned budget - private, read from `ra_variables`, never written here). The
renovation library is already rich:

| Library | Rows | Relevant to Forest View |
|---|---|---|
| `work_item_templates` | 65 | Intake A-N protocol, damp and timber survey, heating first fix, rewire, replaster, repoint, building control, scaffolding, skips |
| `price_references` | 49 | Cloakroom WC, small en-suite, load-bearing opening with steel, steel beam, structural engineer, kitchens (budget, mid), full gas central heating, rewire, lime plaster, family bathroom, two-storey extension shell, windows |
| `work_phases` / `milestones` / `trades` / `themes` / `palettes` | 30 / 18 / 16 / 11 / 17 | Carry over unchanged |
| **Gaps** | - | Dry rot treatment; lean-to and store rebuild (single-storey rear range); boot room fit-out; service reconnection (water, gas meter, electrics); combi boiler on existing radiators; National Park planning fee |

**In the repo.** The building engine (`data/buildings/<id>/spec.mjs` to
`tools/build-building.mjs`: stages, variants, `stageDiff()`), the House page (Plan, 3D,
Walk, Survey), `tools/takeoff.mjs` (quantities), `tools/ingest-document.mjs`, Handbook,
Plan, Roadmap, Backlog and Money pages, and the property lifecycle
(`ra_promote_listing` then `make_active()`).

**In this chat (to migrate, then retire).**

| Chat artefact | Destination |
|---|---|
| Derived set-out (walls, rooms, residuals) | `data/buildings/forest-view/spec.mjs` + `sources/README.md` |
| Room schedule and quantities | Recomputed by `takeoff.mjs` into `property_quantities` (never typed) |
| Cost plan, day-one enablement cases (£4,150 / £8,250 / £14,300) | `work_items` priced by `price_references` |
| Purchase, DIP, offer, budget | Already in `ra_variables`; shown on Money and Road Ahead |
| Agent intel, particulars, research | Already in `ra_evidence` and `ra_judgements` |
| Photos, floor plan, particulars screenshots | Private storage bucket, referenced by key (never committed) |
| Pack v2.9, strategy, money check, call and viewing sheets | `source_documents` + `document_sections` via `ingest-document.mjs`, for reference only, then superseded by the Handbook |
| Broker form, brief, DIP certificate | Private storage; listed in `source_documents` |

---

## 2. The end state (definition of done)

1. **Site.** A Forest View property with:
   - **House**: Plan, 3D, Walk and Survey for every stage;
   - **Plan / Roadmap**: works by phase, room, trade and option, costed low, typical and high;
   - **Money**: purchase, monthly budget, savings pots against the roadmap;
   - **Handbook**: the unified document.
2. **3D.** As-bought plus each design stage, with an `empty` and a `lived-in` variant;
   named viewpoints for each elevation, plus four bird's-eye corners and a top-down view;
   the plot, parking, garden zones and the overhead line.
3. **Maps and plans.** Location and plot maps; existing and proposed floor plans to
   scale; elevations; a site plan; the sun path.
4. **The PDF.** "Forest View Handbook", printed from the Handbook page, opened from a link.
5. **The central chat.** One Claude Project, "Forest View", that every conversation about
   the house happens in.

---

## 3. The building model

**Set-out.** The plan below is already derived from the agent's printed room sizes;
Claude Code re-derives it in the repo's frame. Plan space: x west to east, y north to
south, metres, origin at the outer north-west corner.

| Item | Value | Basis |
|---|---|---|
| Main block, outside | 9.91 × 7.10 m | Room sizes + walls (0.30 external, 0.10 internal, assumed) |
| Front rooms | Family 3.66 × 3.66; Sitting 3.67 × 3.66 | Printed |
| Hall | 1.78 wide (scaled) | Scaled off the plan |
| Rear rooms | Dining 4.64 × 2.74 (max); Kitchen 4.45 × 2.74 | Printed |
| First floor | Bed 1 3.67 × 3.66; Bed 2 3.66 × 3.66; Bed 3 3.66 × 2.74; Bed 4 3.67 × 2.74 (L-shaped); Landing; Bathroom about 2.4 × 1.5 | Printed / scaled |
| Rear range | Store about 2.85 × 2.35; Lean-to about 2.55 × 2.35 | Scaled |
| Porch | About 1.9 × 1.45 | Scaled |
| Roof | Slate; gable with chimney at the sitting-room end; hip at the family-room end; pitch about 40° | Photos |
| Residuals to report, not absorb | Rear width +0.12 m; ground floor +0.3 m² vs 72.5; first floor -1.2 m² vs 59.8 | Survey view |
| Orientation | The particulars say the rear garden faces south; **verify with a compass at the viewing** | The frame must be right-handed |

**Stages.** Each is a fork with its own geometry; `stageDiff()` measures the changes.

| Stage | What changes | Planning route (to confirm with NFNPA) |
|---|---|---|
| **S0 as-bought** | The house as drawn | - |
| **S1 ground floor** | Kitchen and dining opened into one room (steel beam); rear range rebuilt as boot room, downstairs WC and utility; store becomes workshop or utility | Internal: building control. Rear range: replacement on the same footprint, so check whether it's permitted development on National Park land |
| **S2a en-suite, within the footprint** | Part of bedroom 4 becomes an en-suite to bedroom 1, through their shared wall, next to the bathroom's drainage | Building control only |
| **S2b en-suite, over the store** | Two-storey rear addition about 2.9 × 2.4 m, en-suite above | Planning permission; counts towards the DP36 30% limit (about 40 m² headroom if the house is unchanged since 1982) |

**Variants per stage:** `empty`, `as-drawn` (S0 only, with the agent's furniture),
`lived-in`.

---

## 4. The development ideas: design study

| Idea | Options to model | Key constraints | Library price | Gap to research |
|---|---|---|---|---|
| **Kitchen and dining into one room** (about 9.3 × 2.74 m, 25.5 m²) | A: full opening; B: wide arch keeping a nib | Likely load-bearing (bedroom joists above): engineer, steel, padstones, building control | Load-bearing opening with steel; steel beam; structural engineer; kitchens budget and mid | - |
| **Downstairs WC** | A: in the rebuilt rear range by the kitchen (shortest drain run); B: under the stairs (check headroom and ventilation) | Drainage to the existing rear stack; extract fan | Cloakroom WC | - |
| **Boot room** | A: rear range by the back door (bench, coats, boots, dog wash); B: within the lean-to as is | Insulation and heating if habitable; door position | - | Boot room fit-out; lean-to rebuild £/m² |
| **Store and lean-to** | A: rebuild as one single-storey range (boot room + WC + utility); B: keep the store, rebuild the lean-to only; C: two-storey over the store (pairs with S2b) | Possible asbestos in old roof sheeting (survey first); National Park materials | Asbestos survey and removal; foundations (trench-fill) | Single-storey rebuild £/m² |
| **Upstairs en-suite** | A: from bedroom 4 (shared wall with bedroom 1, next to the bathroom); B: corner of bedroom 1; C: over the store (S2b) | Bedroom 4 shrinks to a study or single; extraction; soil-stack position (find it at the viewing) | Small en-suite, shower only | - |
| **Whole-house restoration** (standing scope) | Back to brick; lime plaster on solid brick; rewire; replumb; heating; windows | Dry rot found first; services reconnected; damp-proofing that suits solid brick | Rewire; full gas central heating; lime plaster; windows | Dry rot treatment; reconnection costs |

---

## 5. Quantities and costs

**The pipeline.**
1. `spec.mjs` is built by `build-building.mjs` into stage JSON.
2. `takeoff.mjs` turns that into wall, floor and ceiling areas, opening counts and perimeters.
3. Those land in `property_quantities`, marked drafted (they price nothing on their own).
4. `work_item_templates` × rooms × phases become `work_items`, priced from `price_references` (low, typical, high).
5. The roll-ups run by phase, room, trade, stage change and idea.

**Fill the gaps first.** Add six dated, sourced, region-tagged price references: dry rot
treatment (localised, per room, widespread), service reconnection, combi boiler on
existing radiators, single-storey rear rebuild per m², boot room fit-out, and the
National Park planning fee.

**Outputs, on the site and in the PDF.**
- Cost by phase, by room, by idea, by stage (S0 to S1 to S2a/S2b).
- **Day one**: making it liveable, three cases, linked to Tom's answer on services.
- **Cash over time.** Savings pots from the planned budget (the monthly spare and any
  discretionary bonus, read from `ra_variables`) against the roadmap. This shows when each idea is
  affordable, not just what it costs.

---

## 6. Money

It's all in `ra_variables` already, so the site reads it, behind sign-in, rather than
retyping. **No figure from this section is written in the repository**, which is public:
- the decision in principle (loan, term, LTV);
- the tender offer and the formula behind it;
- cash now, cash at completion, and what is left after it;
- the planned monthly budget against take-home pay;
- the alternative purchase, as a comparison.

The Money page shows purchase, monthly position, pots, and when each phase is funded.

---

## 7. Maps, aerials and bird's-eye views

- **Location map:** OpenStreetMap tiles with attribution: Wootton, New Milton, the
  forest edge and the station.
- **Plot:** a schematic now (about 31 × 33 m); replaced by the HM Land Registry title plan
  (£7) once bought. Parking, garden zones, overhead line, trees and the sun path go on it.
- **Agent aerials and photos:** private storage only (they're Mitchells' copyright). They
  display for signed-in users and are never committed.
- **Bird's-eye:** 3D camera presets (NE, NW, SE, SW, top-down) for each stage, captured as
  images for the Handbook print.

---

## 8. The unified PDF: Forest View Handbook

**How it's made.** The Handbook page gets a print stylesheet. To make the PDF, open the
page in Safari, then Share → Print → Save as PDF. It's one renderer, the same as the
screen, and it works on an iPhone every time. An optional second route can follow later:
a scheduled job that saves it to a private storage bucket and shows a signed link.

**Sections:**
1. Summary and decisions
2. Purchase: DIP, broker, tender, offer, timeline
3. Money: completion day, monthly budget, pots
4. The house: facts, maps, plot, photos (private), comparables and value
5. Drawings: existing plans, elevations, site plan, 3D and bird's-eye views
6. Condition register: dry rot, services, roof, damp
7. Ideas and stages: S1, S2a and S2b with diffs
8. Costs by phase, room and idea, with cash-over-time
9. Roadmap: phases and milestones
10. Evidence, sources and residuals

**Gates before it counts as done:**
- it renders in Safari and in pdf.js;
- it's under 10 MB;
- every figure traces to a row or a source;
- no private data reaches the public repo (`check-secrets.mjs`).

---

## 9. The central chat

**Set-up.** Create a Claude Project called **Forest View**:
- **Instructions**: the five rules in section 0, plus "read `docs/STATE.md` and this plan
  first; write facts to Supabase as you go; never re-version a document; ask before
  changing a decided figure".
- **Knowledge**: `CLAUDE.md`, `docs/STATE.md`, this plan, `docs/road-ahead/ASSESS_PROPERTY.md`.
- **Connectors**: Supabase.
- **Repo work**: goes to Claude Code with a brief like the one alongside this plan.

**The working loop:**
1. The chat decides and writes rows.
2. Claude Code changes geometry and pages.
3. The site renders the result.
4. The Handbook prints from the site.

---

## 10. Phases

| # | Phase | Who | Output | Done when |
|---|---|---|---|---|
| 0 | **Freeze and register** (today) | Chat | Chat artefacts listed in `source_documents`; files to private storage; three decisions (section 12) | Nothing of record lives only in the chat |
| 1 | **Promote and draw S0** | Claude Code | L45 to property P-003 Forest View; `data/buildings/forest-view` S0 (walls, rooms, openings, stairs); sources README | Geometry gate passes; Survey shows the residuals above |
| 2 | **Roof, plot, 3D, maps** | Claude Code | Hip and gable roof, chimney, porch, rear range; plot schematic; bird's-eye presets; location map | 3D matches the photos from all four corners; compass correct |
| 3 | **Design stages** | Chat → Claude Code | S1, S2a, S2b with variants; `building_changes` rows; `stageDiff()` quantities | Diffs agree with the narrative (no "adds a WC" without a WC) |
| 4 | **Costs** | Chat | Six new price references; `work_items` per stage, room and phase; condition register from the viewing | Roll-ups reconcile; day-one cases tie to services |
| 5 | **Handbook and Money** | Claude Code | Forest View sections on Handbook, Plan, Roadmap, Money; print stylesheet | PDF opens in Safari; gates pass |
| 6 | **Sit-down and iterate** | Owner + chat | Decisions recorded; options ranked | Each idea has a chosen option, cost and phase |

The purchase stays first: the broker, the viewing and the tender take priority. Phases 1-3
can run alongside, because they only need the agent's drawings.

---

## 11. Quality gates

- **Geometry gate** (`check-geometry.mjs`) and the model3d tests: right-handed frame,
  compass.
- **Source fidelity** (`docs/SOURCE-FIDELITY.md`): every dimension carries its source;
  residuals are shown, never absorbed.
- **Takeoff parity:** areas from the model match the agent's totals within the stated
  residuals.
- **Costs:** every work item has a price reference with a date and a source; no typed
  totals.
- **Privacy:** `check-secrets.mjs`; no photos, statements or figures in git.
- **PDF:** opens in Safari and pdf.js; under 10 MB; generated, never hand-edited.

---

## 12. Decisions (made 31 October 2026)

| Code | Decision |
|---|---|
| **RA-05** | Forest View is the **active property now**, before purchase: promoted from L45 as **P-003** (freehold, 132.3 m²) |
| **RA-06** | Photos, floor plan and documents live in **private storage only**: Supabase bucket `house-private`, never the repo |
| **RA-07** | The Handbook PDF is **printed from the Handbook page in Safari**; documents are generated from data, never assembled in chat |
| **R-10** | Supersedes R-09: win Forest View first, no promotion. Tender on the 31 Oct decision in principle, only once the broker confirms a lender will accept the house; an alternative family purchase before Christmas is the fallback (figures in Supabase) |

**Phase 0 status:** done in the database (property, decisions, bucket, documents registered).
Still to do by hand: upload the private files (see the brief) and commit this plan to the repo.
