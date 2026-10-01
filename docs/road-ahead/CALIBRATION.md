# Keeping Road Ahead accurate, and letting it grow

Road Ahead is not finished when it reproduces the kit. It is meant to
get more accurate every time the owner says something new: a change of
circumstances, a property found, a reason for liking or disliking a
house or a road, a figure the maths gets wrong for reasons the maths
cannot see. This file is how that happens, so every session handles it
the same way.

Four rules sit under all of it:

- **Maths and judgement side by side.** A computed figure is never
  overwritten by an opinion. The owner's figure sits beside it, with a
  reason, and the page says what the difference costs.
- **Nothing silent.** A changed figure records old, new, why and source
  (`change_log`). A changed rule or road is a `decision`.
- **Nothing deleted.** A newer judgement supersedes an older one; both
  stay, so how the owner's view moved is part of the record.
- **Drafted stays drafted.** Only the owner's word confirms a figure.

## What the owner says, and where it lands

| The owner says | Claude does | Where it lands |
|---|---|---|
| "My situation has changed" - pay, savings, rent, timing | Changes the variable with its reason; what the owner states is confirmed, dated; re-runs the roads and reports every figure that moved by £1k or more | `ra_variables`, `change_log` |
| "I found a property" | Runs the assessment protocol (`ASSESS_PROPERTY.md`): the hard rules, dated comparables, the kit's method; writes the appraisal with its sources and labels | `ra_listings`, `ra_appraisals` |
| "I like this, or I don't, because ..." (a house or a road) | Records the words as a signal with what they imply, linked to the house or road; where they change a rule, a fit criterion or a road, puts that change to the owner as a clickable question and records the decision | `ra_signals`, `knowledge_links`, `decisions` |
| "I'd pay more for this one, or less, because ..." | Records a judgement beside the maths: the figure or the premium, the reason and its kind - emotional, personal, strategic, or new information | `ra_judgements`; `appraise()` returns it beside the maths |
| "Make the model more accurate" | Runs the calibration agenda and asks about the top inputs one at a time, confirming or correcting each | `ra_variables`, `change_log` |
| "The model needs more detail here" | Grows the model, below | the registry, the engine, the tests, a `decision` |

## Where it lives

All of it is in Supabase, so a session in the chat app can work through
the connector without running any code:

| Call or table | For |
|---|---|
| `select road_ahead_context('<household>')` | Grounding, and the first call of any session: variables, scenarios, roads, rules, current decisions, open contradictions, the register, current judgements, the next dated actions. |
| `select road_ahead_agenda('<household>')` | A sit-down, in the order below. |
| `select ra_assess('<household>', 'L03', 'base')` | One listing's numbers on today's variables. `ra_assess_inputs('<household>', '<json>', 'base')` assesses before a listing row exists. |
| `ra_signals` | The owner's words, and what they imply. |
| `ra_judgements` | The owner's figure beside the maths. Append-only. |
| `ra_variables` | Every figure, with its evidence label, confidence and range. A money figure changes only with `house.change_why` set. |
| `ra_sensitivity` | What each input does to each answer; `ra_calibration_queue` ranks it. |
| `decisions` (domain road) | A changed rule or road, or a change to the model's structure (topic Model). |

A Claude Code session can also run the JavaScript engine on today's
figures: save `select road_ahead_inputs('<household>')` to a file in
`data/road-ahead/` (gitignored) and pass it with `--extract <file>`.

## The owner's judgement beside the maths

A walk-away price from the maths answers "what is the most this house
is worth paying to make the target profit". The owner may know
something it cannot: that this is the house, that the village matters,
that a survey is coming, that a road feels wrong. So a listing can carry
a judgement - a walk-away figure or a premium above the maths - and:

- the computed walk-away, bid limit, profit and verdict are unchanged;
- the judged walk-away and bid limit are shown beside them, with the
  profit left at that price, the profit given up, and the cash left;
- the cash ceiling still binds the bid, because a reason is not cash.
  Raising the ceiling is a change to the ceiling, with its own reason;
- a judgement without a reason is refused;
- a judgement comes back on the agenda when the listing's numbers move
  or it is more than three months old, because a feeling about a house
  is worth checking against what has been learned since.

A judgement is a row, never an edit. The value is a number: the
walk-away itself, or the premium above the maths.

    insert into ra_judgements (household_id, listing_id, field, value, reason, kind, signal_code)
    values ('<household>',
            (select id from ra_listings where household_id = '<household>' and code = 'L03'),
            'premium', '10000', '<the owner''s words>', 'emotional', '<the signal''s code>');

A change of mind is a new row whose `supersedes_id` names the old one;
both stay. `ra_assess` then returns the judgement beside the maths, and
so does the command line:

    node tools/road-ahead.mjs assess listing.json    shows both, and the cost

## The agenda for a sit-down

When the owner says "let's go through it", Claude opens with what is in
front of it rather than a question, in this order:

1. **Dated actions** - auction countdowns, viewings, legal packs.
2. **Contradictions** the model has found, one at a time.
3. **The calibration agenda** - the inputs that move the answer most
   while still being estimates. Each input is swung across its range
   (its own low and high, or 10% either side) and ranked by how far it
   moves any road's forever budget or a live listing's walk-away, with a
   confirmed figure weighted at a tenth. Each input appears once, at its
   largest effect, top eight: five questions that move the answer by
   tens of thousands beat fifty that move it by hundreds.

   The swings come from the engine, so a Claude Code session refreshes
   them whenever the figures change:

       node tools/road-ahead.mjs agenda --extract <inputs file> --snapshot --household <uuid>

   which prints the agenda and writes `data/road-ahead/out/sensitivity-<date>.sql`
   to run through the connector. `road_ahead_agenda` then ranks from the
   latest snapshot.
4. **Judgements to revisit.**
5. **Signals not yet reflected** in a rule, a road or a fit criterion.
6. **What moved since last time** - every road result that shifted by
   £1k or more between accepted runs, and why. A run is accepted with
   the owner's words attached:

       node tools/road-ahead.mjs snapshot --extract <inputs file> --household <uuid> --note "<the owner's words>"

Each answer is written as it is given and read back. Priority is not a
question; nor is any figure the maths derives.

## Growing the model

The model gets finer when a figure is too coarse to be right: works as
one number rather than materials and labour, one sale month rather than
a range, no line for a product fee. Adding detail must not quietly move
what was already agreed. So:

1. **Name what is inaccurate and why**, in the owner's words, as a
   signal.
2. **If it is a value**, change the value with its reason. Done.
3. **If it is structure**:
   1. Add each new key to `assets/js/engine/road-ahead/registry.js`,
      with its unit and meaning, and give it a value that reproduces
      today's behaviour - a split that sums to the old figure, a new
      cost at zero - so nothing the owner has seen moves until the owner
      changes the new value.
   2. Change the engine, with unit tests on invented inputs.
   3. Run `npm test`. The golden master and the checksums must still
      pass: with the neutral value the kit's published figures are
      reproduced exactly, which proves the new detail changed nothing it
      should not. A change meant to correct an old result says so, and
      every figure it moves by £1k or more is explained.
   4. Mirror it in SQL wherever `ra_assess` reads it; the parity gate
      holds the two equal.
   5. Record the model change as a `decision` (domain road, topic
      Model), linked to the signal that prompted it.
   6. Regenerate `docs/road-ahead/VARIABLES.md` with
      `node tools/road-ahead.mjs docs`.
4. **Tell the owner** what changed and what it did to their numbers.

The engine has no defaults, so a new key cannot be forgotten: it is
refused by name until it has a value.
