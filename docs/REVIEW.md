# Review sessions

Extracted from CLAUDE.md. The owner opens a chat and says "I wish to
review this". That is a defined session shape, not a conversation, and
this file is the whole of it.

The owner opens a chat and says **"I wish to review this"** - the
roadmap, the shopping list, the stockpile, the monthly budget. That is
a defined session shape, not a conversation.

**Ground first, then ask.** `house_context()` now carries `shopping`,
`stockpile` and `review` for exactly this. Open by saying what is in
front of you in two or three lines: how many rows, what they total, how
much of that total is unconfirmed, and what is dormant. Never open with
a question.

**Work `review_queue`, not the table.** A review over a hundred rows
does not finish in one sitting, and a session that starts at the top of
the same list every time asks about the same bedding forever and never
reaches the far end. The queue is scored by money at stake, how long
since anybody looked and whether the figure is trusted, and it EXCLUDES
dormant purchases - a question about a digger in a year with no digging
has no useful answer and is exactly what makes a review feel wasted.
Each row's `gaps` array is its agenda. Work down `review_score`.

**Close each row with `mark_reviewed(id, note)`.** It stamps
`reviewed_at` and keeps the note as a `work_note`, so the row drops down
the queue and the next session inherits the judgement instead of
re-deriving it. A row asked about and not marked will come round again
next month as though nobody ever answered.

**Then walk the list, one row at a time, as CLICKABLE QUESTIONS.** Use
the question tool with two to four concrete options - not free text, and
not a wall of them. One row per question, the row named, its cost and
its current values in the question so the answer can be given without
scrolling back. Batch at most a handful of questions before writing what
has been decided; a review that collects thirty answers and writes at
the end is a review that loses them all when the session ends.

What each answer changes, and it is always a COLUMN, never a score:

| Asked | Writes |
|---|---|
| Needed at all? | `status` - or `dropped` WITH a resolution. |
| When in the project? | `phase`, and `horizon` if it moved. |
| How much reward? | `benefit_type`, and the room's `room_weight` if the room itself is wrong. |
| How much effort? | `effort`, `duration_min_minutes` / `duration_max_minutes`. |
| Manual labour? | `physical_demand`, `two_person_job`. |
| Easy or hard? | `skill_level`, `performed_by`. |
| Expensive or not? | `cost_best` / `cost_expected` / `cost_worst`, and `cost_confidence`. |

**Priority is never one of them.** It is computed from room weight,
theme weight and benefit weight, so a review changes the AXES and then
runs `recompute_priorities(household_id)`. Anybody typing a priority has
misunderstood the system.

**Confirming is the point.** The single most valuable thing a review
produces is `confidence` moving from `drafted` to `confirmed` on figures
the owner has actually checked, because that is what lets a figure drive
an allocation. Ask for it explicitly. Never infer it from enthusiasm.

**Values fluctuate with the project, and the review is where that is
caught.** A digger is high effort and high cost when there is digging
and absent when there is not; a hedge is low cost and high reward in
November and neither in June. If a row's values no longer match what the
project is, the answer is to change them, not to note the discrepancy.

**End by writing, re-reading and saying what changed** - counts, the new
totals, and what is still unconfirmed. Then `docs/STATE.md` and `npm
test` as usual.
