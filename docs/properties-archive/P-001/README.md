# ARCHIVED 2026-09-30 - too small, too much work

Closed by the owner after viewing (Road to the Rectory decision G-K09,
27 Sep 2026) and archived on their instruction on 30 Sep 2026. Nothing
was deleted: the property row, its work items, milestones, geometry and
change log all remain, out of every default view. The 49 library rates
and the 65-line template learned on it were promoted when it was loaded,
so they carry to the next house. Restore with
`set_property_status(household, 'P-001', 'candidate', reason)`.

# P-001 - 48 Ameysford Road

Status when archived: **active** - the favourite at the time, a
candidate. No offer made.

Everything in this folder belongs to P-001 and is archived with it (moved
to `docs/properties-archive/`) or purged with it (deleted). The system
rules that apply to every property are in `docs/RENOVATION-SYSTEM.md`.

| What | Where |
|---|---|
| The property record, prices, fit score | `properties` where `ref = 'P-001'` |
| Drawn geometry, stages, variants | `data/buildings/48-ameysford-road/` (`building_key`) |
| Quantities | `property_quantities`, written by `node tools/takeoff.mjs --sql` |
| Roadmap, backlog, shopping list | `work_items` where `property_id` is P-001, plus USER rows |
| Dated plan | `milestones`, `gate_conditions` |
| Open questions | `contradictions`, `work_notes` tagged `review` |
| The handbook | `source_documents` (private, behind RLS) |

## What is known, and how well

- **Built in the 1950s** - confirmed by the owner, 24 Sep 2026. Not
  Victorian. The earlier "solid Victorian imperial brick" fact described
  the brick wanted for the stockpile, not the house.
- **External walls: cavity expected** - drafted. The brick bond on the
  front elevation at the open house (26 Sep 2026) decides it: header
  courses mean solid, all stretchers mean cavity.
  `data/buildings/48-ameysford-road/spec.mjs` carries
  `walls.construction`, and the takeoff orders gypsum or lime from it.

## Open blockers

- **B1** How long has it been empty? 5% VAT on contracted renovation if
  two years or more. Ask the agent.
- **B2** Solid or cavity. See above.
