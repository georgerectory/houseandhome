\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- Scoring (93_scoring.sql) on invented data, every expected figure
-- worked out by hand in the comments, so the engine can be trusted.
insert into households (id, name) values ('5c000000-0000-0000-0000-000000000001', 'Scoring house');

insert into ra_listings (id, household_id, code, name, postcode, property_type, beds, floor_area_m2, plot_acres, asking_price, status)
values ('5c100000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 'L01', 'Test House', 'ZZ9 1AA',
        'Detached house', 3, 150, 0.1, 400000, 'chase'),
       ('5c100000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000001', 'L02', 'Semi House', 'ZZ9 1AB',
        'semi-detached', 4, null, 0.6, 300000, 'chase');

insert into listing_facts (household_id, listing_id, attribute, value_text)
values ('5c000000-0000-0000-0000-000000000001', '5c100000-0000-0000-0000-000000000001', 'drainage', 'Mains drainage');

-- The matrix, all house1 or all:
--   C-01 beds:      ideal >= 4, acceptable >= 3, weight 6
--   C-02 type:      ideal detached, never flat or terraced, weight 10, no flex
--   C-03 broadband: ideal >= 300, acceptable >= 30, weight 4 (unknown for L01)
--   C-04 plot:      ideal >= 0.5, acceptable >= 0.25, weight 5, low flex
--   C-05 drainage:  ideal mains, acceptable septic, weight 2
--   C-06 price:     money axis, ideal <= 380k, acceptable <= 420k, weight 9
insert into criteria (household_id, code, scope, axis, grp, label, attribute, scale, ideal_low, ideal_high, ok_low, ok_high,
                      ideal_values, ok_values, never_values, weight, flexibility) values
 ('5c000000-0000-0000-0000-000000000001','C-01','house1','fit','size','Beds','beds','numeric',4,null,3,null,'{}','{}','{}',6,'low'),
 ('5c000000-0000-0000-0000-000000000001','C-02','all','fit','type','Type','property_type','category',null,null,null,null,'{detached}','{}','{flat,terraced}',10,'none'),
 ('5c000000-0000-0000-0000-000000000001','C-03','all','fit','services','Broadband','broadband_down_mbps','numeric',300,null,30,null,'{}','{}','{}',4,'low'),
 ('5c000000-0000-0000-0000-000000000001','C-04','house1','fit','plot','Plot','plot_acres','numeric',0.5,null,0.25,null,'{}','{}','{}',5,'low'),
 ('5c000000-0000-0000-0000-000000000001','C-05','all','fit','services','Drainage','drainage','category',null,null,null,null,'{mains}','{septic}','{}',2,'high'),
 ('5c000000-0000-0000-0000-000000000001','C-06','house1','money','money','Price','asking_price','numeric',null,380000,null,420000,'{}','{}','{}',9,'low'),
 ('5c000000-0000-0000-0000-000000000001','C-07','forever','fit','size','Forever beds','beds','numeric',5,null,4,null,'{}','{}','{}',7,'medium');

-- Three sold comparables for L01 at 2,800, 3,000 and 3,200 per m2, and one
-- small old asking price that the strength rule keeps out of the band.
insert into ra_comparables (household_id, listing_id, address, price, kind, on_date, floor_area_m2, beds) values
 ('5c000000-0000-0000-0000-000000000001','5c100000-0000-0000-0000-000000000001','1 A Road',420000,'sold',current_date - 60,150,3),
 ('5c000000-0000-0000-0000-000000000001','5c100000-0000-0000-0000-000000000001','2 A Road',450000,'sold',current_date - 60,150,3),
 ('5c000000-0000-0000-0000-000000000001','5c100000-0000-0000-0000-000000000001','3 A Road',480000,'sold',current_date - 60,150,3),
 ('5c000000-0000-0000-0000-000000000001','5c100000-0000-0000-0000-000000000001','4 A Road',480000,'sold',current_date - 90,150,3),
 ('5c000000-0000-0000-0000-000000000001','5c100000-0000-0000-0000-000000000001','9 Far Road',100000,'asking',current_date - 2000,40,1);
select refresh_brain_links('5c000000-0000-0000-0000-000000000001');

do $$
declare r jsonb; w jsonb;
begin
  r := brain_score('5c000000-0000-0000-0000-000000000001', 'L01', 'house1');
  -- C-01 beds 3: acceptable, 0.6 + 0.4 x (3-3)/(4-3) = 0.6
  -- C-02 "Detached house" -> detached: ideal, 1
  -- C-03 broadband unknown: excluded
  -- C-04 plot 0.1 < 0.25 acceptable, low flex: FAIL, 0
  -- C-05 "Mains drainage" contains "mains": ideal, 1
  -- fit = (6 x 0.6 + 10 x 1 + 5 x 0 + 2 x 1) / (6 + 10 + 5 + 2) = 15.6 / 23 = 67.8 -> 68
  -- coverage = 23 / 27 = 85.2 -> 85
  if (r->'fit'->>'score')::int <> 68 then perform fail('scoring: fit', 'expected 68, got ' || (r->'fit')::text); end if;
  if (r->'fit'->>'coverage')::int <> 85 then perform fail('scoring: coverage', 'expected 85, got ' || (r->'fit')::text); end if;
  if r->'fit'->'fails' <> '["C-04"]'::jsonb then perform fail('scoring: gate', 'C-04 should fail: ' || (r->'fit')::text); end if;
  if r->'fit'->'unknown' <> '["C-03"]'::jsonb then perform fail('scoring: unknown', (r->'fit')::text); end if;
  select x into w from jsonb_array_elements(r->'working') x where x->>'code' = 'C-01';
  if (w->>'s')::numeric <> 0.6 or w->>'band' <> 'acceptable' then perform fail('scoring: numeric band', w::text); end if;
  -- C-06 price 400k: acceptable, 0.6 + 0.4 x (420 - 400) / (420 - 380) = 0.8 -> money 80
  if (r->'money'->>'score')::int <> 80 then perform fail('scoring: money', 'expected 80, got ' || (r->'money')::text); end if;
  -- C-07 is forever-only: not in a house1 score.
  if exists (select 1 from jsonb_array_elements(r->'working') x where x->>'code' = 'C-07') then
    perform fail('scoring: scope', 'a forever-home criterion was scored for House 1');
  end if;
  perform pass('scoring: fit, coverage, a deal-breaker, an unknown and the money axis, each as worked by hand');
end $$;

do $$
declare r jsonb;
begin
  -- Four sold comparables at 2,800 / 3,000 / 3,200 / 3,200 per m2:
  -- p25 2,950, p50 3,100, p75 3,200; the 40 m2 asking price is too weak
  -- (old, tiny) to count. x 150 m2: 442,500 / 465,000 / 480,000 ->
  -- rounded 443k / 465k / 480k. Asking 400k is below the band.
  r := brain_score('5c000000-0000-0000-0000-000000000001', 'L01', 'house1')->'value';
  if (r->>'n')::int <> 4 then perform fail('scoring: value', 'expected 4 comparables in the band, got ' || r::text); end if;
  if (r->'per_m2'->>'p50')::int <> 3100 or (r->'value'->>'p50')::int <> 465000 then
    perform fail('scoring: value', 'expected 3,100 per m2 and 465k, got ' || r::text);
  end if;
  if r->>'price_position' <> 'below the band' then perform fail('scoring: value', r::text); end if;
  perform pass('scoring: the value band from comparables per m2, weak comparables left out, the price placed against it');
end $$;

do $$
declare r jsonb;
begin
  -- L02 is a semi: "semi-detached" must not match the ideal "detached".
  -- C-02 has no flex, so a semi outside "acceptable" FAILS.
  r := brain_score('5c000000-0000-0000-0000-000000000001', 'L02', 'house1');
  if not (r->'fit'->'fails' @> '["C-02"]'::jsonb) then perform fail('scoring: phrase', 'a semi passed as detached: ' || (r->'fit')::text); end if;
  -- Forever scope: C-07 beds 4 is acceptable (0.6); a semi still fails C-02.
  r := brain_score('5c000000-0000-0000-0000-000000000001', 'L02', 'forever');
  if not exists (select 1 from jsonb_array_elements(r->'working') x where x->>'code' = 'C-07' and (x->>'s')::numeric = 0.6) then
    perform fail('scoring: forever', (r->'working')::text);
  end if;
  if (r->'value'->>'known')::boolean then perform fail('scoring: value', 'L02 has no floor area, so no value: ' || (r->'value')::text); end if;
  if (brain_score('5c000000-0000-0000-0000-000000000001', 'L99', 'house1')->>'found')::boolean then
    perform fail('scoring: unknown ref', 'L99 was found');
  end if;
  perform pass('scoring: a semi is not "detached", scopes stay apart, and a missing floor area says so instead of guessing');
end $$;

do $$
begin
  -- The vocabulary step: free text lands on the matrix's terms.
  if brain_norm_value('heating_system', 'Oil-fired radiators; 6 solar panels') <> 'oil central heating'
     or brain_norm_value('heating_system', 'Multi-fuel burner only; no central heating') <> 'none'
     or brain_norm_value('condition', 'Good order; open fire') <> 'sound'
     or brain_norm_value('condition', 'Renovated throughout by the vendor') <> 'sound'
     or brain_norm_value('condition', 'Mid-20th century; project') <> 'needs renovation'
     or brain_norm_value('condition', 'Dated, scope to improve') <> 'needs modernisation'
     or brain_norm_value('outbuildings', 'Detached stone barn with power') <> 'yes'
     or brain_norm_value('drainage', 'Mains drainage') <> 'mains'
     or brain_norm_value('drainage', 'Unknown; oil hints at off-mains') is not null
     or brain_norm_value('heating_system', 'Not stated') is not null
     or brain_norm_value('listed_or_thatched', 'Not listed; thatch not mentioned') <> 'neither'
     or brain_norm_value('listed_or_thatched', 'Grade II listed, thatched roof') <> 'grade ii and thatched'
     or brain_norm_value('listed_or_thatched', 'Thatched cottage, not listed') <> 'thatched'
     or brain_norm_value('setting', 'Southerly views over garden to paddocks; private plot backing fields') <> 'village near farmland'
     or brain_norm_value('setting', 'Quiet country lane backing farmland') <> 'rural lane'
     or brain_norm_value('setting', 'Town centre, close to shops') <> 'town' then
    perform fail('scoring: vocabulary', 'a free-text value did not map to the matrix vocabulary');
  end if;
  perform pass('scoring: free text maps to the matrix vocabulary, and "unknown" stays unknown');
end $$;

rollback;
