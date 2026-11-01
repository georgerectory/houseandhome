# P-003 - Forest View, Tiptoe Road, Wootton

Status: **active, not bought.** Promoted from Road Ahead listing L45 and
made active on 31 Oct 2026 (RA-05) so the house can be modelled and
costed while the informal tender runs. If the purchase fails it is
archived like P-001 and P-002, and nothing is deleted.

Everything in this folder belongs to P-003. The rules that apply to every
property are in `docs/RENOVATION-SYSTEM.md`; the plan of record is
`docs/FOREST-VIEW-PLAN.md`. **No money figure is written here**: the
purchase, the mortgage, cash and the monthly budget are private and live
in `ra_variables` behind RLS.

| What | Where |
|---|---|
| The property record | `properties` where `ref = 'P-003'` |
| The listing, evidence, signals, comparables | Road Ahead: `ra_listings` L45, `ra_evidence`, `ra_signals`, `ra_comparables` |
| Particulars, photographs, aerials | Private storage `house-private/forest-view/` (RA-06), listed in `source_documents` |
| Drawn geometry, stages, variants | `data/buildings/forest-view/` (`building_key`) |
| Stage registry | `building_stages`, `building_changes` |
| Rooms | `rooms`, written by `node tools/rooms-sql.mjs` from the geometry |
| Quantities | `property_quantities`, written by `node tools/takeoff.mjs --sql` |
| Roadmap, backlog, shopping list | `work_items` where `property_id` is P-003, plus USER rows |
| Open questions | `contradictions`, `work_notes` tagged `review` |

## What is known, and how well

From the agent's particulars (Mitchells, ref NWM260479, 30 Oct 2026),
so `researched` at best until seen:

- Detached four-bedroom, three-reception red-brick forest cottage on about
  a quarter of an acre. Freehold. Council tax band E. EPC to be confirmed.
- 132.3 m2 stated: ground 72.5, first 59.8. The model draws ground about
  72.8 and first about 58.6; the Survey reports the residuals rather than
  absorbing them.
- Mains gas, electricity, water and drainage. Off-road parking.
- Slate roof: a gable with a chimney at the west (sitting-room) end, a hip
  at the east (family-room) end. Glazed front porch. A single-storey store
  and lean-to at the rear.
- Inside the New Forest National Park. Local plan policy DP36 caps
  extensions at 30% over the 1 July 1982 floor area. An overhead line
  crosses the garden: check for a wayleave.
- The agent said on 31 Oct (unconfirmed): no functional kitchen, no
  central heating, possibly some dry rot, no structural issues. The
  photographs show a sink, units, a cooker and radiators, so the services
  may only be switched off.

## Assumed in the model (drafted)

- **Solid 9in brick walls**, so lime plaster on the internal face
  (`walls.construction` in the spec). A window reveal at the viewing
  decides it.
- **Front faces north** (the particulars put the garden to the south).
  A compass at the viewing decides it; every elevation label and the sun
  study follow it.
- Wall thicknesses, ceiling heights, the hall width, the bathroom, store
  and lean-to sizes are scaled or assumed, never measured.

## Open blockers

- **B1** Will a lender accept the house as it stands? (R-10: the tender
  waits on the broker's answer.)
- **B2** What exactly does not work in the kitchen and the heating? It
  picks the day-one case.
- **B3** How far does the dry rot go? A damp and timber report decides
  the treatment band.
- **B4** Orientation, wall thickness, ceiling heights, soil stack
  position: measure at the viewing.
- **B5** Has the house been extended since 1982? It sets the DP36
  headroom (about 40 m2 if not).

## The owner's ideas (modelled as stages)

1. Kitchen and dining room opened into one room.
2. A downstairs WC.
3. A boot room.
4. Best use of the store and lean-to.
5. An en-suite upstairs.

S1 `ground-floor-open` covers 1 to 4; S2a `ensuite-within` and S2b
`rear-two-storey` are the two routes to 5. A boot room at the front by
the porch is recorded as an alternative for the sit-down, not drawn
(owner, 1 Nov 2026).
