\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- The brain's knowledge layer (92_brain.sql), on invented data: one call
-- returns everything about a house, links carry a strength the engine can
-- explain, search finds a thing by its words, and another household sees
-- none of it.
insert into households (id, name) values
  ('b0000000-0000-0000-0000-000000000001','Brain A'),
  ('b0000000-0000-0000-0000-000000000002','Brain B');
insert into household_members (household_id, user_id) values
  ('b0000000-0000-0000-0000-000000000001','b0000000-1111-1111-1111-111111111111'),
  ('b0000000-0000-0000-0000-000000000002','b0000000-2222-2222-2222-222222222222');

insert into ra_listings (id, household_id, code, name, postcode, property_type, beds, floor_area_m2, asking_price, status, notes)
values ('b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','L01',
        'Mill House, Upton','ZZ1 1AA','detached',4,150,400000,'chase','Thatched roof, septic tank');

insert into sources (id, household_id, key, kind, title, url, retrieved_on) values
  ('b2000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',
   'url:https://example.org/epc/1','government','EPC register','https://example.org/epc/1', date '2026-11-01');

insert into listing_facts (household_id, listing_id, attribute, value_text, source_id, label)
values ('b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','epc_rating','E',
        'b2000000-0000-0000-0000-000000000001','VERIFIED');

-- Two comparables: a recent sold house of the same size, and an old
-- asking price for a much smaller one. The first must bear harder.
insert into ra_comparables (id, household_id, listing_id, address, price, kind, on_date, beds, floor_area_m2) values
  ('b3000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001',
   '1 Near Lane', 410000, 'sold', current_date - 60, 4, 148),
  ('b3000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001',
   '9 Far Road', 300000, 'asking', current_date - 1200, 2, 70);

insert into ra_evidence (household_id, code, topic, claim, figure, source, used_in) values
  ('b0000000-0000-0000-0000-000000000001','E01','house: Mill House','The septic tank was replaced in 2019','2019','agent | 2026-11-01 | VERIFIED','L01'),
  ('b0000000-0000-0000-0000-000000000001','E02','market','Village prices fell last year','-5%','index | CHECK','West');

insert into ra_signals (household_id, code, kind, words, said_on, status)
values ('b0000000-0000-0000-0000-000000000001','S-01','reaction','L01 looks lovely but the road worries me', current_date, 'active');

do $$
declare r jsonb; strong numeric; weak numeric;
begin
  r := refresh_brain_links('b0000000-0000-0000-0000-000000000001');
  if (r->>'comparable_for')::int <> 2 then perform fail('brain: links', 'expected 2 comparable links, got ' || r::text); end if;
  if (r->>'evidence_for')::int < 1 then perform fail('brain: links', 'no evidence link from used_in, got ' || r::text); end if;
  select strength into strong from knowledge_links where from_id = 'b3000000-0000-0000-0000-000000000001';
  select strength into weak from knowledge_links where from_id = 'b3000000-0000-0000-0000-000000000002';
  if not (strong > 0.8 and weak < 0.3 and strong > weak) then
    perform fail('brain: links', format('strengths not ordered: near %s, far %s', strong, weak));
  end if;
  -- Re-running is idempotent and never duplicates a link.
  perform refresh_brain_links('b0000000-0000-0000-0000-000000000001');
  if (select count(*) from knowledge_links where to_id = 'b1000000-0000-0000-0000-000000000001' and kind = 'comparable_for') <> 2 then
    perform fail('brain: links', 'a second refresh duplicated links');
  end if;
  perform pass('brain: comparable and evidence links carry a strength, strongest for the closest sale, and refresh is idempotent');
end $$;

do $$
declare r jsonb;
begin
  r := brain_about('b0000000-0000-0000-0000-000000000001', 'L01');
  if not (r->>'found')::boolean then perform fail('brain: about', 'L01 not found'); end if;
  if jsonb_array_length(r->'facts') <> 1 or r->'facts'->0->>'url' is null then
    perform fail('brain: about', 'the EPC fact or its source is missing: ' || (r->'facts')::text);
  end if;
  if jsonb_array_length(r->'comparables') <> 2 or r->'comparables'->0->>'address' <> '1 Near Lane' then
    perform fail('brain: about', 'comparables missing or not strongest-first: ' || (r->'comparables')::text);
  end if;
  if jsonb_array_length(r->'evidence') <> 1 then perform fail('brain: about', 'evidence: ' || (r->'evidence')::text); end if;
  if jsonb_array_length(r->'signals') <> 1 then perform fail('brain: about', 'signals: ' || (r->'signals')::text); end if;
  r := brain_about('b0000000-0000-0000-0000-000000000001', 'S-01');
  if r->>'type' <> 'signal' or r->'detail'->>'words' is null then perform fail('brain: about', 'a signal ref: ' || r::text); end if;
  r := brain_about('b0000000-0000-0000-0000-000000000001', 'nothing-like-this');
  if (r->>'found')::boolean then perform fail('brain: about', 'an unknown ref was found'); end if;
  perform pass('brain: brain_about returns a house''s facts with sources, comparables by strength, evidence and signals');
end $$;

do $$
declare n int; c jsonb;
begin
  select count(*) into n from brain_search('b0000000-0000-0000-0000-000000000001', 'septic') where ref in ('L01','E01');
  if n < 2 then perform fail('brain: search', 'septic should find L01 and E01, found ' || n); end if;
  if (select ref from brain_search('b0000000-0000-0000-0000-000000000001', 'Mill House') limit 1) <> 'L01' then
    perform fail('brain: search', 'a house name did not rank its listing first');
  end if;
  c := brain_context('b0000000-0000-0000-0000-000000000001');
  if c->>'mode' <> 'search' or jsonb_array_length(c->'lead_listings') <> 1 then
    perform fail('brain: context', c::text);
  end if;
  perform pass('brain: search finds a thing by its words, and the context says search mode with the lead house');
end $$;

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant usage on schema extensions to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = 'b0000000-2222-2222-2222-222222222222';
do $$
begin
  if exists (select 1 from listing_facts) or exists (select 1 from sources)
     or exists (select 1 from brain_entities where household_id = 'b0000000-0000-0000-0000-000000000001') then
    perform fail('brain: isolation', 'household B can read household A''s knowledge');
  end if;
  if (brain_about('b0000000-0000-0000-0000-000000000001', 'L01')->>'found')::boolean then
    perform fail('brain: isolation', 'brain_about leaked a house across households');
  end if;
  begin
    insert into listing_facts (household_id, listing_id, attribute, value_text)
    values ('b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','drainage','mains');
    perform fail('brain: isolation', 'household B wrote a fact into household A');
  exception when insufficient_privilege then null;
  end;
  perform pass('brain: another household sees, finds and writes nothing');
end $$;
reset role;

rollback;
