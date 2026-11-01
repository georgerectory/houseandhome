-- ------------------------------------------------------------------
-- 86_costs.sql - what the open work costs, read several ways.
--
-- One view, several dimensions, because the owner asks the same money
-- question from different directions: by phase (when), by trade (who),
-- by room (where), and by the tags that carry a design idea, a design
-- stage, a day-one case or a condition (why).
--
-- Every figure here is a SUM OF ROWS. Nothing is typed: each work item's
-- cost comes from priced_lines (rate x quantity), and this view only adds
-- them up. It also says how much of each total rests on figures nobody
-- has confirmed, because a total of drafted figures is a model, not a
-- budget, and the page has to say so beside the number.
--
-- READ IT WITH CARE where rows are alternatives. Design stages S2a and S2b
-- are two ways to the same en-suite, and the day-one cases overlap by
-- construction (each case is a set of the same items). Their dimension
-- totals are meaningful; adding them together is not. The 'phase' and
-- 'trade' totals include every open item, alternatives and all.
--
-- security_invoker: the view runs as the reader, so RLS on work_items
-- and rooms decides what each person sees.
-- ------------------------------------------------------------------
create or replace view public.cost_rollup
with (security_invoker = on) as
with w as (
  select w.id, w.household_id, w.property_id, w.work_phase, w.trade, w.room_id, w.tags,
         w.cost_best, w.cost_expected, w.cost_worst, w.cost_confidence
    from public.work_items w
   where w.status not in ('done', 'dropped')
),
d as (
  select w.*, 'phase'::text as dim, coalesce(w.work_phase, 'unplaced') as key from w
  union all
  select w.*, 'trade', coalesce(w.trade, 'unassigned') from w
  union all
  select w.*, 'room', coalesce(r.key, 'whole-house')
    from w left join public.rooms r on r.id = w.room_id
  union all
  select w.*, split_part(t, ':', 1), split_part(t, ':', 2)
    from w cross join lateral unnest(w.tags) t
   where t ~ '^(stage|idea|case|condition):'
)
select household_id,
       property_id,
       dim,
       key,
       count(*)                                     as items,
       count(cost_expected)                         as items_costed,
       sum(cost_best)                               as cost_low,
       sum(cost_expected)                           as cost_base,
       sum(cost_worst)                              as cost_high,
       coalesce(sum(cost_expected) filter (
         where coalesce(cost_confidence, 'drafted') not in ('confirmed', 'actual')), 0)
                                                    as cost_base_unconfirmed,
       round(coalesce(sum(cost_expected) filter (
         where coalesce(cost_confidence, 'drafted') not in ('confirmed', 'actual')), 0)
         / nullif(sum(cost_expected), 0), 3)        as unconfirmed_share
  from d
 group by household_id, property_id, dim, key;

comment on view public.cost_rollup is
  'Open work cost by phase, trade, room and tag (stage, idea, case, condition), with the share resting on unconfirmed figures. Sums of priced rows only; stage and case totals are alternatives, not addends.';
