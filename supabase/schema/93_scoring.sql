-- ------------------------------------------------------------------
-- 93_scoring.sql - scoring a house against the preference matrix
-- (Overhaul Stage 4). SQL, so every Claude - chat or Code - can score a
-- house in one call, with the working shown:
--
--   brain_score(household, ref, scope)  -> fit, money and value for one
--                                          listing, never blended (R-22)
--
-- FIT, per criterion (92_brain.sql holds the matrix):
--   * the listing's value comes from its row (beds, floor area, plot,
--     drive time, condition, type, price) or else its current
--     listing_facts row of the same attribute;
--   * unknown: excluded from the score and counted against coverage -
--     never a fail;
--   * numeric: inside the ideal range scores 1; inside acceptable it
--     falls linearly from 1 at the ideal edge to 0.6 at the acceptable
--     edge (0.6 flat where that side has no acceptable edge);
--   * category: a "never" value FAILS, absolutely; ideal scores 1;
--     acceptable 0.6; matched exactly, or as a whole phrase inside the
--     listing's text;
--   * outside acceptable: FAIL when the flexibility is none or low,
--     FLEXED (scores 0, flagged) when medium or high;
--   * score = sum(weight x s) / sum(weight) over known criteria, 0-100;
--     coverage = known weight / all weight.
--
-- VALUE: price per m2 from the listing's sold and asking comparables
-- with a floor area and a link strength of 0.3 or more (p25/p50/p75),
-- times the listing's floor area; three comparables or fewer fall back
-- to the postcode district's quartiles in market_stats.
--
-- Nothing here writes: a score is computed fresh from the rows on every
-- call. No figure is held in this repository.
-- ------------------------------------------------------------------

create or replace function public.brain_norm_type(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_text is null then null
    when p_text ~* '(flat|apartment|maisonette)' then 'flat'
    when p_text ~* 'new[- ]?build' then 'new-build'
    when p_text ~* 'semi' then 'semi-detached'
    when p_text ~* 'end[- ]?(of[- ]?)?terrace' then 'end-terrace'
    when p_text ~* 'link[- ]?detached' then 'link-detached'
    when p_text ~* 'terrace' then 'terraced'
    when p_text ~* 'detached|bungalow|cottage|farmhouse|house' then 'detached'
    else lower(trim(p_text)) end;
$$;

-- Is the phrase in the text as a whole phrase? "detached" is not in
-- "semi-detached"; "mains" is in "mains drainage".
create or replace function public.brain_phrase_in(p_text text, p_phrase text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(trim(p_text)) = lower(trim(p_phrase))
      or lower(p_text) ~ ('(^|[^a-z0-9-])' || regexp_replace(lower(trim(p_phrase)), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '($|[^a-z0-9-])');
$$;

-- Free text to the matrix's vocabulary, per attribute, so "oil-fired
-- radiators" scores as oil central heating and "unknown; ..." scores as
-- unknown. Each rule is a plain pattern: read it, argue with it.
create or replace function public.brain_norm_value(p_attribute text, p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_text is null or trim(p_text) = '' then null
    when p_text ~* '^\s*(unknown|not found|n/?a|check)\M' then null
    when p_attribute = 'heating_system' then case
      when p_text ~* 'no central heating|^\s*none' then 'none'
      when p_text ~* 'heat pump|ashp|gshp' then 'heat pump'
      when p_text ~* '\moil' then 'oil central heating'
      when p_text ~* '\mlpg' then 'lpg central heating'
      when p_text ~* '\mgas' then 'gas central heating'
      when p_text ~* 'storage heat' then 'storage heaters'
      when p_text ~* 'electric' then 'electric'
      when p_text ~* 'multi-?fuel|wood|solid fuel|log burner' then 'solid fuel'
      else lower(trim(p_text)) end
    when p_attribute = 'condition' then case
      when p_text ~* 'structural(ly)? (unsound|failure)|unsafe' then 'structurally unsound'
      when p_text ~* 'renovated|refurbished|good order|good condition|well presented|immaculate|modernised' then 'sound'
      when p_text ~* 'renovation|refurbishment|project|derelict|uninhabitable|back to brick' then 'needs renovation'
      when p_text ~* 'moderni[sz]|tired|dated|scope to improve|update' then 'needs modernisation'
      when p_text ~* '\msound\M' then 'sound'
      else lower(trim(p_text)) end
    when p_attribute = 'drainage' then case
      when p_text ~* 'mains' then 'mains'
      when p_text ~* 'septic' then 'septic'
      when p_text ~* 'treatment' then 'treatment plant'
      when p_text ~* 'cess' then 'cesspit'
      when p_text ~* 'off-?mains|private' then 'off-mains'
      else lower(trim(p_text)) end
    when p_attribute in ('outbuildings','needs_extension','knotweed','requires_lodger') then case
      when p_text ~* '^\s*(no|none|false)\M' then 'no'
      when p_text ~* '^\s*(yes|true)\M' then 'yes'
      when p_attribute = 'outbuildings' then 'yes'
      else lower(trim(p_text)) end
    else lower(trim(p_text)) end;
$$;

-- One listing's value for one attribute: (number, text, where it came from).
create or replace function public.brain_listing_value(p_listing_id uuid, p_attribute text)
returns table (vnum numeric, vtext text, origin text)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare l public.ra_listings;
begin
  select * into l from public.ra_listings where id = p_listing_id;
  if not found then return; end if;
  if p_attribute = 'beds' and l.beds is not null then
    return query select l.beds::numeric, null::text, 'listing';
  elsif p_attribute = 'floor_area_m2' and l.floor_area_m2 is not null then
    return query select l.floor_area_m2, null::text, 'listing';
  elsif p_attribute = 'plot_acres' and l.plot_acres is not null then
    return query select l.plot_acres, null::text, 'listing';
  elsif p_attribute = 'minutes_from_home' and l.minutes_from_home is not null then
    return query select l.minutes_from_home::numeric, null::text, 'listing';
  elsif p_attribute = 'asking_price' and coalesce(l.asking_price, l.guide_price) is not null then
    return query select coalesce(l.asking_price, l.guide_price), null::text, 'listing';
  elsif p_attribute = 'property_type' and l.property_type is not null then
    return query select null::numeric,
      case when l.detached and public.brain_norm_type(l.property_type) not in ('flat','new-build') then 'detached'
           else public.brain_norm_type(l.property_type) end, 'listing';
  elsif p_attribute = 'requires_lodger' then
    -- A rule about how the owner lives, not a fact about a house: no house needs a lodger.
    return query select null::numeric, 'no'::text, 'plan (C-03: never a lodger)';
  elsif p_attribute = 'condition' and l.condition is not null then
    return query select null::numeric, public.brain_norm_value('condition', l.condition),
      'listing (' || left(l.condition, 60) || ')';
  else
    return query select f.value_num, public.brain_norm_value(p_attribute, f.value_text),
      'fact' || case when f.value_text is not null then ' (' || left(f.value_text, 60) || ')' else '' end
      from public.listing_facts f
     where f.listing_id = p_listing_id and f.attribute = p_attribute and f.status = 'active'
     limit 1;
  end if;
end;
$$;

-- One criterion against one value: {s, band, ...}. band is ideal,
-- acceptable, flexed, fail or unknown.
create or replace function public.brain_criterion_score(c public.criteria, p_num numeric, p_text text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_s numeric; v_band text; v_hit text;
  outside_band text := case when c.flexibility in ('medium','high') then 'flexed' else 'fail' end;
begin
  if c.scale = 'numeric' then
    if p_num is null then
      return jsonb_build_object('s', null, 'band', 'unknown');
    end if;
    if (c.ideal_low is null or p_num >= c.ideal_low) and (c.ideal_high is null or p_num <= c.ideal_high) then
      v_s := 1; v_band := 'ideal';
    elsif (c.ok_low is null or p_num >= c.ok_low) and (c.ok_high is null or p_num <= c.ok_high)
          and (c.ok_low is not null or c.ok_high is not null) then
      v_band := 'acceptable';
      if c.ideal_low is not null and p_num < c.ideal_low then
        v_s := case when c.ok_low is null or c.ideal_low = c.ok_low then 0.6
                    else 0.6 + 0.4 * (p_num - c.ok_low) / (c.ideal_low - c.ok_low) end;
      else
        v_s := case when c.ok_high is null or c.ideal_high is null or c.ideal_high = c.ok_high then 0.6
                    else 0.6 + 0.4 * (c.ok_high - p_num) / (c.ok_high - c.ideal_high) end;
      end if;
    else
      v_s := 0; v_band := outside_band;
    end if;
    return jsonb_build_object('s', round(v_s, 3), 'band', v_band);
  end if;

  -- category and boolean
  if p_text is null or trim(p_text) = '' then
    return jsonb_build_object('s', null, 'band', 'unknown');
  end if;
  select x into v_hit from unnest(c.never_values) x
   where public.brain_phrase_in(p_text, x) limit 1;
  if v_hit is not null then
    return jsonb_build_object('s', 0, 'band', 'fail', 'matched', v_hit, 'never', true);
  end if;
  select x into v_hit from unnest(c.ideal_values) x
   where public.brain_phrase_in(p_text, x) limit 1;
  if v_hit is not null then
    return jsonb_build_object('s', 1, 'band', 'ideal', 'matched', v_hit);
  end if;
  select x into v_hit from unnest(c.ok_values) x
   where public.brain_phrase_in(p_text, x) limit 1;
  if v_hit is not null then
    return jsonb_build_object('s', 0.6, 'band', 'acceptable', 'matched', v_hit);
  end if;
  return jsonb_build_object('s', 0, 'band', outside_band);
end;
$$;

-- The value band for one listing from its comparables (or the area's quartiles).
create or replace function public.brain_value(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  l public.ra_listings; v_area numeric; v_area_from text;
  v_n int; v_p25 numeric; v_p50 numeric; v_p75 numeric; v_method text;
  v_price numeric; v_pos text;
begin
  select * into l from public.ra_listings where id = p_listing_id;
  if not found then return null; end if;
  v_price := coalesce(l.asking_price, l.guide_price);
  v_area := l.floor_area_m2; v_area_from := 'listing';
  if v_area is null then
    select f.value_num, 'fact' into v_area, v_area_from from public.listing_facts f
     where f.listing_id = l.id and f.attribute = 'floor_area_m2' and f.status = 'active' and f.value_num is not null limit 1;
  end if;
  if v_area is null then
    select (split_part(f.value_text, '-', 1)::numeric + split_part(f.value_text, '-', 2)::numeric) / 2, 'fact range midpoint'
      into v_area, v_area_from from public.listing_facts f
     where f.listing_id = l.id and f.attribute = 'floor_area_m2_range' and f.status = 'active'
       and f.value_text ~ '^\s*\d+(\.\d+)?\s*-\s*\d+(\.\d+)?\s*$' limit 1;
  end if;

  select count(*), percentile_cont(0.25) within group (order by c.price / c.floor_area_m2),
         percentile_cont(0.5) within group (order by c.price / c.floor_area_m2),
         percentile_cont(0.75) within group (order by c.price / c.floor_area_m2)
    into v_n, v_p25, v_p50, v_p75
    from public.ra_comparables c
    left join public.knowledge_links k on k.from_type = 'comparable' and k.from_id = c.id and k.to_id = l.id
         and k.kind = 'comparable_for' and k.valid_to is null
   where c.listing_id = l.id and c.floor_area_m2 > 0 and c.price > 0 and c.kind in ('sold','asking','guide')
     and coalesce(k.strength, 0.5) >= 0.3;
  v_method := 'comparables';

  if coalesce(v_n, 0) <= 3 then
    select max(m.value) filter (where m.segment = 'p25'), max(m.value) filter (where m.segment = 'p50'),
           max(m.value) filter (where m.segment = 'p75'), max(m.n)
      into v_p25, v_p50, v_p75, v_n
      from public.market_stats m join public.places p on p.id = m.place_id
     where p.household_id = l.household_id and m.metric = 'median_price_m2'
       and p.key = lower(regexp_replace(split_part(coalesce(l.postcode, ''), ' ', 1), '[^A-Za-z0-9]', '', 'g'))
       and m.period = (select max(m2.period) from public.market_stats m2 where m2.place_id = p.id and m2.metric = 'median_price_m2');
    v_method := 'area quartiles (' || coalesce(split_part(l.postcode, ' ', 1), '?') || ')';
  end if;

  if v_area is null or v_p50 is null then
    return jsonb_build_object('known', false, 'price', v_price, 'floor_area_m2', v_area,
      'per_m2', jsonb_build_object('p25', round(v_p25), 'p50', round(v_p50), 'p75', round(v_p75)), 'n', v_n, 'method', v_method,
      'missing', case when v_area is null then 'floor area' else 'comparables with floor areas' end);
  end if;
  v_pos := case when v_price is null then 'no price'
                when v_price < v_area * coalesce(v_p25, v_p50) then 'below the band'
                when v_price > v_area * coalesce(v_p75, v_p50) then 'above the band'
                else 'within the band' end;
  return jsonb_build_object('known', true, 'price', v_price, 'floor_area_m2', v_area, 'area_from', v_area_from,
    'per_m2', jsonb_build_object('p25', round(v_p25), 'p50', round(v_p50), 'p75', round(v_p75)),
    'value', jsonb_build_object('p25', round(v_area * coalesce(v_p25, v_p50), -3), 'p50', round(v_area * v_p50, -3),
                                'p75', round(v_area * coalesce(v_p75, v_p50), -3)),
    'n', v_n, 'method', v_method, 'price_position', v_pos,
    'price_per_m2', case when v_price is not null then round(v_price / v_area) end);
end;
$$;

-- Fit, money and value for one listing against one scope's criteria.
create or replace function public.brain_score(p_household_id uuid, p_ref text, p_scope text default 'house1')
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  l public.ra_listings; v_rows jsonb := '[]'::jsonb; r public.criteria; v_val record; v_sc jsonb;
  v_axis jsonb := '{}'::jsonb; v_out jsonb; v_fit jsonb; v_money jsonb;
begin
  if p_scope not in ('house1','forever') then
    raise exception using errcode = 'invalid_parameter_value', message = 'scope is house1 or forever';
  end if;
  select * into l from public.ra_listings where household_id = p_household_id and code = p_ref;
  if not found then
    return jsonb_build_object('ref', p_ref, 'found', false, 'hint', 'A listing code such as L55.');
  end if;

  for r in select c.* from public.criteria c
            where c.household_id = p_household_id and c.status = 'active' and c.scope in ('all', p_scope)
            order by c.axis, c.weight desc, c.code loop
    select * into v_val from public.brain_listing_value(l.id, r.attribute);
    v_sc := public.brain_criterion_score(r, v_val.vnum, v_val.vtext);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('code', r.code, 'axis', r.axis, 'label', r.label, 'weight', r.weight,
      'flex', r.flexibility, 'confirmed', r.confidence = 'confirmed', 'attribute', r.attribute,
      'value', coalesce(v_val.vnum::text, v_val.vtext), 'from', v_val.origin) || v_sc);
  end loop;

  select jsonb_object_agg(a.axis, a.j) into v_axis from (
    select x->>'axis' axis, jsonb_build_object(
      'score', case when sum((x->>'weight')::numeric) filter (where x->>'band' <> 'unknown') > 0
                    then round(100 * sum((x->>'weight')::numeric * (x->>'s')::numeric) filter (where x->>'band' <> 'unknown')
                                   / sum((x->>'weight')::numeric) filter (where x->>'band' <> 'unknown')) end,
      'coverage', case when sum((x->>'weight')::numeric) > 0
                       then round(100 * coalesce(sum((x->>'weight')::numeric) filter (where x->>'band' <> 'unknown'), 0)
                                      / sum((x->>'weight')::numeric)) end,
      'fails', coalesce(jsonb_agg(x->>'code') filter (where x->>'band' = 'fail'), '[]'::jsonb),
      'flexed', coalesce(jsonb_agg(x->>'code') filter (where x->>'band' = 'flexed'), '[]'::jsonb),
      'unknown', coalesce(jsonb_agg(x->>'code' order by (x->>'weight')::int desc) filter (where x->>'band' = 'unknown'), '[]'::jsonb),
      'unconfirmed_criteria', count(*) filter (where not (x->>'confirmed')::boolean)) j
    from jsonb_array_elements(v_rows) x group by x->>'axis') a;

  v_fit := coalesce(v_axis->'fit', '{}'::jsonb);
  v_money := coalesce(v_axis->'money', '{}'::jsonb);
  v_out := jsonb_build_object('ref', l.code, 'name', l.name, 'scope', p_scope, 'found', true,
    'fit', v_fit, 'money', v_money, 'value', public.brain_value(l.id),
    'working', v_rows);
  return v_out || jsonb_build_object('verdict',
    l.code || ' (' || p_scope || '): fit ' || coalesce((v_fit->>'score'), '?') || ' (coverage ' || coalesce(v_fit->>'coverage', '?') || '%)'
    || case when jsonb_array_length(coalesce(v_fit->'fails', '[]')) > 0 then ', FAILS ' || (select string_agg(e, ', ') from jsonb_array_elements_text(v_fit->'fails') e) else '' end
    || case when jsonb_array_length(coalesce(v_fit->'flexed', '[]')) > 0 then ', flexed ' || (select string_agg(e, ', ') from jsonb_array_elements_text(v_fit->'flexed') e) else '' end
    || '; money ' || coalesce(v_money->>'score', '?') || ' (coverage ' || coalesce(v_money->>'coverage', '?') || '%)'
    || case when jsonb_array_length(coalesce(v_money->'fails', '[]')) > 0 then ', FAILS ' || (select string_agg(e, ', ') from jsonb_array_elements_text(v_money->'fails') e) else '' end
    || '; value ' || coalesce((v_out->'value'->>'price_position'), 'unknown: ' || coalesce(v_out->'value'->>'missing', '?'))
    || '. Unknowns that matter most: ' || coalesce((select string_agg(e, ', ') from (select jsonb_array_elements_text(v_fit->'unknown') e limit 3) t), 'none') || '.');
end;
$$;

grant execute on function public.brain_score(uuid, text, text) to authenticated;
grant execute on function public.brain_value(uuid) to authenticated;
grant execute on function public.brain_listing_value(uuid, text) to authenticated;
