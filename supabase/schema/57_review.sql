-- ------------------------------------------------------------------
-- 57_review.sql - Scrutinising the list, one row at a time.
--
-- The owner opens a chat and says "I wish to review this". What follows
-- is a conversation driven by clickable yes/no questions, walking the
-- list asking whether a thing is needed, when it belongs, how much
-- effort it is, how much it buys and whether the price is right.
--
-- THE PART THAT NEEDS A SCHEMA. A review over a hundred rows does not
-- finish in one sitting. Without a record of what has already been
-- asked, every session starts at the top of the same list, asks about
-- the same bedding, and never reaches the far end where the unexamined
-- rows actually are. So a review leaves a mark: when it was reviewed
-- and what was said.
--
-- WHAT IS DELIBERATELY NOT HERE. No verdict column, no "approved"
-- flag, no review score typed by hand. A review's findings go into the
-- columns that already exist - status, phase, effort, physical_demand,
-- skill_level, the cost range, cost_confidence - because those are the
-- columns the rest of the system reads. A parallel set of review fields
-- would be a second opinion nothing acts on. The only new facts are
-- WHEN and WHAT WAS SAID.
-- ------------------------------------------------------------------

alter table public.work_items
  add column if not exists reviewed_at timestamptz;
alter table public.work_items
  add column if not exists review_note text;

comment on column public.work_items.reviewed_at is
  'When this row was last put to the owner in a review session. Null means never asked, which is what the review queue sorts on first.';

alter table public.stock_targets
  add column if not exists reviewed_at timestamptz;
alter table public.stock_targets
  add column if not exists review_note text;

create index if not exists work_items_reviewed_idx
  on public.work_items (household_id, reviewed_at nulls first)
  where status not in ('done','dropped');

-- ---------------------------------------------------------------
-- mark_reviewed: close the loop on one row.
--
-- A function rather than an update, for one reason: it writes the note
-- into work_notes as well, so the REASONING survives where the next
-- session will actually read it. A timestamp on its own records that a
-- question was asked and loses the answer.
-- ---------------------------------------------------------------
create or replace function public.mark_reviewed(
  p_work_item_id uuid,
  p_note text default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare v_hh uuid := public.current_household();
begin
  update public.work_items
     set reviewed_at = now(),
         review_note = coalesce(p_note, review_note)
   where id = p_work_item_id and household_id = v_hh;

  if not found then
    raise exception 'no work item % in this household', p_work_item_id;
  end if;

  if p_note is not null and length(btrim(p_note)) > 0 then
    insert into public.work_notes (household_id, work_item_id, kind, body, tags)
    values (v_hh, p_work_item_id, 'decision', p_note, array['review']);
  end if;
end;
$$;

comment on function public.mark_reviewed(uuid, text) is
  'Record that a row was put to the owner, and keep what they said as a work_note so the next session inherits the judgement rather than re-deriving it.';

-- ---------------------------------------------------------------
-- review_queue: what to ask about first.
--
-- A hundred rows is too many to walk in order, and walking them in
-- order means the most examined rows get examined again. So the queue
-- is scored, and the score is built from the three things that make a
-- row worth an owner's attention:
--
--   MONEY AT STAKE. A 600 pound row deserves a question; a 20 pound one
--   can wait. Scaled rather than linear, so one expensive row does not
--   bury forty cheap ones that together cost more.
--
--   HOW LONG SINCE ANYBODY LOOKED. Never asked ranks above asked a year
--   ago, which ranks above asked last week.
--
--   WHETHER THE FIGURE IS TRUSTED. A drafted cost is the whole reason
--   to have the conversation. A confirmed one has already had it.
--
-- Dormant rows are excluded, not deprioritised. Asking whether a digger
-- is worth hiring, in a year with no digging in it, is a question with
-- no useful answer - and it is exactly the kind of question that makes
-- a review feel like a waste of an evening.
--
-- SECURITY INVOKER IS NOT OPTIONAL - see 55_stock.sql.
-- ---------------------------------------------------------------
create or replace view public.review_queue
with (security_invoker = on) as
select
  w.id,
  w.household_id,
  w.title,
  w.summary,
  w.kind,
  w.phase,
  w.acquisition,
  w.status,
  w.horizon,
  w.room_id,
  r.name                                        as room_name,
  w.trade,
  w.theme,
  w.benefit_type,
  w.effort,
  w.physical_demand,
  w.skill_level,
  w.cost_best,
  w.cost_expected,
  w.cost_worst,
  w.cost_confidence,
  w.confidence,
  w.priority,
  w.reviewed_at,
  w.review_note,
  -- Which of the review questions this row cannot answer yet. The list
  -- IS the agenda: a row with four gaps is four questions, and a row
  -- with none only needs its figures confirming.
  array_remove(array[
    case when w.phase            is null then 'phase' end,
    case when w.effort           is null then 'effort' end,
    case when w.benefit_type     is null then 'benefit' end,
    case when w.theme            is null then 'theme' end,
    case when w.cost_expected    is null then 'cost' end,
    case when w.cost_confidence in ('drafted','carried_over','researched')
                                      then 'cost unconfirmed' end,
    case when w.reviewed_at      is null then 'never reviewed' end,
    -- F.11.7: anything that takes the kitchen or bathroom out of service
    -- has to be timed against the lender's valuation visits.
    case when w.habitability_impact then 'habitability' end,
    -- F.11.8: a reduced VAT rate with its deadline inside 90 days.
    case when w.vat_deadline is not null
          and w.vat_deadline <= current_date + 90 then 'vat deadline' end
  ], null)                                      as gaps,
  -- The score. Higher is asked about sooner.
  (
    -- Money, dampened: ln so a four-figure row outranks a two-figure
    -- one without swamping it.
    (ln(1 + coalesce(w.cost_expected, 0)) * 12)
    -- Never reviewed is the strongest single term here, because an
    -- unexamined row is the only kind a review cannot already predict.
    + case when w.reviewed_at is null then 60
           else least(60, extract(epoch from (now() - w.reviewed_at)) / 86400 / 6) end
    -- An unconfirmed figure is the reason the conversation exists.
    + case when w.cost_confidence in ('confirmed','actual') then 0 else 25 end
    -- And something nobody has placed in the project at all.
    + case when w.phase is null then 20 else 0 end
  )::numeric(10,2)                              as review_score
from public.work_items w
left join public.rooms r on r.id = w.room_id
left join public.shopping_list s on s.id = w.id
where w.status not in ('done','dropped')
  and public.in_default_scope(w.household_id, w.property_id)
  -- A purchase nothing needs yet is not a useful question. Non-purchase
  -- work has no demand state and is always in scope.
  and (s.id is null or s.demand_state in ('live','standalone'));

comment on view public.review_queue is
  'What a review session should ask about first: money at stake, how long since anybody looked, and whether the figure is trusted. gaps is the agenda for the row. Dormant purchases are excluded - a question about a digger in a year with no digging has no useful answer.';
