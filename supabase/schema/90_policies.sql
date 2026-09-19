-- ------------------------------------------------------------------
-- 90_policies.sql - Row Level Security.
--
-- This repository is PUBLIC and the front end ships the anon key. That
-- is safe if and only if RLS is enforced on every table, so this file
-- is not optional hardening: it is the whole security model.
--
-- Rules:
--   * Every table gets RLS enabled, in the same change that creates it.
--   * Household-scoped tables allow members only, via
--     is_household_member(household_id) - one helper, one home.
--   * Reference tables (trades, themes, benefit_types, link_kinds,
--     confidence_levels, link_entity_types) are readable by any signed-in
--     user and writable by nobody through the API. They are vocabulary,
--     not data.
--   * There are no DELETE policies on the record tables. Rows close;
--     they do not disappear. The absence of a policy is the enforcement.
-- ------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'households','household_members','confidence_levels','user_profiles',
    'properties','levels','rooms','room_features','storage_locations',
    'building_stages','building_changes',
    'trades','themes','benefit_types','milestones','work_item_templates',
    'work_items','work_notes',
    'link_entity_types','link_kinds','knowledge_links',
    'pots','deposits','allocations','bills','subscriptions','spend_events',
    'price_references','carried_finance','allocation_settings','accounts',
    'assets','asset_parts','asset_faults','inventory_items','consumables',
    'recipes','recipe_ingredients',
    'stock_targets','stock_acquisitions',
    'house_facts','decisions','palettes','contractors','invoices','scheduled_events',
    'estimate_outcomes','learned_factors','learning_runs','insight_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Reference vocabulary: readable by any signed-in user, written only
-- by a migration (which runs as the table owner and bypasses these).
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'confidence_levels','trades','themes','benefit_types',
    'link_entity_types','link_kinds'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_read', t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Identity.
-- ---------------------------------------------------------------
drop policy if exists households_read on public.households;
create policy households_read on public.households
  for select to authenticated using (public.is_household_member(id));

drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

-- A user may always read their own membership row. Without this branch
-- the policy would have to call is_household_member(), which reads this
-- same table - the classic recursive-policy deadlock.
drop policy if exists household_members_read on public.household_members;
create policy household_members_read on public.household_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_household_member(household_id));

drop policy if exists household_members_insert on public.household_members;
create policy household_members_insert on public.household_members
  for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------
-- Household-scoped tables: members may read, insert and update. No
-- delete policy anywhere - see the header.
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'properties','rooms','room_features','storage_locations',
    'building_stages','building_changes',
    'milestones','work_items','work_notes','knowledge_links',
    'pots','deposits','allocations','bills','subscriptions','spend_events',
    'price_references','carried_finance','allocation_settings','accounts',
    'assets','asset_parts','asset_faults','inventory_items','consumables',
    'recipes','recipe_ingredients',
    'stock_targets','stock_acquisitions',
    'house_facts','decisions','palettes','contractors','invoices','scheduled_events',
    'estimate_outcomes','learned_factors','learning_runs','insight_messages'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (public.is_household_member(household_id))', t || '_read', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      || 'with check (public.is_household_member(household_id))', t || '_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated '
      || 'using (public.is_household_member(household_id)) '
      || 'with check (public.is_household_member(household_id))', t || '_update', t);
  end loop;
end $$;

-- levels has no household_id of its own; it is scoped through its
-- property. Written out rather than generated, because the predicate
-- differs and hiding that in the loop above would be a lie.
drop policy if exists levels_read on public.levels;
create policy levels_read on public.levels
  for select to authenticated using (exists (
    select 1 from public.properties p
     where p.id = levels.property_id and public.is_household_member(p.household_id)));

drop policy if exists levels_write on public.levels;
create policy levels_write on public.levels
  for insert to authenticated with check (exists (
    select 1 from public.properties p
     where p.id = levels.property_id and public.is_household_member(p.household_id)));

drop policy if exists levels_update on public.levels;
create policy levels_update on public.levels
  for update to authenticated using (exists (
    select 1 from public.properties p
     where p.id = levels.property_id and public.is_household_member(p.household_id)));

-- work_item_templates are shared, property-agnostic reference work.
drop policy if exists work_item_templates_read on public.work_item_templates;
create policy work_item_templates_read on public.work_item_templates
  for select to authenticated using (true);

-- ---------------------------------------------------------------
-- Grants. anon gets NOTHING: this system has no public surface, and a
-- table reachable by anon is one RLS bug away from being readable.
-- ---------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;

-- Every SECURITY DEFINER function is revoked from anon and granted
-- explicitly. A SECURITY DEFINER function left executable by anon is
-- callable unauthenticated at /rest/v1/rpc/<name> and runs as its
-- owner - which is how a project with correct RLS still leaks.
revoke execute on function public.is_household_member(uuid) from public, anon;
revoke execute on function public.current_household() from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.current_household() to authenticated;

grant execute on function public.house_context(text) to authenticated;
grant execute on function public.find_tool(text) to authenticated;
grant execute on function public.allocation_preview(uuid, numeric) to authenticated;
grant execute on function public.run_deposit_allocation(uuid) to authenticated;
grant execute on function public.recompute_priorities(uuid) to authenticated;
grant execute on function public.reconcile_allocated_balances(uuid) to authenticated;
