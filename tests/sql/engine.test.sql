\set ON_ERROR_STOP on
\pset pager off
begin;

create or replace function pass(t text) returns void language plpgsql as $$
begin raise notice 'PASS %', t; end $$;
create or replace function fail(t text, d text) returns void language plpgsql as $$
begin raise exception 'FAIL % : %', t, d; end $$;

-- ---- fixture -------------------------------------------------------
insert into households (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Test House');

insert into properties (id, household_id, name, status, is_active) values
  ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Test Property','owned',true);

insert into rooms (id, household_id, property_id, key, name, room_type, room_weight) values
  ('33333333-3333-3333-3333-333333333331','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','bathroom','Bathroom','bathroom',5),
  ('33333333-3333-3333-3333-333333333332','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','office','Office','office',2);

insert into room_features (household_id, room_id, feature_type, quantity, spec) values
  ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333331','light_switch',1,'single gang, pull cord');

-- 20 items across a spread of priorities, mirroring a real backlog.
insert into work_items (id, household_id, room_id, title, kind, trade, theme, benefit_type,
                        house_benefit, benefit_status, cost_expected, cost_confidence, status)
select ('44444444-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,
       '11111111-1111-1111-1111-111111111111',
       (case when g % 2 = 0 then '33333333-3333-3333-3333-333333333331'
                            else '33333333-3333-3333-3333-333333333332' end)::uuid,
       'Item '||g,
       case when g % 5 = 0 then 'purchase' else 'renovation' end,
       case when g % 3 = 0 then 'electrical' else 'decorating' end,
       case when g <= 4 then 'make_safe' when g <= 10 then 'make_warm' else 'cosmetic' end,
       case when g <= 4 then 'safety' when g <= 10 then 'running_cost' else 'enjoyment' end,
       'Drafted benefit for item '||g, 'drafted',
       (g * 37)::numeric, 'confirmed', 'planned'
  from generate_series(1,20) g;

-- ---- priority ------------------------------------------------------
select recompute_priorities('11111111-1111-1111-1111-111111111111');

do $$
declare top_title text; top_score int; bottom_score int; dupes int;
begin
  select title, priority_score into top_title, top_score
    from work_items where priority = 1;
  select min(priority_score) into bottom_score from work_items;
  select count(*) into dupes from (
    select priority from work_items group by priority having count(*) > 1) d;

  if top_score <= bottom_score then perform fail('priority ordering','top score not highest'); end if;
  if dupes > 0 then perform fail('priority uniqueness', dupes||' duplicate ranks'); end if;
  -- A make_safe/safety item in the bathroom (weight 5) must outrank a
  -- cosmetic/enjoyment item in the office (weight 2).
  if (select priority from work_items where title='Item 2')
     >= (select priority from work_items where title='Item 19') then
    perform fail('priority semantics','safety in a key room did not outrank cosmetic in a minor one');
  end if;
  perform pass('priority: computed, unique, house-logical (top='||top_title||' score='||top_score||')');
end $$;

do $$
declare ex jsonb;
begin
  select priority_explain into ex from work_items where priority = 1;
  if ex->>'base' is null or ex->>'room_weight' is null then
    perform fail('priority explain','explain payload incomplete');
  end if;
  perform pass('priority: explains itself '||ex::text);
end $$;

-- ---- allocation ----------------------------------------------------
insert into pots (id, household_id, name, monthly_contribution, contribution_confidence)
values ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','House pot',500,'drafted');

-- The engine must REFUSE while the contribution figure is unconfirmed.
insert into deposits (id, household_id, pot_id, amount)
values ('66666666-6666-6666-6666-666666666661','11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555',500);

do $$
begin
  begin
    perform run_deposit_allocation('66666666-6666-6666-6666-666666666661');
    perform fail('unconfirmed guard','allocation ran against an unconfirmed contribution');
  exception when check_violation then
    perform pass('unconfirmed guard: refused to allocate against unconfirmed contribution');
  end;
end $$;

update pots set contribution_confidence = 'confirmed'
 where id = '55555555-5555-5555-5555-555555555555';

do $$
declare n int; total numeric; minamt numeric; zero_count int;
begin
  n := run_deposit_allocation('66666666-6666-6666-6666-666666666661');
  if n <> 20 then perform fail('allocation coverage', 'allocated to '||n||' items, expected 20'); end if;

  select sum(amount), min(amount), count(*) filter (where amount <= 0)
    into total, minamt, zero_count
    from allocations where deposit_id = '66666666-6666-6666-6666-666666666661';

  if total <> 500 then perform fail('allocation settlement','sum was '||total||', expected exactly 500'); end if;
  if zero_count > 0 then perform fail('nothing starves', zero_count||' items received zero'); end if;
  perform pass('allocation: 20/20 items funded, sum exactly '||total||', smallest share '||minamt);
end $$;

-- Priority must drive share, not cost: rank 1 gets more than rank 20
-- even though the costs run the other way.
do $$
declare a1 numeric; a20 numeric;
begin
  select a.amount into a1 from allocations a where a.rank_at_run = 1;
  select a.amount into a20 from allocations a where a.rank_at_run = 20;
  if a1 <= a20 then perform fail('priority drives share','rank 1 got '||a1||', rank 20 got '||a20); end if;
  perform pass('allocation: priority drives magnitude (rank1='||a1||' > rank20='||a20||')');
end $$;

-- Re-running the same deposit must be refused: the ledger is append-only.
do $$
begin
  begin
    perform run_deposit_allocation('66666666-6666-6666-6666-666666666661');
    perform fail('double allocation','same deposit allocated twice');
  exception when check_violation then
    perform pass('allocation: refuses to re-run an already-allocated deposit');
  end;
end $$;

-- Balances cached on the item must match the ledger exactly.
do $$
declare drift int;
begin
  drift := reconcile_allocated_balances('11111111-1111-1111-1111-111111111111');
  if drift <> 0 then perform fail('balance cache', drift||' rows drifted from the ledger'); end if;
  perform pass('allocation: cached balances match the ledger (0 drift)');
end $$;

-- Snowball: close the top item, next deposit re-proportions upward.
do $$
declare before_share numeric; after_share numeric; id2 uuid;
begin
  select a.work_item_id into id2 from allocations a where a.rank_at_run = 2;
  select a.amount into before_share from allocations a where a.rank_at_run = 2;

  update work_items set status='done', resolution='test close'
   where id = (select a.work_item_id from allocations a where a.rank_at_run = 1);
  perform recompute_priorities('11111111-1111-1111-1111-111111111111');

  insert into deposits (id, household_id, pot_id, amount)
  values ('66666666-6666-6666-6666-666666666662','11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555',500);
  perform run_deposit_allocation('66666666-6666-6666-6666-666666666662');

  select a.amount into after_share from allocations a
   where a.deposit_id = '66666666-6666-6666-6666-666666666662' and a.work_item_id = id2;

  if after_share <= before_share then
    perform fail('snowball','share did not increase after the item above closed ('||before_share||' -> '||after_share||')');
  end if;
  perform pass('allocation: snowball works ('||before_share||' -> '||after_share||' after the item above closed)');
end $$;

-- A newly added item joins the next run automatically.
do $$
declare n int;
begin
  insert into work_items (household_id, title, kind, theme, benefit_type, cost_expected, cost_confidence, status)
  values ('11111111-1111-1111-1111-111111111111','Late addition','purchase','storage','time_saved',80,'confirmed','planned');
  perform recompute_priorities('11111111-1111-1111-1111-111111111111');

  insert into deposits (id, household_id, pot_id, amount)
  values ('66666666-6666-6666-6666-666666666663','11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555',500);
  n := run_deposit_allocation('66666666-6666-6666-6666-666666666663');

  if not exists (select 1 from allocations a join work_items w on w.id=a.work_item_id
                  where a.deposit_id='66666666-6666-6666-6666-666666666663' and w.title='Late addition') then
    perform fail('adaptive','a newly added item did not receive a share');
  end if;
  perform pass('allocation: an item added mid-stream is funded on the next deposit ('||n||' items)');
end $$;

-- ---- guards --------------------------------------------------------
do $$
begin
  begin
    delete from work_items where title = 'Item 7';
    perform fail('delete guard','a work item was deleted');
  exception when restrict_violation then
    perform pass('delete guard: refuses to delete a work item');
  end;
end $$;

do $$
begin
  set local house.allow_work_item_delete = 'on';
  delete from work_items where title = 'Item 7';
  perform pass('delete guard: explicit opt-in allows a deliberate cleanup');
  set local house.allow_work_item_delete = 'off';
end $$;

do $$
begin
  begin
    insert into work_items (household_id, title, house_benefit)
    values ('11111111-1111-1111-1111-111111111111','No benefit status','some benefit');
    perform fail('benefit status','a benefit was stored without its checked state');
  exception when check_violation then
    perform pass('R4: a stored benefit must carry drafted/confirmed state');
  end;
end $$;

-- ---- knowledge graph ----------------------------------------------
do $$
declare j uuid; m uuid; hallway_switch uuid; found int;
begin
  select id into j from work_items where title='Item 2';
  insert into work_items (id, household_id, room_id, title, kind, trade, theme, benefit_type,
                          house_benefit, benefit_status, cost_expected, cost_confidence)
  values ('77777777-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
          '33333333-3333-3333-3333-333333333331','Bathroom light switch','purchase','electrical',
          'systems_tech','safety','Needed for the bathroom rewire','drafted',12,'researched')
  returning id into m;

  insert into work_items (id, household_id, room_id, title, kind, trade, theme, benefit_type,
                          house_benefit, benefit_status, cost_expected, cost_confidence)
  values ('77777777-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',
          '33333333-3333-3333-3333-333333333332','Hallway light switch','purchase','electrical',
          'systems_tech','comfort','Matching switch elsewhere','drafted',12,'researched')
  returning id into hallway_switch;

  insert into knowledge_links (household_id, from_type, from_id, to_type, to_id, kind, quantity, confidence)
  values ('11111111-1111-1111-1111-111111111111','work_item',j,'work_item',m,'requires_material',1,'confirmed');
  insert into knowledge_links (household_id, from_type, from_id, to_type, to_id, kind, confidence)
  values ('11111111-1111-1111-1111-111111111111','work_item',m,'work_item',hallway_switch,'matches_style','confirmed');

  -- The bathroom shopping trip: traverse room -> jobs -> materials -> style matches.
  select count(*) into found from (
    select g.dst_id from knowledge_graph g
     where g.src_id = j and g.kind = 'requires_material'
    union
    select g2.dst_id from knowledge_graph g2
     where g2.src_id = m and g2.kind = 'matches_style'
  ) x;
  if found < 2 then perform fail('graph traversal','bathroom trip found '||found||' items, expected 2'); end if;
  perform pass('graph: bathroom job -> required material -> matching switch elsewhere ('||found||' items)');
end $$;

do $$
declare a uuid; b uuid;
begin
  select id into a from work_items where title='Item 3';
  select id into b from work_items where title='Item 4';
  insert into knowledge_links (household_id, from_type, from_id, to_type, to_id, kind, confidence)
  values ('11111111-1111-1111-1111-111111111111','work_item',a,'work_item',b,'relates_to','confirmed');
  begin
    insert into knowledge_links (household_id, from_type, from_id, to_type, to_id, kind, confidence)
    values ('11111111-1111-1111-1111-111111111111','work_item',b,'work_item',a,'part_of','proposed');
    perform fail('SKOS clash','hierarchical and associative links coexist on one pair');
  exception when check_violation then
    perform pass('graph: SKOS clash rule blocks hierarchy+association on one pair');
  end;
end $$;

do $$
declare a uuid; b uuid;
begin
  select id into a from work_items where title='Item 9';
  select id into b from work_items where title='Item 10';
  -- The trigger is DEFERRED on purpose, so a merge can set status and
  -- write the link in either order within one transaction. Forcing it
  -- immediate is how the guard is exercised without committing.
  begin
    insert into knowledge_links (household_id, from_type, from_id, to_type, to_id, kind, confidence)
    values ('11111111-1111-1111-1111-111111111111','work_item',a,'work_item',b,'duplicate_of','confirmed');
    set constraints all immediate;
    perform fail('duplicate_of guard','a live row was marked duplicate without being dropped');
  exception when check_violation then
    perform pass('graph: duplicate_of requires the retired row to be dropped');
  end;
  set constraints all deferred;

  -- And the legitimate path: drop the row first, then the link is fine.
  update work_items set status='dropped', resolution='Duplicate: merged into Item 10' where id=a;
  insert into knowledge_links (household_id, from_type, from_id, to_type, to_id, kind, note, confidence)
  values ('11111111-1111-1111-1111-111111111111','work_item',a,'work_item',b,'duplicate_of','Same work, raised twice.','confirmed');
  set constraints all immediate;
  perform pass('graph: duplicate_of accepted once the retired row is dropped');
  set constraints all deferred;
end $$;

do $$
declare c1 int; c2 int;
begin
  select count(*) into c1 from knowledge_graph where src_id=(select id from work_items where title='Item 3');
  select count(*) into c2 from knowledge_graph where src_id=(select id from work_items where title='Item 4');
  if c1 = 0 or c2 = 0 then perform fail('symmetric links','a symmetric link is invisible from one end'); end if;
  perform pass('graph: symmetric links readable from both ends');
end $$;

do $$
begin
  begin
    insert into knowledge_links (household_id, from_type, from_id, to_type, to_id, kind)
    values ('11111111-1111-1111-1111-111111111111','work_item','00000000-0000-0000-0000-0000000000ff',
            'work_item',(select id from work_items limit 1),'relates_to');
    perform fail('polymorphic integrity','a link to a non-existent row was accepted');
  exception when foreign_key_violation then
    perform pass('graph: polymorphic endpoints validated at write time');
  end;
end $$;

rollback;
