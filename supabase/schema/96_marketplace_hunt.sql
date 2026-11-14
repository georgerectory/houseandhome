-- ------------------------------------------------------------------
-- 96_marketplace_hunt.sql - what things sell for, what to hunt next,
-- and one function for a purchase.
--
-- PRICE EVIDENCE. A threshold in mp_profiles is typed. Over a long
-- campaign it should be EARNED, so every dated price seen is a row in
-- mp_price_obs, and mp_price_evidence says what those rows imply. Only
-- SOLD prices drive anything: a hammer price, a sold listing, the
-- owner's own purchase. An asking price is what somebody hoped for and
-- an auction estimate is what somebody guessed; both are kept and
-- neither moves a threshold. Dealer prices feed `price_new` only.
-- Evidence SUGGESTS and never overwrites: mp_threshold_review lists
-- where five or more sold prices disagree with a typed threshold by
-- more than a fifth, and the owner decides.
--
-- THE HUNT ORDER. mp_hunt_queue ranks every profile still outstanding:
-- need first (the tier), pulled earlier for scarce and rare things
-- because they take months to turn up; then anchors before the pieces
-- that are scaled to them; then the biggest saving against new. A
-- profile that cannot be bought yet - there is no house, or contracts
-- have not exchanged - stays in the queue as `watch`, to learn prices.
--
-- ALERTS ARE RATIONED. mp_alerts_to_set names the ten searches that
-- should be alerts today and what to do about each, so the owner's
-- phone and the database can be made to agree.
--
-- A PURCHASE GOES THROUGH mp_record_purchase, which does the six
-- things a purchase means and refuses the ones that should not happen.
-- It never closes a shopping line: a line can be wider than the
-- profiles that fill it, and closing a row the owner wrote is theirs
-- to decide. It reports when nothing is outstanding on the line.
-- ------------------------------------------------------------------

create table if not exists public.mp_price_obs (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id),
  profile_id    uuid not null references public.mp_profiles (id),
  find_id       uuid references public.mp_finds (id),
  kind          text not null
    check (kind in ('auction_hammer','auction_estimate','sold_listing','asking','own_purchase','dealer')),
  -- For the whole lot, before any buyer's premium.
  price         numeric(12,2) not null check (price >= 0),
  -- How many units of the profile the lot was.
  quantity      numeric(8,2) not null default 1 check (quantity > 0),
  premium_pct   numeric(5,2) not null default 0 check (premium_pct >= 0),
  unit_price    numeric(12,2) generated always as (round(price / quantity, 2)) stored,
  price_all_in  numeric(12,2) generated always as
                  (round(price * (1 + premium_pct / 100) / quantity, 2)) stored,
  observed_on   date not null,
  where_seen    text,
  description   text,
  grade         text check (grade is null or grade in ('A','B','C','X')),
  -- False for the top of the market, a group lot or a placeholder: a
  -- real price that says nothing about the ordinary one.
  is_typical    boolean not null default true,
  source_id     uuid references public.sources (id),
  status        text not null default 'active' check (status in ('active','retired')),
  note          text,
  confidence    text not null default 'researched' references public.confidence_levels (key),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (status = 'active' or note is not null)
);

create index if not exists mp_price_obs_profile_idx on public.mp_price_obs (profile_id, observed_on desc);
create unique index if not exists mp_price_obs_find_kind_uniq
  on public.mp_price_obs (find_id, kind) where find_id is not null;

create or replace trigger mp_price_obs_updated_at before update on public.mp_price_obs
  for each row execute function public.set_updated_at();

do $$
declare t text := 'mp_price_obs';
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('alter table public.%I force row level security', t);
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
    execute format('create policy %I on public.%I for select to authenticated '
      || 'using (public.is_household_member(household_id))', t || '_read', t);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_insert') then
    execute format('create policy %I on public.%I for insert to authenticated '
      || 'with check (public.is_household_member(household_id))', t || '_insert', t);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_update') then
    execute format('create policy %I on public.%I for update to authenticated '
      || 'using (public.is_household_member(household_id)) '
      || 'with check (public.is_household_member(household_id))', t || '_update', t);
  end if;
end $$;

-- Every find judged is an asking-price observation, without anybody
-- having to remember to write one.
create or replace function public.mp_finds_asking_obs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.profile_id is null or new.asking_price is null then return new; end if;
  insert into public.mp_price_obs (household_id, profile_id, find_id, kind, price, quantity,
                                   observed_on, where_seen, description, confidence)
  values (new.household_id, new.profile_id, new.id, 'asking', new.asking_price, new.quantity,
          new.seen_on, new.platform, new.title, 'actual')
  on conflict (find_id, kind) where find_id is not null
  do update set price = excluded.price, quantity = excluded.quantity,
                profile_id = excluded.profile_id;
  return new;
end;
$$;

revoke all on function public.mp_finds_asking_obs() from public, anon, authenticated;

create or replace trigger mp_finds_asking_obs
  after insert or update of asking_price, quantity, profile_id on public.mp_finds
  for each row execute function public.mp_finds_asking_obs();

-- A threshold and a price paid are money: neither changes silently.
create or replace trigger mp_profiles_log after update on public.mp_profiles
  for each row execute function public.log_changes(
    'money:price_steal', 'money:price_good', 'money:price_fair', 'money:price_max',
    'money:price_new', 'price_confidence', 'status');

create or replace trigger mp_finds_log after update on public.mp_finds
  for each row execute function public.log_changes('money:paid', 'status', 'verdict');

-- ---------------------------------------------------------------
-- mp_price_evidence: what the dated prices say, per profile.
-- ---------------------------------------------------------------
create or replace view public.mp_price_evidence
with (security_invoker = on) as
select
  p.id as profile_id, p.household_id, p.key, p.name,
  p.price_steal, p.price_good, p.price_fair, p.price_max, p.price_new,
  p.price_confidence, p.captured_on,
  (p.captured_on < current_date - 365)                  as is_stale,
  coalesce(e.sold_n, 0)                                 as sold_n,
  coalesce(e.asking_n, 0)                               as asking_n,
  coalesce(e.estimate_n, 0)                             as estimate_n,
  coalesce(e.dealer_n, 0)                               as dealer_n,
  e.median_hammer, e.median_all_in, e.q1_all_in, e.q3_all_in,
  e.median_asking, e.median_dealer, e.latest_sold_on,
  (coalesce(e.sold_n, 0) >= 5)                          as has_enough,
  -- What the sold prices would make the ladder. Steal: about half the
  -- going rate. Good: the hammer, as a private sale has no premium.
  -- Fair: what a bidder actually paid. Max: the upper quartile.
  round(e.median_all_in / 2)                            as implied_steal,
  round(e.median_hammer)                                as implied_good,
  round(e.median_all_in)                                as implied_fair,
  round(e.q3_all_in)                                    as implied_max,
  round(e.median_dealer)                                as implied_new
from public.mp_profiles p
left join (
  select o.profile_id,
    count(*) filter (where s.sold)                                           as sold_n,
    count(*) filter (where o.kind = 'asking')                                as asking_n,
    count(*) filter (where o.kind = 'auction_estimate')                      as estimate_n,
    count(*) filter (where o.kind = 'dealer')                                as dealer_n,
    percentile_cont(0.5)  within group (order by o.unit_price)   filter (where s.sold) as median_hammer,
    percentile_cont(0.5)  within group (order by o.price_all_in) filter (where s.sold) as median_all_in,
    percentile_cont(0.25) within group (order by o.price_all_in) filter (where s.sold) as q1_all_in,
    percentile_cont(0.75) within group (order by o.price_all_in) filter (where s.sold) as q3_all_in,
    percentile_cont(0.5)  within group (order by o.unit_price)   filter (where o.kind = 'asking') as median_asking,
    percentile_cont(0.5)  within group (order by o.unit_price)   filter (where o.kind = 'dealer') as median_dealer,
    max(o.observed_on) filter (where s.sold)                                 as latest_sold_on
  from public.mp_price_obs o
  cross join lateral (
    select (o.kind in ('auction_hammer','sold_listing','own_purchase')
            and o.is_typical
            and o.observed_on >= current_date - interval '24 months') as sold
  ) s
  where o.status = 'active'
  group by o.profile_id
) e on e.profile_id = p.id;

comment on view public.mp_price_evidence is
  'Per profile: how many dated prices there are of each kind, the median and quartiles of typical SOLD prices in the last 24 months, and the ladder those would imply. Asking prices and estimates are counted and never drive anything. is_stale is a threshold captured over a year ago.';

-- ---------------------------------------------------------------
-- mp_threshold_review: where the evidence says a typed threshold is
-- out by more than a fifth. A prompt for the owner, never a write.
-- ---------------------------------------------------------------
create or replace view public.mp_threshold_review
with (security_invoker = on) as
select e.household_id, e.profile_id, e.key, e.name, t.threshold,
       t.typed, t.implied,
       round((t.implied - t.typed) / nullif(t.typed, 0) * 100) as pct_out,
       e.sold_n, e.price_confidence, e.latest_sold_on
from public.mp_price_evidence e
cross join lateral (values
  ('steal', e.price_steal, e.implied_steal::numeric),
  ('good',  e.price_good,  e.implied_good::numeric),
  ('fair',  e.price_fair,  e.implied_fair::numeric),
  ('max',   e.price_max,   e.implied_max::numeric)
) as t(threshold, typed, implied)
where e.has_enough
  and t.typed is not null and t.typed > 0 and t.implied is not null
  and abs(t.implied - t.typed) / t.typed > 0.20;

comment on view public.mp_threshold_review is
  'Thresholds that five or more sold prices disagree with by more than 20 per cent: typed, implied and how far out. The owner confirms a change; house.change_why logs it.';

-- ---------------------------------------------------------------
-- The patience rule and the anchors.
-- ---------------------------------------------------------------
alter table public.mp_profiles
  -- Null until a completion date is known.
  add column if not exists needed_by date,
  -- What to do if the good one has not turned up: buy new, borrow, or
  -- a placeholder at or under the steal price.
  add column if not exists fallback text,
  add column if not exists fallback_weeks integer check (fallback_weeks is null or fallback_weeks > 0),
  -- The key of the profile that sets this one's scale: the sofa for a
  -- side table, the bed for the bedsides, the table for the chairs.
  add column if not exists anchor_of text;

-- mp_board again, so a placeholder does not fill a profile. Columns
-- listed for the reason given in 95_marketplace_quality.sql.
create or replace view public.mp_board
with (security_invoker = on) as
select
  p.id, p.household_id, p.key, p.name, p.category, p.room_hint, p.tier,
  p.wanted_qty, p.unit, p.work_item_id, p.spec, p.reject_if, p.inspect,
  p.price_steal, p.price_good, p.price_fair, p.price_max, p.price_new,
  p.price_basis, p.price_confidence, p.captured_on, p.source_id,
  p.keywords, p.misspellings, p.exclude_terms, p.size_class, p.buy_window,
  p.supply, p.max_drive_minutes, p.status, p.resolution, p.notes,
  p.sort_order, p.confidence, p.confirmed_at, p.created_at, p.updated_at,
  case p.tier when 'day_one' then 1 when 'first_month' then 2
              when 'first_year' then 3 else 4 end        as tier_rank,
  w.title                                               as list_title,
  w.cost_expected                                       as list_cost,
  w.cost_confidence                                     as list_cost_confidence,
  w.status                                              as list_status,
  coalesce(f.bought_qty, 0)                             as bought_qty,
  greatest(0, p.wanted_qty - coalesce(f.bought_qty, 0)) as qty_outstanding,
  coalesce(f.spent, 0)                                  as spent,
  coalesce(f.live_finds, 0)                             as live_finds,
  round(greatest(0, p.wanted_qty - coalesce(f.bought_qty, 0))
        * coalesce(p.price_good, 0), 2)                 as budget_outstanding,
  p.needed_by, p.fallback, p.fallback_weeks, p.anchor_of,
  coalesce(f.placeholder_qty, 0)                        as placeholder_qty
from public.mp_profiles p
left join public.work_items w on w.id = p.work_item_id
left join (
  select profile_id,
         sum(quantity) filter (where status = 'bought' and not is_placeholder) as bought_qty,
         sum(quantity) filter (where status = 'bought' and is_placeholder)     as placeholder_qty,
         sum(paid + coalesce(travel_cost, 0)) filter (where status = 'bought') as spent,
         count(*) filter (where status in ('spotted','messaged','offered','agreed')) as live_finds
  from public.mp_finds
  group by profile_id
) f on f.profile_id = p.id;

comment on view public.mp_board is
  'mp_profiles with bought, outstanding and spent derived from mp_finds. A placeholder is counted apart and does not fill the profile. Nothing here is stored.';

-- ---------------------------------------------------------------
-- The state of the house purchase, which decides what may be bought.
-- ---------------------------------------------------------------
create or replace function public.mp_house_state(p_household uuid)
returns text
language sql stable
set search_path = public
as $$
  select case
    when exists (select 1 from public.properties
                  where household_id = p_household and status = 'owned') then 'moved'
    when exists (select 1 from public.properties
                  where household_id = p_household and status = 'committed') then 'exchanged'
    else 'none'
  end;
$$;

create or replace function public.mp_can_buy(p_buy_window text, p_house_state text)
returns boolean
language sql immutable parallel safe
set search_path = public
as $$
  select case p_buy_window
    when 'any_time'      then true
    when 'from_exchange' then p_house_state in ('exchanged','moved')
    when 'after_move'    then p_house_state = 'moved'
    else false
  end;
$$;

-- ---------------------------------------------------------------
-- mp_hunt_queue: what to look for next, and whether to buy or only
-- to watch. The components of the order are columns, so the page can
-- say why a row is where it is.
-- ---------------------------------------------------------------
create or replace view public.mp_hunt_queue
with (security_invoker = on) as
with q as (
  select
    b.household_id, b.id as profile_id, b.key, b.name, b.category, b.room_hint,
    b.tier, b.tier_rank, b.supply, b.size_class, b.buy_window,
    b.wanted_qty, b.qty_outstanding, b.placeholder_qty, b.live_finds,
    b.price_steal, b.price_good, b.price_fair, b.price_max, b.price_new,
    b.price_confidence, b.work_item_id, b.list_title,
    b.needed_by, b.fallback, b.fallback_weeks, b.anchor_of,
    -- Scarce things start a tier early and rare ones two, because they
    -- take months to turn up.
    greatest(1, b.tier_rank - case b.supply when 'rare' then 2 when 'scarce' then 1 else 0 end)
                                                        as start_rank,
    (a.id is not null)                                  as waits_for_anchor,
    round(b.qty_outstanding * greatest(0, coalesce(b.price_new, 0) - coalesce(b.price_good, 0)), 2)
                                                        as saving_vs_new,
    public.mp_house_state(b.household_id)               as house_state,
    b.created_at::date                                  as hunting_since
  from public.mp_board b
  left join public.mp_board a
    on a.household_id = b.household_id and a.key = b.anchor_of
   and a.status = 'hunting' and a.qty_outstanding > 0
  where b.status = 'hunting' and b.qty_outstanding > 0
)
select
  q.*,
  public.mp_can_buy(q.buy_window, q.house_state)        as can_buy_now,
  case when public.mp_can_buy(q.buy_window, q.house_state) then 'buy' else 'watch' end
                                                        as mode,
  (current_date - q.hunting_since) / 7                  as weeks_hunted,
  case when q.fallback_weeks is not null
       then q.hunting_since + q.fallback_weeks * 7 end  as fallback_from,
  (q.tier = 'day_one' and q.fallback is not null and q.fallback_weeks is not null
   and q.placeholder_qty = 0
   -- Patience cannot run out before there is a house to need it in.
   and q.house_state <> 'none'
   and current_date >= q.hunting_since + q.fallback_weeks * 7)
                                                        as fallback_due,
  row_number() over (partition by q.household_id
    order by q.start_rank, q.waits_for_anchor, q.saving_vs_new desc, q.key)
                                                        as queue_rank
from q;

comment on view public.mp_hunt_queue is
  'Every profile still outstanding, in the order to hunt: start_rank (tier, earlier for scarce and rare), anchors before what is scaled to them, then the saving against new. mode is buy or watch by the state of the house purchase. fallback_due is a day-one need whose patience has run out, which it cannot do before contracts exchange.';

-- ---------------------------------------------------------------
-- mp_alerts_to_set: the ration. At most ten alerts, the top of the
-- queue, day-one and scarce things first.
-- ---------------------------------------------------------------
create or replace view public.mp_alerts_to_set
with (security_invoker = on) as
with ranked as (
  select s.id as search_id, s.household_id, s.profile_id, s.label, s.query, s.max_price,
         s.radius_km, s.is_alert, q.key, q.name, q.queue_rank,
         row_number() over (partition by s.household_id
           -- A search written as an alert outranks a sweep: a misspelling
           -- sweep is run by hand and is not worth a slot on the phone.
           order by (s.cadence = 'alert') desc,
                    (q.tier = 'day_one' or q.supply in ('scarce','rare')) desc,
                    q.queue_rank, s.sort_order, s.label) as slot
    from public.mp_searches s
    join public.mp_hunt_queue q on q.profile_id = s.profile_id
   where s.status = 'active'
)
select r.household_id, r.search_id, r.profile_id, r.key, r.name, r.label, r.query,
       r.max_price, r.radius_km, r.queue_rank, r.slot::integer as slot,
       case when r.slot <= 10 and r.is_alert then 'keep'
            when r.slot <= 10 then 'set'
            else 'retire' end                            as action
  from ranked r
 where r.slot <= 10 or r.is_alert
union all
select s.household_id, s.id, s.profile_id, p.key, p.name, s.label, s.query,
       s.max_price, s.radius_km, null::bigint, null::integer, 'retire'
  from public.mp_searches s
  left join public.mp_profiles p on p.id = s.profile_id
 where s.status = 'active' and s.is_alert
   and not exists (select 1 from public.mp_hunt_queue q where q.profile_id = s.profile_id);

comment on view public.mp_alerts_to_set is
  'The ten searches that should be alerts today (keep or set), and any alert that should stop (retire) because its profile has filled or fallen out of the top ten.';

-- ---------------------------------------------------------------
-- mp_line_benchmark: what the profiles on a shopping line come to
-- second hand, beside what the line is listed at.
-- ---------------------------------------------------------------
create or replace view public.mp_line_benchmark
with (security_invoker = on) as
select
  b.household_id, b.work_item_id,
  count(*)                                              as profiles,
  round(sum(b.wanted_qty * b.price_good), 2)            as second_hand_good,
  round(sum(b.wanted_qty * b.price_fair), 2)            as second_hand_fair,
  round(sum(b.wanted_qty * b.price_max), 2)             as second_hand_max,
  round(sum(b.wanted_qty * b.price_new), 2)             as cost_if_new,
  round(sum(b.spent), 2)                                as spent,
  bool_and(b.wanted_qty = 0 or b.qty_outstanding = 0)   as nothing_outstanding,
  bool_or(b.price_confidence not in ('confirmed','actual')) as is_unconfirmed
from public.mp_board b
where b.work_item_id is not null and b.status not in ('dropped','idea')
group by b.household_id, b.work_item_id;

comment on view public.mp_line_benchmark is
  'Per shopping line: the summed second-hand good, fair and ceiling prices of the profiles that fill it. A benchmark for the estimate, never a replacement for it.';

-- ---------------------------------------------------------------
-- mp_record_purchase: the one way a find becomes a purchase.
-- ---------------------------------------------------------------
create or replace function public.mp_record_purchase(
  p_find uuid, p_paid numeric, p_bought_on date,
  p_travel_cost numeric default 0, p_why text default null
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  f public.mp_finds%rowtype;
  p public.mp_profiles%rowtype;
  v_grade text;
  v_code text;
  v_line uuid;
  v_outstanding numeric;
  v_filled boolean := false;
  v_line_clear boolean;
begin
  select * into f from public.mp_finds where id = p_find for update;
  if f.id is null then
    raise exception 'mp_record_purchase: no such find';
  end if;
  if f.status = 'bought' then
    raise exception using errcode = 'check_violation',
      message = format('mp_record_purchase: "%s" is already bought', f.title);
  end if;
  if p_paid is null or p_paid < 0 or p_bought_on is null then
    raise exception using errcode = 'check_violation',
      message = 'mp_record_purchase: a purchase needs what was paid and the date';
  end if;

  -- By now it has been in the hand, so the checks can be answered. A
  -- placeholder is held to less: it must only not be an X.
  v_grade := public.mp_grade(f.profile_id, f.checks, f.maker_id);
  v_code := case
    when f.is_placeholder then case when v_grade = 'X' then 'grade_x' end
    else public.mp_verdict_refusal('buy', v_grade, f.style_fit, null, null, false)
  end;
  if v_code is not null then
    raise exception using errcode = 'check_violation',
      message = format('mp_record_purchase: "%s" refused (%s)', f.title, v_code),
      hint = 'Answer the checks and the style fit on the find first; a purchase needs grade A or B and a fit of 4 or 5. A stand-in is recorded with is_placeholder.';
  end if;

  select * into p from public.mp_profiles where id = f.profile_id;
  v_line := coalesce(f.work_item_id, p.work_item_id);

  perform set_config('house.change_why', coalesce(p_why, 'Bought: ' || f.title), true);
  perform set_config('house.change_source', 'mp_record_purchase', true);

  update public.mp_finds
     set status = 'bought', paid = p_paid, bought_on = p_bought_on,
         travel_cost = coalesce(p_travel_cost, 0), confidence = 'actual',
         work_item_id = v_line
   where id = f.id;

  insert into public.spend_events (household_id, work_item_id, amount, spent_on, description,
                                   channel, cost_class, confidence)
  values (f.household_id, v_line, p_paid, p_bought_on, f.title,
          case when f.platform = 'facebook_marketplace' then 'marketplace'
               when f.platform = 'reclamation' then 'reclamation'
               else 'second_hand' end,
          'setup', 'actual');

  if v_line is not null then
    update public.work_items
       set spent_actual = coalesce(spent_actual, 0) + p_paid
     where id = v_line;
  end if;

  if f.profile_id is not null then
    insert into public.mp_price_obs (household_id, profile_id, find_id, kind, price, quantity,
                                     observed_on, where_seen, description, grade, is_typical, confidence)
    values (f.household_id, f.profile_id, f.id, 'own_purchase', p_paid, f.quantity,
            p_bought_on, coalesce(f.location_text, f.platform), f.title, v_grade,
            not f.is_placeholder, 'actual');

    select b.qty_outstanding into v_outstanding from public.mp_board b where b.id = f.profile_id;
    if not f.is_placeholder and p.wanted_qty > 0 and v_outstanding = 0 and p.status = 'hunting' then
      update public.mp_profiles
         set status = 'filled',
             resolution = format('Filled %s: %s', p_bought_on, f.title)
       where id = p.id;
      update public.mp_searches
         set status = 'retired', is_alert = false
       where profile_id = p.id and status = 'active';
      v_filled := true;
    end if;
  end if;

  select l.nothing_outstanding into v_line_clear
    from public.mp_line_benchmark l where l.work_item_id = v_line;

  return jsonb_build_object(
    'find', (select jsonb_build_object('title', l.title, 'paid', l.paid, 'grade', l.quality_grade,
                      'haggled_off', l.haggled_off, 'saved_vs_fair', l.saved_vs_fair,
                      'saved_vs_new', l.saved_vs_new, 'is_placeholder', l.is_placeholder)
               from public.mp_find_ledger l where l.id = f.id),
    'profile', case when p.id is not null then jsonb_build_object(
                 'key', p.key, 'filled', v_filled, 'outstanding', v_outstanding) end,
    'line', (select jsonb_build_object('id', w.id, 'title', w.title, 'status', w.status,
                      'spent_actual', w.spent_actual,
                      'nothing_outstanding', coalesce(v_line_clear, false))
               from public.work_items w where w.id = v_line),
    'next_alert', (select jsonb_build_object('label', a.label, 'query', a.query, 'key', a.key)
                     from public.mp_alerts_to_set a
                    where a.household_id = f.household_id and a.action = 'set'
                    order by a.slot limit 1)
  );
end;
$$;

comment on function public.mp_record_purchase(uuid, numeric, date, numeric, text) is
  'Records a purchase: the find is bought at an actual price, the spend lands on its shopping line, a price observation is written, and the profile fills and its searches retire when nothing is outstanding. Refuses a find already bought, a grade X, and anything not proven A or B at a fit of 4 or 5 unless it is a placeholder. Never closes the shopping line: it reports nothing_outstanding and the owner decides.';

-- ---------------------------------------------------------------
-- mp_profile_brief: one profile with everything needed to judge a
-- listing against it - the checks, the makers and the evidence.
-- ---------------------------------------------------------------
create or replace function public.mp_profile_brief(p_household uuid, p_key text)
returns jsonb
language sql stable
set search_path = public
as $$
  select to_jsonb(b) - 'household_id' - 'created_at' - 'updated_at'
    || jsonb_build_object(
      'checks', (select coalesce(jsonb_agg(jsonb_build_object(
                   'key', c.key, 'kind', c.kind, 'question', c.question,
                   'pass', c.pass_looks_like, 'fail', c.fail_looks_like,
                   'must_pass', c.must_pass, 'distinction', c.distinction,
                   'doorstep', c.doorstep, 'how', c.how) order by c.sort_order, c.key), '[]'::jsonb)
                   from public.mp_checks c where c.profile_id = b.id and c.status = 'active'),
      'makers', (select coalesce(jsonb_agg(jsonb_build_object(
                   'name', m.name, 'standing', m.standing, 'how_to_tell', m.how_to_tell,
                   'price_effect', m.price_effect, 'confidence', m.confidence)
                   order by m.standing, m.name), '[]'::jsonb)
                   from public.mp_makers m
                  where m.household_id = b.household_id and m.category = b.category and m.status = 'active'),
      'evidence', (select to_jsonb(e) - 'household_id' - 'profile_id' - 'key' - 'name'
                     from public.mp_price_evidence e where e.profile_id = b.id),
      'queue', (select jsonb_build_object('rank', q.queue_rank, 'mode', q.mode,
                         'weeks_hunted', q.weeks_hunted, 'fallback_due', q.fallback_due)
                  from public.mp_hunt_queue q where q.profile_id = b.id))
    from public.mp_board b
   where b.household_id = p_household and b.key = p_key;
$$;

comment on function public.mp_profile_brief(uuid, text) is
  'One profile by key with its checks, the makers of its category, its price evidence and its place in the queue. Call it once a listing has been matched to a profile.';

-- ---------------------------------------------------------------
-- mp_context again, with the grade, the queue and the ration.
-- ---------------------------------------------------------------
create or replace function public.mp_context(p_household uuid)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'brief', (select to_jsonb(b) - 'created_at' - 'updated_at'
                from public.mp_brief b where b.household_id = p_household),
    'house_state', public.mp_house_state(p_household),
    'totals', (select coalesce(jsonb_agg(to_jsonb(t) - 'household_id' order by t.tier_rank), '[]'::jsonb)
                 from public.mp_totals t where t.household_id = p_household),
    'hunting', (select coalesce(jsonb_agg(jsonb_build_object(
                  'key', b.key, 'name', b.name, 'tier', b.tier, 'category', b.category,
                  'outstanding', b.qty_outstanding, 'unit', b.unit,
                  'steal', b.price_steal, 'good', b.price_good, 'fair', b.price_fair,
                  'max', b.price_max, 'new', b.price_new,
                  'price_confidence', b.price_confidence,
                  'size', b.size_class, 'buy_window', b.buy_window,
                  'max_drive_minutes', b.max_drive_minutes,
                  'spec', b.spec, 'reject_if', b.reject_if, 'inspect', b.inspect)
                  order by b.tier_rank, b.sort_order), '[]'::jsonb)
                  from public.mp_board b
                 where b.household_id = p_household and b.status = 'hunting'),
    'queue', (select coalesce(jsonb_agg(jsonb_build_object(
                  'rank', q.queue_rank, 'key', q.key, 'mode', q.mode, 'tier', q.tier,
                  'supply', q.supply, 'waits_for', case when q.waits_for_anchor then q.anchor_of end,
                  'saving_vs_new', q.saving_vs_new, 'weeks_hunted', q.weeks_hunted,
                  'fallback', q.fallback, 'fallback_from', q.fallback_from,
                  'fallback_due', q.fallback_due) order by q.queue_rank), '[]'::jsonb)
                from public.mp_hunt_queue q
               where q.household_id = p_household and q.queue_rank <= 10),
    'live_finds', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', l.id, 'title', l.title, 'profile', l.profile_key,
                  'asking', l.asking_price, 'band', l.price_band, 'grade', l.quality_grade,
                  'unseen', jsonb_array_length(l.unseen_checks), 'fit', l.style_fit,
                  'travel_band', l.travel_band, 'verdict', l.verdict,
                  'verdict_stands', l.verdict_stands,
                  'opening_offer', l.opening_offer, 'max_offer', l.max_offer,
                  'status', l.status, 'seen_on', l.seen_on) order by l.seen_on desc), '[]'::jsonb)
                  from public.mp_find_ledger l
                 where l.household_id = p_household
                   and l.status in ('spotted','messaged','offered','agreed')),
    'bought', (select coalesce(jsonb_agg(jsonb_build_object(
                  'title', l.title, 'profile', l.profile_key, 'paid', l.paid,
                  'grade', l.quality_grade, 'maker', l.maker_name,
                  'is_placeholder', l.is_placeholder,
                  'bought_on', l.bought_on, 'saved_vs_fair', l.saved_vs_fair,
                  'saved_vs_new', l.saved_vs_new) order by l.bought_on desc), '[]'::jsonb)
                  from public.mp_find_ledger l
                 where l.household_id = p_household and l.status = 'bought'),
    'alerts', (select coalesce(jsonb_agg(jsonb_build_object(
                  'label', s.label, 'query', s.query, 'max_price', s.max_price,
                  'radius_km', s.radius_km) order by s.sort_order), '[]'::jsonb)
                 from public.mp_searches s
                where s.household_id = p_household and s.is_alert and s.status = 'active'),
    'alerts_to_change', (select coalesce(jsonb_agg(jsonb_build_object(
                  'action', a.action, 'label', a.label, 'key', a.key, 'slot', a.slot)
                  order by a.slot nulls last, a.label), '[]'::jsonb)
                 from public.mp_alerts_to_set a
                where a.household_id = p_household and a.action <> 'keep'),
    'thresholds_to_review', (select coalesce(jsonb_agg(jsonb_build_object(
                  'key', r.key, 'threshold', r.threshold, 'typed', r.typed,
                  'implied', r.implied, 'pct_out', r.pct_out, 'sold_n', r.sold_n)
                  order by abs(r.pct_out) desc), '[]'::jsonb)
                 from public.mp_threshold_review r where r.household_id = p_household)
  );
$$;

comment on function public.mp_context(uuid) is
  'The brief, the state of the house purchase, the money by tier, every profile still hunted, the top of the queue, live finds with their grade, purchases, the alerts in force and the ones to change, and the thresholds the evidence disputes. Call it before judging a listing.';

-- ---------------------------------------------------------------
-- Matching a published lot to a profile, by machine.
--
-- A saleroom that publishes every lot of a sale - with its hammer price
-- afterwards, with its estimate beforehand - is both the best price
-- evidence there is and a list of things to go and view. To use either
-- without a person reading four hundred descriptions, a profile says
-- what a lot of its kind is CALLED: `lot_match`, a case-insensitive
-- regular expression, and `lot_exclude` for what disqualifies it
-- (reproduction, modern, a different piece that shares a word). A lot
-- that matches two profiles is given to neither. tools/auction-lots.mjs
-- does the reading; where to read is on the ground.
-- ---------------------------------------------------------------
alter table public.mp_profiles
  add column if not exists lot_match text,
  add column if not exists lot_exclude text;

alter table public.mp_grounds
  -- Where the ground publishes what its lots SOLD for, and what is
  -- coming up. The path under `url` that tools/auction-lots.mjs reads.
  add column if not exists results_section text,
  add column if not exists catalogue_section text;

-- Which page shape a ground publishes its lots in: 'rows' (a row per
-- lot with its price) or 'grid' (the catalogue platform many regional
-- salerooms share). tools/auction-lots.mjs has a reader for each.
alter table public.mp_grounds
  add column if not exists reader text check (reader is null or reader in ('rows','grid'));
