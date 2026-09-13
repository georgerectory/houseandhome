-- ------------------------------------------------------------------
-- 00_core.sql - Identity, scope and the shared primitives every other
-- domain file depends on.
--
-- Access model: household-scoped. One person today; a partner or family
-- member is added later by inserting a household_members row, with no
-- schema change. is_household_member() is the single helper every RLS
-- policy in this system references, so the scoping rule has one home.
--
-- Security note: every SECURITY DEFINER function here pins search_path
-- and has EXECUTE revoked from anon before being granted to
-- authenticated. A SECURITY DEFINER function left executable by anon is
-- reachable unauthenticated via /rest/v1/rpc/<name>; that is the single
-- most common way a Supabase project leaks, and it is closed by default
-- here rather than audited for later.
-- ------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Shared trigger: keep updated_at honest without per-table code.
-- ---------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------
create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'My Household',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null,
  role         text not null default 'owner'
    check (role in ('owner', 'member', 'viewer')),
  joined_at    timestamptz not null default now(),
  unique (household_id, user_id)
);

create index if not exists household_members_user_idx
  on public.household_members (user_id);

-- The one scoping helper. SECURITY DEFINER so a policy on
-- household_members can call it without recursing into its own policy.
create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members m
     where m.household_id = p_household_id
       and m.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;

-- Resolve the caller's household. Every read path uses this rather than
-- passing an id from the client, so a client cannot ask for someone
-- else's household by guessing a uuid.
create or replace function public.current_household()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.household_id
    from public.household_members m
   where m.user_id = auth.uid()
   order by m.joined_at
   limit 1;
$$;

revoke execute on function public.current_household() from public, anon;
grant execute on function public.current_household() to authenticated;

-- ---------------------------------------------------------------
-- data_confidence: the provenance vocabulary used across every domain
-- that holds a number a decision might rest on.
--
-- This exists because this system is operated through conversation with
-- an assistant that drafts almost everything, and because it inherits a
-- body of figures from an earlier system that have since gone stale.
-- An unconfirmed number must never read, or compute, identically to a
-- checked one.
--
-- Only 'confirmed' and 'actual' may drive a total, a projection or an
-- allocation of real money. The allocation engine enforces this; see
-- 40_money.sql.
-- ---------------------------------------------------------------
create table if not exists public.confidence_levels (
  key         text primary key,
  label       text not null,
  is_trusted  boolean not null,
  description text not null,
  sort_order  integer not null default 100
);

insert into public.confidence_levels (key, label, is_trusted, description, sort_order) values
  ('carried_over', 'Carried over', false,
   'Migrated from an earlier system. Never verified here. Drives nothing.', 10),
  ('drafted',      'Drafted',      false,
   'Written by the assistant and not yet checked by the owner. Drives nothing that matters.', 20),
  ('researched',   'Researched',   false,
   'Backed by a cited price reference or source, but not confirmed by the owner.', 30),
  ('confirmed',    'Confirmed',    true,
   'The owner said so. confirmed_at carries when.', 40),
  ('actual',       'Actual',       true,
   'Observed reality: a real receipt, a real measured duration.', 50)
on conflict (key) do nothing;
