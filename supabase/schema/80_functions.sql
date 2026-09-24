-- ------------------------------------------------------------------
-- 80_functions.sql - The logic. Priority, allocation, context.
--
-- Everything here is SECURITY INVOKER unless it has a stated reason not
-- to be, and every function pins search_path. RLS therefore applies
-- normally: a function cannot be used as a way around a policy.
-- ------------------------------------------------------------------

-- ---------------------------------------------------------------
-- allocation_settings: the two numbers that shape the funding curve,
-- as a row rather than constants, so the curve can be tuned without a
-- deploy and a historic run can be explained by its snapshot.
--
--   decay        geometric falloff per rank. 0.85 means each item gets
--                85% of the share of the one above it. Lower = more
--                concentrated on the top of the list; higher = flatter.
--   floor_share  the fraction of every deposit distributed EQUALLY
--                across all open items regardless of rank. This is what
--                guarantees the "nothing starves" rule mathematically
--                rather than by hoping a geometric tail stays non-zero:
--                with floor_share 0.10 and 100 open items, the bottom
--                item still receives 0.1% of every deposit.
--
-- The weight of item at rank r out of n is:
--     (1 - floor_share) * decay^(r-1) / sum(decay^(i-1) for i in 1..n)
--   + floor_share / n
--
-- which always sums to exactly 1 and is always strictly positive.
-- ---------------------------------------------------------------
create table if not exists public.allocation_settings (
  household_id uuid primary key references public.households (id) on delete cascade,
  decay        numeric(4,3) not null default 0.850 check (decay > 0 and decay < 1),
  floor_share  numeric(4,3) not null default 0.100 check (floor_share >= 0 and floor_share < 1),
  updated_at   timestamptz not null default now()
);

drop trigger if exists allocation_settings_updated_at on public.allocation_settings;
create trigger allocation_settings_updated_at before update on public.allocation_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Priority
--
-- score = room_weight * theme_weight * benefit_weight   (1..125)
--       + 5 * (number of open items this one must precede)
--       + decay_pressure (preservation work grows more urgent with age)
--       - 25 if the item is itself blocked by open work
--
-- The multiplicative core is deliberate: a cosmetic job in the most
-- important room should not outrank a make-safe job in the least
-- important one, and addition would let it. Multiplying means a low
-- score on any axis holds the whole item down.
--
-- The blocked penalty is a subtraction rather than an exclusion so a
-- blocked item stays visible and stays funded - it will be started
-- eventually, and saving toward it in the meantime is correct.
-- ---------------------------------------------------------------
create or replace function public.recompute_priorities(p_household_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  with scored as (
    select w.id,
           coalesce(r.room_weight, 3)       as rw,
           coalesce(t.theme_weight, 3)      as tw,
           coalesce(b.benefit_weight, 3)    as bw,
           (select count(*) from public.knowledge_links l
             join public.work_items w2 on w2.id = l.to_id
            where l.valid_to is null
              and l.kind in ('must_precede','blocks')
              and l.from_type = 'work_item' and l.from_id = w.id
              and l.to_type = 'work_item'
              and w2.status not in ('done','dropped'))          as unblocks,
           (select count(*) from public.knowledge_links l
             join public.work_items w3 on w3.id = l.from_id
            where l.valid_to is null
              and l.kind in ('must_precede','blocks')
              and l.to_type = 'work_item' and l.to_id = w.id
              and l.from_type = 'work_item'
              and w3.status not in ('done','dropped'))          as blocked_by,
           case when w.benefit_type = 'preservation'
                then least(25, (extract(epoch from (now() - w.created_at)) / 86400 / 30)::int * 2)
                else 0 end                                      as decay_pressure
      from public.work_items w
      left join public.rooms r         on r.id = w.room_id
      left join public.themes t        on t.key = w.theme
      left join public.benefit_types b on b.key = w.benefit_type
     where w.household_id = p_household_id
       and w.status not in ('done','dropped')
  ),
  computed as (
    select id,
           greatest(1,
             (rw * tw * bw) + (5 * unblocks) + decay_pressure - (case when blocked_by > 0 then 25 else 0 end)
           ) as score,
           jsonb_build_object(
             'room_weight', rw, 'theme_weight', tw, 'benefit_weight', bw,
             'base', rw * tw * bw,
             'unblocks', unblocks, 'unblocks_bonus', 5 * unblocks,
             'decay_pressure', decay_pressure,
             'blocked_by', blocked_by,
             'blocked_penalty', case when blocked_by > 0 then -25 else 0 end
           ) as explain
      from scored
  ),
  ranked as (
    select id, score, explain,
           row_number() over (order by score desc, id) as rnk
      from computed
  )
  update public.work_items w
     set priority_score = k.score,
         priority = coalesce(w.priority_override, k.rnk::int),
         priority_explain = k.explain
    from ranked k
   where w.id = k.id;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------
-- The funding queue: which items compete for money, in rank order.
-- An item qualifies when it is open, fundable, and has a cost to aim
-- at. cost_expected falls back to the midpoint of the range, because an
-- item with a range but no agreed figure should still be saved for.
-- ---------------------------------------------------------------
create or replace view public.v_funding_queue with (security_invoker = on) as
  select w.id, w.household_id, w.title, w.kind, w.room_id, w.trade,
         w.priority, w.priority_score,
         coalesce(w.cost_expected, (w.cost_best + w.cost_worst) / 2.0,
                  w.cost_best, w.cost_worst) as target_cost,
         w.allocated_balance,
         greatest(0, coalesce(w.cost_expected, (w.cost_best + w.cost_worst) / 2.0,
                  w.cost_best, w.cost_worst) - w.allocated_balance) as remaining,
         w.cost_confidence,
         w.fully_funded_at is not null as is_funded
    from public.work_items w
   -- F.11.3: only the pot competes for deposits. Borrowing-funded work
   -- is a drawdown, and a candidate house's jobs are nobody's to fund.
   where w.funding_stream = 'pot'
     and public.in_default_scope(w.household_id, w.property_id)
     and w.status not in ('done','dropped')
     -- Something to aim at. A zero-cost row (a standing rule, a phone
     -- call) has nothing to save for and must not take a share.
     and coalesce(w.cost_expected, w.cost_best, w.cost_worst) > 0;

-- ---------------------------------------------------------------
-- allocation_preview: what the next deposit of p_amount would do.
-- Pure read - writes nothing - so the front end and the assistant can
-- both show the effect of a contribution before it is made.
--
-- Settlement is done in integer micro-pounds using the largest-
-- remainder method, so the allocated amounts sum to the deposit EXACTLY
-- with no drift, and every item still receives a strictly positive
-- amount.
-- ---------------------------------------------------------------
create or replace function public.allocation_preview(
  p_household_id uuid,
  p_amount numeric
)
returns table (
  work_item_id uuid,
  title text,
  rank integer,
  weight numeric,
  amount numeric,
  target_cost numeric,
  balance_after numeric,
  funded_after boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with settings as (
    select coalesce(s.decay, 0.850) as decay,
           coalesce(s.floor_share, 0.100) as floor_share
      from (select 1) one
      left join public.allocation_settings s on s.household_id = p_household_id
  ),
  queue as (
    select q.id, q.title, q.target_cost, q.allocated_balance,
           row_number() over (order by q.priority, q.id) as rnk,
           count(*) over () as n
      from public.v_funding_queue q
     where q.household_id = p_household_id
       and not q.is_funded
  ),
  weighted as (
    select q.*, s.decay, s.floor_share,
           -- Geometric share by rank, plus an equal floor share so the
           -- bottom of the list can never reach zero.
           ((1 - s.floor_share)
              * power(s.decay, q.rnk - 1)
              / ((1 - power(s.decay, q.n)) / (1 - s.decay)))
           + (s.floor_share / q.n) as wt
      from queue q cross join settings s
  ),
  micro as (
    select w.*,
           round(p_amount * 1000000)::bigint as total_micro,
           floor(w.wt * round(p_amount * 1000000)::bigint)::bigint as base_micro,
           (w.wt * round(p_amount * 1000000)::bigint)
             - floor(w.wt * round(p_amount * 1000000)::bigint) as frac
      from weighted w
  ),
  settled as (
    -- Largest-remainder settlement: the leftover micro-pounds go to the
    -- rows with the largest fractional part, so the allocated amounts
    -- sum to the deposit EXACTLY rather than drifting by rounding.
    select m.*,
           row_number() over (order by m.frac desc, m.rnk) as frac_rank,
           m.total_micro - sum(m.base_micro) over () as leftover
      from micro m
  )
  select s.id,
         s.title,
         s.rnk::int,
         round(s.wt, 10),
         round((s.base_micro + case when s.frac_rank <= s.leftover then 1 else 0 end) / 1000000.0, 6),
         s.target_cost,
         round(s.allocated_balance
               + (s.base_micro + case when s.frac_rank <= s.leftover then 1 else 0 end) / 1000000.0, 6),
         s.target_cost is not null
           and s.allocated_balance
               + (s.base_micro + case when s.frac_rank <= s.leftover then 1 else 0 end) / 1000000.0
               >= s.target_cost
    from settled s
   where p_amount is not null and p_amount > 0
   order by s.rnk;
$$;

-- ---------------------------------------------------------------
-- run_deposit_allocation: the authoritative write.
--
-- Refuses to run against an unconfirmed contribution figure. That
-- refusal is the point: this system inherits a body of stale numbers,
-- and moving real money on the strength of one would be the single
-- worst failure it could have. An explicit confirmed figure is cheap;
-- a wrong one compounds every month.
-- ---------------------------------------------------------------
create or replace function public.run_deposit_allocation(p_deposit_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_hh uuid;
  v_amount numeric;
  v_done timestamptz;
  v_conf text;
  v_contribution numeric;
  n integer := 0;
begin
  select d.household_id, d.amount, d.allocated_at
    into v_hh, v_amount, v_done
    from public.deposits d where d.id = p_deposit_id;

  if v_hh is null then
    raise exception 'deposit % not found', p_deposit_id;
  end if;
  if v_done is not null then
    raise exception using errcode = 'check_violation',
      message = format('deposit %s has already been allocated at %s', p_deposit_id, v_done),
      hint = 'Allocations are append-only. Record a correcting deposit rather than re-running this one.';
  end if;

  select p.contribution_confidence, p.monthly_contribution into v_conf, v_contribution
    from public.pots p where p.household_id = v_hh and p.is_active;

  -- No pot, or a pot with no contribution figure, is not permission to
  -- allocate: it is the absence of the figure the refusal below exists
  -- to protect. The first cut only refused a pot it could see.
  if not found or v_contribution is null then
    raise exception using errcode = 'check_violation',
      message = 'there is no active pot with a monthly contribution to allocate against',
      hint = 'Set and confirm the monthly contribution before allocating real money.';
  end if;

  if not exists (
       select 1 from public.confidence_levels c
        where c.key = v_conf and c.is_trusted) then
    raise exception using errcode = 'check_violation',
      message = format('the pot''s monthly contribution is still %s, not confirmed', v_conf),
      hint = 'Confirm the contribution figure before allocating real money against it.';
  end if;

  insert into public.allocations (household_id, deposit_id, work_item_id, weight, amount, rank_at_run)
  select v_hh, p_deposit_id, a.work_item_id, a.weight, a.amount, a.rank
    from public.allocation_preview(v_hh, v_amount) a
   where a.amount > 0;

  get diagnostics n = row_count;

  update public.deposits
     set allocated_at = now(),
         weights_snapshot = (
           select jsonb_build_object('decay', coalesce(s.decay, 0.850),
                                     'floor_share', coalesce(s.floor_share, 0.100),
                                     'items', n)
             from (select 1) d
             left join public.allocation_settings s on s.household_id = v_hh)
   where id = p_deposit_id;

  return n;
end;
$$;

-- ---------------------------------------------------------------
-- reconcile_allocated_balances: the ledger is the truth; the column is
-- a cache. This rebuilds the cache from allocations and is the arbiter
-- whenever the two disagree.
-- ---------------------------------------------------------------
create or replace function public.reconcile_allocated_balances(p_household_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare n integer;
begin
  update public.work_items w
     set allocated_balance = coalesce(t.total, 0)
    from (select w2.id,
                 (select coalesce(sum(a.amount), 0)
                    from public.allocations a where a.work_item_id = w2.id) as total
            from public.work_items w2
           where w2.household_id = p_household_id) t
   where w.id = t.id
     and w.allocated_balance is distinct from coalesce(t.total, 0);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------
-- house_context: the grounding call.
--
-- Every assistant session starts here. It returns what exists in a
-- room, what is planned there, what was decided about it, what is
-- stored in it and which assets live in it - so a cold session is
-- immediately competent instead of guessing or asking.
--
-- Passing null returns the whole-house summary.
-- ---------------------------------------------------------------
create or replace function public.house_context(p_room_key text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_hh uuid := public.current_household();
  v_prop uuid;
  v_room uuid;
  v_out jsonb;
begin
  if v_hh is null then
    return jsonb_build_object('error', 'no household for the current user');
  end if;

  -- "The house" is the active property. A room key is resolved inside
  -- it, so two properties that both have a `kitchen` cannot be confused.
  v_prop := public.active_property_id(v_hh);

  if p_room_key is not null then
    select id into v_room from public.rooms
     where household_id = v_hh and key = p_room_key
       and public.in_default_scope(household_id, property_id)
     order by (property_id is null) limit 1;
    if v_room is null then
      return jsonb_build_object('error', format('no room with key %L', p_room_key),
        'known_rooms', (select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
                          from public.rooms where household_id = v_hh
                           and public.in_default_scope(household_id, property_id)));
    end if;
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'scope', coalesce(p_room_key, 'whole house'),
    -- WHICH house, and what else exists. Candidates are named so a
    -- session knows they are there; archived ones are counted, never
    -- described - they are read only for a comparison.
    'property', (select jsonb_build_object('ref', p.ref, 'name', p.name,
                    'status', p.status, 'address', p.address_line, 'postcode', p.postcode,
                    'offer_status', p.offer_status, 'guide_price', p.guide_price,
                    'walk_away_price', p.walk_away_price)
                   from public.properties p where p.id = v_prop),
    'candidates', (select coalesce(jsonb_agg(jsonb_build_object('ref', p.ref, 'name', p.name)
                    order by p.ref), '[]'::jsonb)
                   from public.properties p
                  where p.household_id = v_hh and p.status = 'candidate'),
    'archived_count', (select count(*) from public.properties p
                  where p.household_id = v_hh and p.status = 'archived'),
    'room', (select to_jsonb(r) - 'household_id' from public.rooms r where r.id = v_room),
    'features', (select coalesce(jsonb_agg(jsonb_build_object(
                    'type', f.feature_type, 'quantity', f.quantity,
                    'spec', f.spec, 'condition', f.condition,
                    'confidence', f.confidence) order by f.feature_type), '[]'::jsonb)
                   from public.room_features f
                  where f.household_id = v_hh and (v_room is null or f.room_id = v_room)),
    'open_work', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', w.id, 'title', w.title, 'kind', w.kind, 'trade', w.trade,
                    'status', w.status, 'horizon', w.horizon, 'priority', w.priority,
                    'target_cost', coalesce(w.cost_expected, w.cost_best),
                    'allocated', w.allocated_balance,
                    'cost_confidence', w.cost_confidence) order by w.priority), '[]'::jsonb)
                   from public.work_items w
                  where w.household_id = v_hh
                    and w.status not in ('done','dropped')
                    and public.in_default_scope(w.household_id, w.property_id)
                    and (v_room is null or w.room_id = v_room)),
    'completed_work', (select coalesce(jsonb_agg(jsonb_build_object(
                    'title', w.title, 'resolved_at', w.resolved_at,
                    'resolution', w.resolution, 'spent', w.spent_actual)
                    order by w.resolved_at desc), '[]'::jsonb)
                   from public.work_items w
                  where w.household_id = v_hh and w.status = 'done'
                    and public.in_default_scope(w.household_id, w.property_id)
                    and (v_room is null or w.room_id = v_room)),
    'assets', (select coalesce(jsonb_agg(jsonb_build_object(
                    'name', a.name, 'make', a.make, 'model', a.model,
                    'status', a.status, 'warranty_expires_on', a.warranty_expires_on)
                    order by a.name), '[]'::jsonb)
                   from public.assets a
                  where a.household_id = v_hh and (v_room is null or a.room_id = v_room)),
    'storage', (select coalesce(jsonb_agg(jsonb_build_object(
                    'name', s.name, 'kind', s.kind, 'label_code', s.label_code)
                    order by s.name), '[]'::jsonb)
                   from public.storage_locations s
                  where s.household_id = v_hh and (v_room is null or s.room_id = v_room)),
    'decisions', (select coalesce(jsonb_agg(jsonb_build_object(
                    'title', d.title, 'decided', d.decided, 'rationale', d.rationale,
                    'decided_on', d.decided_on) order by d.decided_on desc), '[]'::jsonb)
                   from public.decisions d
                  where d.household_id = v_hh and d.status = 'active'
                    and public.in_default_scope(d.household_id, d.property_id)
                    and (v_room is null or d.room_id = v_room)),
    'palettes', (select coalesce(jsonb_agg(jsonb_build_object(
                    'name', p.name, 'surface', p.surface, 'brand', p.brand,
                    'colour_name', p.colour_name, 'colour_code', p.colour_code,
                    'finish', p.finish) order by p.surface), '[]'::jsonb)
                   from public.palettes p
                  where p.household_id = v_hh and (v_room is null or p.room_id = v_room)),
    'facts', (select coalesce(jsonb_agg(jsonb_build_object(
                    'fact', h.fact, 'detail', h.detail, 'category', h.category,
                    'confidence', h.confidence) order by h.category), '[]'::jsonb)
                   from public.house_facts h
                  where h.household_id = v_hh
                    and public.in_default_scope(h.household_id, h.property_id)
                    and (v_room is null or h.room_id = v_room)),
    -- THE SHOPPING LIST, as money rather than as rows. A cold session
    -- that does not know what is already on the list will add a second
    -- dust extractor, and a cold session that does not know what is
    -- DORMANT will read the total as the whole cost of the project.
    -- Whole-house only: the shopping list is phased, not roomed.
    'shopping', (select case when v_room is null then
                   coalesce(jsonb_agg(jsonb_build_object(
                     'phase', t.phase, 'in_scope', t.items_in_scope,
                     'dormant', t.items_dormant, 'buy', t.buy_cost,
                     'hire', t.hire_cost, 'total', t.total_in_scope,
                     'parked', t.dormant_cost, 'unconfirmed', t.unconfirmed_cost)
                     order by t.total_in_scope desc), '[]'::jsonb) end
                   from public.shopping_totals t
                  where t.household_id = v_hh),
    -- THE STOCKPILE. Progress against a target is the one figure here
    -- nobody can hold in their head across two years of collecting.
    'stockpile', (select coalesce(jsonb_agg(jsonb_build_object(
                    'name', s.name, 'category', s.category,
                    'acquisition', s.acquisition, 'status', s.status,
                    'held', s.quantity_held, 'to_collect', s.quantity_to_collect,
                    'unit', s.unit, 'pct', s.pct_collected,
                    'spent', s.spent_so_far, 'budget_cap', s.budget_cap,
                    'saving_if_reclaimed', s.saving_if_reclaimed,
                    'spec', s.spec) order by s.pct_collected nulls last), '[]'::jsonb)
                   from public.stock_status s
                  where s.household_id = v_hh
                    and s.status not in ('complete','dropped')
                    and (v_room is null or s.room_id = v_room)),
    -- WHAT A REVIEW SESSION SHOULD OPEN WITH. Not the rows - the size
    -- of the job, so the session can say how far through it is instead
    -- of starting at the top of the same list every time.
    'review', (select jsonb_build_object(
                    'never_reviewed', count(*) filter (where q.reviewed_at is null),
                    'in_queue', count(*),
                    'top', (select coalesce(jsonb_agg(jsonb_build_object(
                              'id', x.id, 'title', x.title,
                              'cost', x.cost_expected, 'gaps', x.gaps)), '[]'::jsonb)
                            from (select * from public.review_queue rq
                                   where rq.household_id = v_hh
                                     and (v_room is null or rq.room_id = v_room)
                                   order by rq.review_score desc limit 5) x))
                   from public.review_queue q
                  where q.household_id = v_hh
                    and (v_room is null or q.room_id = v_room)),
    'unconfirmed_warning', (
      select case when count(*) > 0
             then format('%s row(s) in scope are still unconfirmed or carried over. '
                      || 'Do not present their figures as fact.', count(*)) end
        from public.work_items w
       where w.household_id = v_hh
         and w.status not in ('done','dropped')
         and public.in_default_scope(w.household_id, w.property_id)
         and w.cost_confidence in ('carried_over','drafted','researched')
         and (v_room is null or w.room_id = v_room))
  )) into v_out;

  return v_out;
end;
$$;

-- ---------------------------------------------------------------
-- find_tool: does the household actually own this tool? The matcher
-- calls it before offering a job, because suggesting work that needs a
-- tool nobody owns is worse than suggesting nothing.
-- ---------------------------------------------------------------
create or replace function public.find_tool(p_tool_key text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'tool_key', p_tool_key,
    'owned', exists (
      select 1 from public.assets a
       where a.household_id = public.current_household()
         and a.tool_key = p_tool_key and a.status in ('working','degraded')
      union all
      select 1 from public.inventory_items i
       where i.household_id = public.current_household()
         and i.tool_key = p_tool_key and i.condition <> 'broken'),
    'assets', (select coalesce(jsonb_agg(jsonb_build_object(
                 'name', a.name, 'status', a.status, 'room_id', a.room_id)), '[]'::jsonb)
                 from public.assets a
                where a.household_id = public.current_household()
                  and a.tool_key = p_tool_key)
  );
$$;
