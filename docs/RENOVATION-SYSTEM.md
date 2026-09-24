# The renovation system

One live house. Many drafts. Nothing lost. One house in the end.

This is the system half of Luke's Plan File v6.0 (23 Sep 2026), aligned to
what this repository and its database actually do. The personal half -
income, balances, borrowing, the savings identity's figures - is not
here, because this repository is public. Those figures live in Supabase
behind row-level security, in `accounts`, `income_sources`, `bills`,
`savings_by_regime` and `contradictions`.

Read this when the work touches more than one property, the lifecycle,
the template or the library. For one house's specifics, read
`docs/properties/<ref>/`.

## The caveat, which binds everything else

1. **This is a system, not a property.** 48 Ameysford Road is P-001, the
   first property run through it.
2. **Nothing is committed** until an offer is accepted. Every roadmap,
   budget and date is a draft.
3. **Nothing here is advice.** Qualified professionals answer the
   questions this structures.
4. **Every price is a benchmark, not a quote.** Only a written quote, a
   survey, an invoice or an accepted offer is a fact.
5. **Prices and rules go stale.** Re-validate anything older than six
   months; region-tagged rows are re-validated for another council.
6. **A quantity belongs to one building; a rate carries over.** Never
   apply one property's quantities to another.
7. **The law does not bend for DIY.** Structural, gas, notifiable
   electrics, licensable asbestos and Building Control are not DIY, and
   every pre-2000 building gets an asbestos survey before any strip-out.
8. **Construction waste is never burned at a dwelling.** No permit exists.
   Dry garden waste and untreated timber from your own land only.

## S1 The five scopes

Scope is not a column. It is whether a row has a `property_id`.

| Scope | What | Where it lives |
|---|---|---|
| USER | The household: income, accounts, personal bills, owned kit, preferences | Any table, `property_id` null |
| BRIEF | What a house is being looked for against | A `source_documents` section |
| TEMPLATE | How any house is renovated | `work_item_templates`, `work_phases` |
| LIBRARY | What things cost, where and when | `price_references` (with `package_key`, `region`, `captured_on`) |
| PROPERTY | One building | Any table, `property_id` set |

Housing bills (mortgage, council tax, water, energy, insurance) are
PROPERTY and start on the property's completion date. Switch the active
property and the housing side of `savings_by_regime` recomputes; income
and personal bills do not.

## S2 Carry-over rules

1. Rates carry over; quantities do not.
2. Owned things carry over. Kit is USER; a purge unlinks it
   (`acquired_for_property_id` is SET NULL), never deletes it.
3. Decisions of principle carry over (D1 full strip, D2 derived savings,
   D3 no gym are USER rows in `decisions`); decisions about a building
   (D4 the shell) are PROPERTY.
4. Method learnings become template lines or rules.
5. Region-tagged rates are re-validated, not assumed.

## S3 Lifecycle

`properties.status`: `candidate`, `active`, `committed`, `owned`, `sold`,
`archived`. PURGED is not a status - a purged property has no row.

    candidate <-> active -> committed -> owned -> sold -> archived
        |           |           |
        v           v           v
     archived -(restore)-> candidate

- Exactly one property is active, committed or owned at a time - one
  partial unique index enforces it.
- Making a property active demotes the previous one to candidate, never
  straight to archived.
- A committed purchase that falls through returns to active or archived
  on the owner's instruction only.

## S4 What "the house" means

| Said | Means |
|---|---|
| the house, the project, the roadmap, the budget, the shopping list | The active (or committed, or owned) property |
| a property named by address or ref | That property, whatever its status - except purged |
| my bills, my savings, my tools | USER |
| what we are looking for | BRIEF |
| what does X usually cost | LIBRARY |
| across the houses, on average | COMPARE - `property_compare`, the only read of archived properties |

If a message could mean the active property or a candidate under
discussion, ask once.

## S5 Commands

All are SQL functions, run by Claude through the connector. None is
granted to `anon` or `authenticated`; the site has no button that
changes anything.

| Command | Function |
|---|---|
| NEW PROPERTY | `new_property(household, name, address, postcode, council, region)` - a candidate, next P-number, template cloned with every cost NULL. Never changes the active property. |
| MAKE ACTIVE | `make_active(household, ref)` - demote, then promote, in one call. |
| COMMIT, ARCHIVE, RESTORE, SOLD | `set_property_status(household, ref, status, reason)` - the graph above is enforced; a reason is required. |
| PURGE | `purge_property(household, ref, typed_address)` - see below. |
| FINALISE | `finalise_property(household, ref)` lists what would be purged; `finalise_property(household, ref, true)` completes the purchase and purges every other property. |
| COMPARE | `select * from property_compare` |

Before ARCHIVE or PURGE, promote: any rate learned on the property goes
to `price_references` (tagged `researched_during_property_id`), any
method to `work_item_templates`.

### PURGE, the one deliberate delete

CLAUDE.md rule 3 says nothing is deleted. `purge_property()` is the named
exception. It:

- refuses the active, committed or owned property;
- refuses unless the typed address matches;
- refuses if any savings have been allocated against its work;
- moves any stockpile with hauls to USER scope (collected material is
  the household's);
- deletes every link, note, quote, invoice and change-log row touching
  its rows, then the property, and lets the foreign keys cascade;
- unlinks library rates and kit rather than deleting them;
- redacts its ref and name wherever a surviving row wrote them.

What a purge does not reach, and cannot: git history, Supabase backups
and point-in-time recovery for their retention window, and past chats.
Any AI that finds a purged property in one of those treats it as
off-limits.

## S7 Learning flows upward

    Anything learned on a property
     - is it a rate?                     -> price_references (region, date, source)
     - is it a method or rule?           -> work_item_templates
     - is it a field we do not capture?  -> the template, the intake checklist, the schema
     - is it a fact about this building? -> stays PROPERTY

Nothing is promoted to fact by being written down: every row carries a
`confidence`, and only the owner's word or an observation moves it.

## S8 Database architecture, as built

| Plan asked for | Built as |
|---|---|
| `properties` with lifecycle | `properties` extended: `ref`, lifecycle `status`, prices, council, region, `building_key`, `fit_score` |
| `scope` column everywhere | Derived: `property_id` null or set. `in_default_scope()` is the one filter every default view uses. |
| `rate_library` | `price_references` extended with `package_key`, `region`, `vat_status`, `supersedes`, provenance |
| `property_quantities` | Written only by `node tools/takeoff.mjs --sql`; never typed |
| `owned_assets` | `assets` and `inventory_items` with `acquired_for_property_id`, `residual_value`, `disposed_on` |
| `savings_regimes` table | A view, `savings_by_regime`, derived from dated `bills` and `income_sources`. Savings is never stored. |
| `monthly_actuals` | A table, with `savings_actuals` computing 3-month, 12-month and median averages and a drift flag |
| `vat_treatment` table | A view over `work_items.vat_rate` and `vat_deadline` |
| `contradictions`, `gate_conditions`, `income_lines`, `salvage_items` | Tables, RLS in the same change |
| evidence class + confidence | The existing ladder: carried_over (LEGACY), drafted (HANDBOOK or estimate), researched (dated source), quoted, confirmed (owner), actual (observed). Unresearched means NULL. |
| OLD -> NEW -> WHY -> SOURCE | `change_log`, written by trigger. A money column cannot change unless `house.change_why` is set. |
| Delete merged and removed rows | `status = 'dropped'` with a resolution naming what it merged into |

## F.11 Validation rules, as enforced

| Rule | Enforcement |
|---|---|
| .1 No double-counting | Trigger: a costed child under a costed parent is refused unless the parent is `costs_components_separately` |
| .3 Allocation by funding stream | `v_funding_queue` reads `funding_stream = 'pot'` and the default scope only; `run_deposit_allocation` refuses with no confirmed contribution |
| .4 Evidence promotion | `researched` requires `cost_source` and `cost_source_date`; `quoted` requires a received quote row |
| .6 Two dates | A purchase with `execute_on` needs `procure_by` |
| .7 Habitability | `habitability_impact` rows are a `review_queue` gap |
| .8 VAT deadline | A `review_queue` gap within 90 days |
| .9 Nothing confirmed by default | New rows are `drafted` |
| .10 One live property | Partial unique index |
| .11 No cross-scope writes | Structural: scope is `property_id` |

## Template and library

**The six-stage roadmap:** Win it, Move in, Do up, Remortgage (the
decision gate), Extend, Sell. Stages are `work_items.phase` buckets and
dated `milestones`; gate conditions are `gate_conditions` rows. Two
outcomes are always modelled: build then sell, and sell with consent.

**Work phases P0-P29** (`work_phases`) are categories, not an order: P18
planning starts in month one.

**The core sequencing rule:** safety, water, structure, services,
thermal, surfaces, fit-out, cosmetics. Do not decorate what will be
demolished, plaster what will be rewired, floor under dirty work, or
close a wall until it is measurably dry.

**Quantity drivers:** each package has a driver the building supplies
(through the takeoff) and a rate the library supplies. `priced_lines`
multiplies them, prefers a rate from the property's own region, and flags
a region mismatch.

**The intake checklist (V4)** is fourteen template lines, A to N. Cottage
and rural lines (V3) carry `triggered_by` and are cloned only when the
intake finds the trigger.

## S12 The end state

After FINALISE: one property, owned, tracked against quotes and invoices;
USER, TEMPLATE and LIBRARY unchanged and improved; every other property
purged. When the owned house is sold, its actuals are promoted to the
library as the best evidence the system will ever hold.
