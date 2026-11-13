-- ------------------------------------------------------------------
-- 95_marketplace_quality.sql - is it GOOD, as well as cheap.
--
-- 94_marketplace.sql can say a thing is cheap. It cannot say the thing
-- is any good, and "poor items that look good" is the failure the
-- owner named. A profile's `spec`, `reject_if` and `inspect` are prose:
-- enough to reason with, not enough to ENFORCE anything. This file is
-- the enforcement.
--
--   mp_makers   names worth knowing: seek, acceptable, avoid, and how
--               to tell one from a seller's claim.
--   mp_checks   the checklist for a profile. Each check is a question
--               with what a pass and a fail look like.
--   mp_finds    gains the ANSWERS: pass, fail or unseen, each with the
--               evidence - what was seen, in which photograph, or what
--               the seller said.
--
-- THE GRADE IS DERIVED, NEVER TYPED (mp_grade):
--   A  every must-pass check passes, and either a `seek` maker is
--      evidenced or every `distinction` check passes too.
--   B  every must-pass check passes.
--   C  nothing has failed, but a must-pass check is unseen - or the
--      profile has no checks, so nothing has been proven.
--   X  a must-pass check fails, or the maker is one to avoid.
--
-- The grade is about QUALITY only. Whether it suits the house is
-- `style_fit`, a separate test, so a refusal can say which one failed.
--
-- THE GUARD (mp_verdict_refusal, enforced by a trigger on mp_finds):
--   buy    needs grade A or B and a style fit of 4 or 5.
--   offer  needs grade A, B or C and a style fit of 4 or 5; at C the
--          unseen checks are the questions to ask (unseen_checks).
--   X      can only be `pass`. So can a style fit of 1 or 2.
--   The one exception: `buy` at grade C when the price is at or under
--   the steal price, the seller is in travel band A, and every unseen
--   check can be settled on the doorstep. Go, look, and leave without
--   it if it fails.
--
-- A constraint cannot do this, because the grade reads other tables.
-- The trigger fires when a find is written; a check or a maker changed
-- LATER does not re-fire it, so mp_find_ledger carries verdict_stands,
-- and a verdict that no longer holds says so on its own face.
-- ------------------------------------------------------------------

create table if not exists public.mp_makers (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id),
  name          text not null,
  aliases       text[] not null default '{}',
  category      text not null
    check (category in ('seating','tables','storage','beds','lighting','mirrors_art',
      'textiles','kitchen_dining','hearth','hardware','garden','decorative','other')),
  standing      text not null check (standing in ('seek','acceptable','avoid')),
  era           text,
  -- What they made, and why it is good or not.
  what          text,
  -- The stamp, label, backstamp, castor or plate that proves it. A
  -- maker with no tell is a name a seller can type.
  how_to_tell   text,
  -- How much over an unnamed equivalent it is worth paying.
  price_effect  text,
  source_id     uuid references public.sources (id),
  status        text not null default 'active' check (status in ('active','retired')),
  notes         text,
  confidence    text not null default 'drafted' references public.confidence_levels (key),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists mp_makers_name_uniq
  on public.mp_makers (household_id, lower(name));

create or replace trigger mp_makers_updated_at before update on public.mp_makers
  for each row execute function public.set_updated_at();

create table if not exists public.mp_checks (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id),
  profile_id    uuid not null references public.mp_profiles (id),
  -- The name an answer is filed under in mp_finds.checks.
  key           text not null check (key ~ '^[a-z0-9_]+$'),
  kind          text not null
    check (kind in ('material','construction','maker','condition','fit','provenance')),
  question      text not null,
  pass_looks_like text,
  fail_looks_like text,
  -- A failed must-pass check is grade X. An unseen one is grade C.
  must_pass     boolean not null default true,
  -- The mark of a better piece: period, linings, original fittings.
  -- All of them passing lifts a B to an A.
  distinction   boolean not null default false,
  -- Can be settled at the door in under five minutes. The grade C
  -- exception turns on this.
  doorstep      boolean not null default false,
  how           text not null default 'photo' check (how in ('photo','ask_seller','in_hand')),
  sort_order    integer not null default 100,
  status        text not null default 'active' check (status in ('active','retired')),
  confidence    text not null default 'drafted' references public.confidence_levels (key),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (profile_id, key)
);

create index if not exists mp_checks_profile_idx on public.mp_checks (profile_id, sort_order);

create or replace trigger mp_checks_updated_at before update on public.mp_checks
  for each row execute function public.set_updated_at();

alter table public.mp_finds
  -- {"<check key>": {"answer": "pass|fail|unseen", "evidence": "..."}}
  add column if not exists checks jsonb not null default '{}'::jsonb,
  add column if not exists maker_id uuid references public.mp_makers (id),
  -- What was SEEN: the stamp, the label, the backstamp. Set maker_id
  -- only with this; a seller's word is not a maker.
  add column if not exists maker_evidence text,
  add column if not exists photos_seen integer check (photos_seen is null or photos_seen >= 0),
  -- A stand-in bought under a profile's fallback. In use, and it does
  -- not fill the profile.
  add column if not exists is_placeholder boolean not null default false,
  -- Where it turned up, so the grounds that produce can be told apart.
  add column if not exists ground_id uuid references public.mp_grounds (id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mp_finds_checks_is_object') then
    alter table public.mp_finds add constraint mp_finds_checks_is_object
      check (jsonb_typeof(checks) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mp_finds_maker_is_evidenced') then
    alter table public.mp_finds add constraint mp_finds_maker_is_evidenced
      check (maker_id is null or length(btrim(coalesce(maker_evidence, ''))) > 0);
  end if;
end $$;

-- What a mile costs all in. The trip rule in mp_brief.rules says it in
-- words; this is the number the margin is computed from.
alter table public.mp_brief
  add column if not exists cost_per_mile numeric(6,3) not null default 0.45
    check (cost_per_mile >= 0);

do $$
declare t text;
begin
  foreach t in array array['mp_makers','mp_checks'] loop
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
  end loop;
end $$;

-- ---------------------------------------------------------------
-- mp_band: where a unit price sits on a profile's ladder. One home,
-- so the ledger and the guard cannot disagree.
-- ---------------------------------------------------------------
create or replace function public.mp_band(
  p_unit numeric, p_steal numeric, p_good numeric, p_fair numeric, p_max numeric
) returns text
language sql immutable parallel safe
set search_path = public
as $$
  select case
    when p_unit is null or p_fair is null then null
    when p_unit <= coalesce(p_steal, -1) then 'steal'
    when p_unit <= coalesce(p_good, -1)  then 'good'
    when p_unit <= p_fair                then 'fair'
    when p_unit <= coalesce(p_max, p_fair) then 'high'
    else 'over'
  end;
$$;

-- ---------------------------------------------------------------
-- mp_travel_band: A to D from the brief's bands, by miles where they
-- are known and by minutes otherwise. Null when neither is known -
-- an unknown distance is not band A.
-- ---------------------------------------------------------------
create or replace function public.mp_travel_band(
  p_household uuid, p_miles numeric, p_minutes integer
) returns text
language sql stable
set search_path = public
as $$
  select case
    when p_miles is null and p_minutes is null then null
    else coalesce((
      select b ->> 'band'
        from public.mp_brief m, jsonb_array_elements(m.travel_bands) b
       where m.household_id = p_household
         and case when p_miles is not null then p_miles <= (b ->> 'miles_max')::numeric
                  else p_minutes <= (b ->> 'minutes_max')::numeric end
       order by (b ->> 'miles_max')::numeric
       limit 1), 'beyond')
  end;
$$;

-- ---------------------------------------------------------------
-- mp_unseen_checks: the must-pass checks nobody has answered, as the
-- questions to ask. [{key, question, how, doorstep}]
-- ---------------------------------------------------------------
create or replace function public.mp_unseen_checks(p_profile uuid, p_checks jsonb)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', c.key, 'question', c.question, 'how', c.how, 'doorstep', c.doorstep)
           order by c.sort_order, c.key), '[]'::jsonb)
    from public.mp_checks c
   where c.profile_id = p_profile and c.status = 'active' and c.must_pass
     and coalesce(p_checks -> c.key ->> 'answer', 'unseen') not in ('pass','fail');
$$;

-- ---------------------------------------------------------------
-- mp_grade: A, B, C or X. See the header.
-- ---------------------------------------------------------------
create or replace function public.mp_grade(p_profile uuid, p_checks jsonb, p_maker uuid)
returns text
language sql stable
set search_path = public
as $$
  with c as (
    select ch.must_pass, ch.distinction,
           coalesce(p_checks -> ch.key ->> 'answer', 'unseen') as answer
      from public.mp_checks ch
     where ch.profile_id = p_profile and ch.status = 'active'
  ), s as (
    select count(*) filter (where must_pass)                          as must_total,
           count(*) filter (where must_pass and answer = 'pass')      as must_passed,
           count(*) filter (where must_pass and answer = 'fail')      as must_failed,
           count(*) filter (where distinction)                        as dist_total,
           count(*) filter (where distinction and answer = 'pass')    as dist_passed
      from c
  ), m as (
    select (select k.standing from public.mp_makers k where k.id = p_maker) as standing
  )
  select case
    when m.standing = 'avoid' or s.must_failed > 0 then 'X'
    when p_profile is null then null
    when s.must_total = 0 or s.must_passed < s.must_total then 'C'
    when m.standing = 'seek'
      or (s.dist_total > 0 and s.dist_passed = s.dist_total) then 'A'
    else 'B'
  end
  from s, m;
$$;

comment on function public.mp_grade(uuid, jsonb, uuid) is
  'Quality grade of a find, derived from its answers to the profile''s checks and its maker. A and B are proven; C has a must-pass check unseen (or no checks at all); X has failed one or carries a maker to avoid. Null with no profile.';

-- ---------------------------------------------------------------
-- mp_verdict_refusal: why a verdict is not allowed, or null. Pure, so
-- the page's copy of the rule (engine/marketplace.js) can be proven
-- identical.
-- ---------------------------------------------------------------
create or replace function public.mp_verdict_refusal(
  p_verdict text, p_grade text, p_fit integer, p_band text,
  p_travel_band text, p_doorstep_ok boolean
) returns text
language sql immutable parallel safe
set search_path = public
as $$
  select case
    when p_verdict is null or p_verdict = 'pass' then null
    when p_grade = 'X' then 'grade_x'
    when p_fit <= 2 then 'wrong_for_house'
    when p_verdict = 'watch' then null
    when p_grade is null then 'no_profile'
    when coalesce(p_fit, 0) < 4 then 'fit'
    when p_verdict = 'offer' then null
    when p_grade in ('A','B') then null
    when p_band = 'steal' and p_travel_band = 'A' and coalesce(p_doorstep_ok, false) then null
    else 'unproven'
  end;
$$;

comment on function public.mp_verdict_refusal(text, text, integer, text, text, boolean) is
  'The verdict guard as a code: grade_x and wrong_for_house allow only pass; no_profile, fit and unproven refuse buy (and the first two refuse offer). Null means allowed.';

-- ---------------------------------------------------------------
-- The ledger, with the grade. Columns are listed rather than `f.*` so
-- the new ones append after the old: a view's columns cannot be
-- reordered in place, and this file avoids recreating it.
-- ---------------------------------------------------------------
create or replace view public.mp_find_ledger
with (security_invoker = on) as
select
  f.id, f.household_id, f.profile_id, f.title, f.platform, f.listing_url,
  f.location_text, f.distance_miles, f.drive_minutes, f.seen_on,
  f.asking_price, f.is_ono, f.quantity, f.style_fit, f.what_it_is,
  f.verdict, f.verdict_reason, f.opening_offer, f.max_offer,
  f.status, f.status_note, f.paid, f.travel_cost, f.bought_on, f.work_item_id,
  f.confidence, f.created_at, f.updated_at,
  p.key          as profile_key,
  p.name         as profile_name,
  p.tier,
  p.size_class,
  p.buy_window,
  p.price_steal, p.price_good, p.price_fair, p.price_max, p.price_new,
  p.price_confidence,
  round(f.asking_price / f.quantity, 2)                 as unit_asking,
  case when p.id is null then null
       else public.mp_band(f.asking_price / f.quantity,
              p.price_steal, p.price_good, p.price_fair, p.price_max) end
                                                        as price_band,
  case when f.status = 'bought' and f.asking_price is not null
       then round(f.asking_price - f.paid, 2) end       as haggled_off,
  case when f.status = 'bought' and p.price_fair is not null
       then round(p.price_fair * f.quantity - f.paid - coalesce(f.travel_cost, 0), 2) end
                                                        as saved_vs_fair,
  case when f.status = 'bought' and p.price_new is not null
       then round(p.price_new * f.quantity - f.paid - coalesce(f.travel_cost, 0), 2) end
                                                        as saved_vs_new,
  f.checks, f.maker_id, f.maker_evidence, f.photos_seen, f.is_placeholder, f.ground_id,
  k.name         as maker_name,
  k.standing     as maker_standing,
  g.quality_grade,
  g.unseen_checks,
  g.travel_band,
  public.mp_verdict_refusal(f.verdict, g.quality_grade, f.style_fit,
    case when p.id is null then null
         else public.mp_band(f.asking_price / f.quantity,
                p.price_steal, p.price_good, p.price_fair, p.price_max) end,
    g.travel_band, g.doorstep_ok)                       as verdict_refusal,
  public.mp_verdict_refusal(f.verdict, g.quality_grade, f.style_fit,
    case when p.id is null then null
         else public.mp_band(f.asking_price / f.quantity,
                p.price_steal, p.price_good, p.price_fair, p.price_max) end,
    g.travel_band, g.doorstep_ok) is null               as verdict_stands
from public.mp_finds f
left join public.mp_profiles p on p.id = f.profile_id
left join public.mp_makers k on k.id = f.maker_id
cross join lateral (
  select public.mp_grade(f.profile_id, f.checks, f.maker_id)        as quality_grade,
         u.unseen                                                    as unseen_checks,
         public.mp_travel_band(f.household_id, f.distance_miles, f.drive_minutes) as travel_band,
         (jsonb_array_length(u.unseen) > 0
          and not exists (select 1 from jsonb_array_elements(u.unseen) e
                           where not (e ->> 'doorstep')::boolean))   as doorstep_ok
    from (select public.mp_unseen_checks(f.profile_id, f.checks) as unseen) u
) g;

comment on view public.mp_find_ledger is
  'mp_finds with the price band, the quality grade, the unseen checks as questions, the travel band and the savings - all derived. verdict_stands is false where the typed verdict is no longer allowed by the guard.';

-- ---------------------------------------------------------------
-- The guard itself.
-- ---------------------------------------------------------------
create or replace function public.mp_finds_verdict_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p public.mp_profiles%rowtype;
  v_unseen jsonb;
  v_grade text;
  v_band text;
  v_travel text;
  v_doorstep boolean;
  v_code text;
begin
  if new.verdict is null or new.verdict = 'pass' then return new; end if;
  select * into p from public.mp_profiles where id = new.profile_id;
  v_grade  := public.mp_grade(new.profile_id, new.checks, new.maker_id);
  v_unseen := public.mp_unseen_checks(new.profile_id, new.checks);
  v_band   := case when p.id is null then null
                   else public.mp_band(new.asking_price / new.quantity,
                          p.price_steal, p.price_good, p.price_fair, p.price_max) end;
  v_travel := public.mp_travel_band(new.household_id, new.distance_miles, new.drive_minutes);
  v_doorstep := jsonb_array_length(v_unseen) > 0
    and not exists (select 1 from jsonb_array_elements(v_unseen) e
                     where not (e ->> 'doorstep')::boolean);
  v_code := public.mp_verdict_refusal(new.verdict, v_grade, new.style_fit, v_band, v_travel, v_doorstep);
  if v_code is not null then
    raise exception using errcode = 'check_violation',
      message = format('mp_finds: verdict %s refused (%s) for "%s"', new.verdict, v_code, new.title),
      hint = case v_code
        when 'grade_x' then 'A must-pass check failed or the maker is one to avoid. The only verdict is pass.'
        when 'wrong_for_house' then 'A style fit of 1 or 2 is wrong for the house at any price. The only verdict is pass.'
        when 'no_profile' then 'No profile, so no checks and no grade. Research a profile first.'
        when 'fit' then 'buy and offer need a style fit of 4 or 5. Watch it, or re-score the fit.'
        else 'Grade C: a must-pass check is unseen. Answer the checks, or watch. buy at C is allowed only at the steal price, in travel band A, with every unseen check settled on the doorstep.'
      end;
  end if;
  return new;
end;
$$;

revoke all on function public.mp_finds_verdict_guard() from public, anon, authenticated;

create or replace trigger mp_finds_verdict_guard
  before insert or update of verdict, checks, maker_id, profile_id, style_fit,
                             asking_price, quantity, distance_miles, drive_minutes
  on public.mp_finds
  for each row execute function public.mp_finds_verdict_guard();
