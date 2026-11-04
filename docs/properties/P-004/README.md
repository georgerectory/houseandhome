# P-004: the parents' house (candidate)

Added 4 Nov 2026 as a **candidate** alongside the active house, P-003
Forest View. It is the owner's family home and a possible purchase from
the owner's parents, held as a no-renovation flip over 18 to 24 months
(S-61, S-97). Decision R-18: model it on a 2-year fix or a portable
mortgage, so a sale inside the fix does not pay early repayment charges.

**Private.** The address, the listing, every price, offer and valuation,
the family terms and the photographs live in Supabase only (RA-06). This
file holds none of them.

## How it is kept apart from Forest View

- Its rows carry its own `property_id`; the site's house switcher shows
  it on its own, and the derived views computed for the active house are
  emptied while it is in view (`assets/js/core/property-choice.js`).
- Forest View's offer figures are tied to P-003 by `offer.property_ref`
  and never shown here. This house gets its own offer model when its
  figures arrive.
- No drawings yet: `building_key` is null until the floor plan is
  supplied and drawn under `data/buildings/`.

## What comes next

1. The owner runs the extraction prompt in the claude.ai chats about this
   house and pastes the results; each fact lands with its label (STATED,
   VERIFIED, ESTIMATE, CHECK).
2. The listing text and floor plan: the model is drawn from the plan.
3. The deep dive: comparables, a valuation and a resale price that is
   evidenced; the family-sale savings and the agent's contract; gifted
   equity and what lenders accept; early repayment charges; first-time
   buyer status lost for the next purchase; and the whole flip's net
   against Forest View and against waiting.
