-- ------------------------------------------------------------------
-- 30_links.sql - The knowledge graph: typed, dated, owner-confirmed
-- relationships between anything the system knows.
--
-- Why a graph rather than columns. A single job relates to a room, a
-- project, a trade, a set of materials to buy, other jobs it blocks,
-- and fittings elsewhere in the house it has to match. That is six
-- different relationship types on one row, several of them many-to-many.
-- A nullable uuid column per relationship type does not survive contact
-- with that, and a single generic "related_id" column collapses
-- meanings that need telling apart.
--
-- Shape decisions, each with its reason:
--   * POLYMORPHIC, so rooms, assets, inventory, bills and notes join
--     the same graph as work items. "What do I need for the bathroom"
--     has to reach purchases, not just jobs.
--   * BI-TEMPORAL. A link is closed, never deleted, so the graph can
--     answer what was believed and when.
--   * KINDS AS DATA, grouped on the W3C SKOS split between hierarchical
--     and associative relations, which is also where the clash rule
--     below comes from.
-- ------------------------------------------------------------------

-- Postgres cannot foreign-key a polymorphic column, so this registry
-- plus the validation trigger below IS the integrity mechanism: an
-- unknown type key, or one pointing at a row that does not exist, is
-- refused at write time rather than discovered later as a dangling edge.
create table if not exists public.link_entity_types (
  key        text primary key,
  table_name text not null,
  label      text not null,
  sort_order integer not null default 100
);

insert into public.link_entity_types (key, table_name, label, sort_order) values
  ('work_item',        'work_items',        'Work item',        10),
  ('room',             'rooms',             'Room',             20),
  ('storage_location', 'storage_locations', 'Storage location', 30),
  ('asset',            'assets',            'Asset',            40),
  ('inventory_item',   'inventory_items',   'Inventory item',   50),
  ('note',             'work_notes',        'Note',             60),
  ('house_fact',       'house_facts',       'House fact',       70),
  ('decision',         'decisions',         'Decision',         80),
  ('palette',          'palettes',          'Palette',          90),
  ('contractor',       'contractors',       'Contractor',      100),
  ('bill',             'bills',             'Bill',            110),
  -- A stage of the building and one structural change within it. The
  -- geometry lives in the repository; these two rows are what lets the
  -- roadmap point at it.
  ('building_stage',   'building_stages',   'Building version', 120),
  ('building_change',  'building_changes',  'Building change',  130)
on conflict (key) do nothing;

-- The vocabulary, as data so the docs and the tests can be checked
-- against it rather than against someone's memory.
--
-- is_symmetric kinds store ONE row in canonical endpoint order (the
-- trigger enforces it), so a pair can never be recorded twice facing
-- opposite ways. Directional kinds read forward with label and backward
-- with inverse_label; the knowledge_graph view emits both, so no
-- consumer needs to know which way a row was stored.
create table if not exists public.link_kinds (
  key           text primary key,
  label         text not null,
  inverse_label text not null,
  family        text not null
    check (family in ('equivalence','hierarchy','association','sequence','knowledge','spatial')),
  -- Named is_symmetric, not symmetric: SYMMETRIC is a Postgres reserved
  -- word (BETWEEN SYMMETRIC) and an unquoted column of that name is a
  -- syntax error.
  is_symmetric  boolean not null default false,
  description   text not null,
  sort_order    integer not null default 100
);

insert into public.link_kinds
  (key, label, inverse_label, family, is_symmetric, description, sort_order) values
  ('duplicate_of', 'Duplicate of', 'Has duplicate', 'equivalence', false,
   'Same work, recorded twice. The FROM row is the one retired; the constraint below requires it to be dropped.', 10),
  ('supersedes', 'Supersedes', 'Superseded by', 'equivalence', false,
   'The FROM row replaces the TO row: same ground, newer framing.', 20),
  ('part_of', 'Part of', 'Includes', 'hierarchy', false,
   'A component of a coordination row. Unlike parent_id this does NOT roll up onto the roadmap bar, so a shopping list never lights up a project.', 30),
  ('blocks', 'Blocks', 'Blocked by', 'sequence', false,
   'The FROM row must land before the TO row can proceed. Preference, not physics.', 40),
  ('must_precede', 'Must be done before', 'Must follow', 'sequence', false,
   'Physical ordering that cannot be reordered: plaster before paint, first fix before plasterboard. The matcher will not offer the later job while the earlier one is open.', 50),
  ('requires_material', 'Requires', 'Required by', 'association', false,
   'A job needs a purchasable item. This is the join that turns "rewire the bathroom" into a shopping list, and it is why jobs and purchases share one table.', 60),
  ('relates_to', 'Related to', 'Related to', 'association', true,
   'Genuinely distinct but adjacent. The default association; costs nothing to record and it is how the next session learns two pieces of work touch.', 70),
  ('distinct_from', 'Distinct from', 'Distinct from', 'association', true,
   'Adjudicated as NOT the same work. Suppresses the pair from future duplicate candidates; the note carries the reason. An adjudication that is not recorded is one the owner has to make again.', 80),
  ('matches_style', 'Matches', 'Matched by', 'association', true,
   'Fittings or finishes that must stay consistent. Surfaces the whole set when any one of them is being bought.', 90),
  ('installed_in', 'Installed in', 'Contains', 'spatial', false,
   'An asset or fitting physically lives in a room.', 100),
  ('stored_in', 'Stored in', 'Stores', 'spatial', false,
   'An inventory item sits in a storage location.', 110),
  ('about', 'About', 'Described by', 'knowledge', false,
   'A note, decision or fact describes the TO row.', 120),
  ('affects', 'Affects', 'Affected by', 'knowledge', false,
   'Completing the FROM work changed the TO thing. This is what makes "what state is this room actually in" answerable by traversal rather than memory.', 130),
  ('realises', 'Realises', 'Realised by', 'sequence', false,
   'Completing the FROM work item PRODUCES the TO structural change, so the model of the house after it is done becomes the model of the house. The existing kinds do not cover this: affects is past-tense and describes condition rather than creation, and part_of deliberately does not roll up. This is the join that lets the roadmap answer "what is left before the post-extension model is real" by traversal, and lets a quantity measured off the geometry stand behind a job.', 140)
on conflict (key) do nothing;

create table if not exists public.knowledge_links (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_type    text not null references public.link_entity_types (key),
  from_id      uuid not null,
  to_type      text not null references public.link_entity_types (key),
  to_id        uuid not null,
  kind         text not null references public.link_kinds (key),
  -- Why. For distinct_from this is the whole point of the row.
  note         text,
  -- For requires_material: how many of the thing this job needs.
  quantity     numeric(10,2),
  -- Who says this link holds.
  --   proposed  an assistant's suggestion, not yet owner-confirmed
  --   derived   both ends are named in one row the owner already owns,
  --             so the link restates a fact rather than proposing one
  --   confirmed the owner said so
  -- Nothing is ever asserted as confirmed on the assistant's authority.
  confidence   text not null default 'proposed'
    check (confidence in ('proposed','derived','confirmed')),
  -- Bi-temporal: a link is CLOSED, never deleted.
  valid_from   timestamptz not null default now(),
  valid_to     timestamptz,
  superseded_by_id uuid references public.knowledge_links (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint knowledge_links_not_self
    check (not (from_type = to_type and from_id = to_id))
);

-- At most one OPEN link of a given kind between an ordered pair. A
-- closed link does not block re-opening the same judgement later, which
-- is the point of closing rather than deleting.
create unique index if not exists knowledge_links_open_uniq
  on public.knowledge_links (from_type, from_id, to_type, to_id, kind)
  where valid_to is null;

create index if not exists knowledge_links_from_idx
  on public.knowledge_links (from_type, from_id) where valid_to is null;
create index if not exists knowledge_links_to_idx
  on public.knowledge_links (to_type, to_id) where valid_to is null;
create index if not exists knowledge_links_kind_idx
  on public.knowledge_links (household_id, kind) where valid_to is null;

drop trigger if exists knowledge_links_updated_at on public.knowledge_links;
create trigger knowledge_links_updated_at before update on public.knowledge_links
  for each row execute function public.set_updated_at();

-- Invariants. Each is a trigger rather than a convention, because a
-- convention in a document is not a constraint.
--
-- 1. Canonicalise symmetric kinds, so the unique index above cannot
--    hold both A->B and B->A.
-- 2. Validate the polymorphic target against link_entity_types.
-- 3. SKOS clash rule: a pair may not carry both a hierarchical and an
--    associative open link, and duplicate_of excludes distinct_from
--    outright - "the same work" and "adjudicated as not the same work"
--    cannot both hold.
create or replace function public.knowledge_link_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  sym         boolean;
  this_family text;
  tbl         text;
  found       boolean;
  swap_type   text;
  swap_id     uuid;
  clash       text;
begin
  select k.is_symmetric, k.family into sym, this_family
    from public.link_kinds k where k.key = new.kind;

  if sym and (new.from_type, new.from_id) > (new.to_type, new.to_id) then
    swap_type := new.from_type; swap_id := new.from_id;
    new.from_type := new.to_type; new.from_id := new.to_id;
    new.to_type := swap_type;    new.to_id := swap_id;
  end if;

  select t.table_name into tbl from public.link_entity_types t where t.key = new.from_type;
  execute format('select exists (select 1 from public.%I where id = $1)', tbl)
    into found using new.from_id;
  if not found then
    raise exception using errcode = 'foreign_key_violation',
      message = format('knowledge_links.from_id %s is not a row in %s', new.from_id, tbl);
  end if;

  select t.table_name into tbl from public.link_entity_types t where t.key = new.to_type;
  execute format('select exists (select 1 from public.%I where id = $1)', tbl)
    into found using new.to_id;
  if not found then
    raise exception using errcode = 'foreign_key_violation',
      message = format('knowledge_links.to_id %s is not a row in %s', new.to_id, tbl);
  end if;

  if new.valid_to is null then
    select l.kind into clash
      from public.knowledge_links l
      join public.link_kinds k on k.key = l.kind
     where l.valid_to is null
       and l.id is distinct from new.id
       and ((l.from_type = new.from_type and l.from_id = new.from_id
             and l.to_type = new.to_type and l.to_id = new.to_id)
         or (l.from_type = new.to_type and l.from_id = new.to_id
             and l.to_type = new.from_type and l.to_id = new.from_id))
       and (
         (this_family = 'hierarchy' and k.family = 'association')
         or (this_family = 'association' and k.family = 'hierarchy')
         or (new.kind = 'duplicate_of' and l.kind = 'distinct_from')
         or (new.kind = 'distinct_from' and l.kind = 'duplicate_of')
       )
     limit 1;
    if clash is not null then
      raise exception using errcode = 'check_violation',
        message = format('link kind %s clashes with the existing %s link on this pair', new.kind, clash),
        hint = 'A pair cannot be both hierarchical and associative. Close the existing link (set valid_to) before asserting the other.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists knowledge_links_guard on public.knowledge_links;
create trigger knowledge_links_guard before insert or update on public.knowledge_links
  for each row execute function public.knowledge_link_guard();

-- duplicate_of implies the FROM row is retired. Deferred so a merge can
-- set status and write the link in either order within one transaction.
create or replace function public.knowledge_link_duplicate_dropped()
returns trigger
language plpgsql
set search_path = public
as $$
declare st text;
begin
  if new.kind = 'duplicate_of' and new.to_type = 'work_item'
     and new.from_type = 'work_item' and new.valid_to is null then
    select status into st from public.work_items where id = new.from_id;
    if st is distinct from 'dropped' then
      raise exception using errcode = 'check_violation',
        message = format('duplicate_of requires the retired row to be dropped (it is %s)', st),
        hint = 'Set the duplicate to status=dropped with a resolution naming the survivor.';
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists knowledge_links_duplicate_dropped on public.knowledge_links;
create constraint trigger knowledge_links_duplicate_dropped
  after insert or update on public.knowledge_links
  deferrable initially deferred
  for each row execute function public.knowledge_link_duplicate_dropped();

-- Every OPEN link, emitted from BOTH ends with the reading that applies
-- from that end, so a consumer never has to know which way a row was
-- stored. Both branches run for every kind including symmetric ones: a
-- symmetric link is stored once in canonical order, so if only the
-- forward branch emitted it, whichever end sorted second would never
-- see its own relationship. The branches differ in src/dst, so no row
-- is duplicated - they are two directions, not two copies.
drop view if exists public.knowledge_graph;
create view public.knowledge_graph with (security_invoker = on) as
  select l.id, l.household_id,
         l.from_type as src_type, l.from_id as src_id,
         l.to_type as dst_type, l.to_id as dst_id,
         l.kind, k.label as reads, k.family, k.is_symmetric,
         l.note, l.quantity, l.confidence, l.valid_from
    from public.knowledge_links l
    join public.link_kinds k on k.key = l.kind
   where l.valid_to is null
  union all
  select l.id, l.household_id,
         l.to_type, l.to_id, l.from_type, l.from_id,
         l.kind,
         case when k.is_symmetric then k.label else k.inverse_label end,
         k.family, k.is_symmetric,
         l.note, l.quantity, l.confidence, l.valid_from
    from public.knowledge_links l
    join public.link_kinds k on k.key = l.kind
   where l.valid_to is null;

comment on view public.knowledge_graph is
  'Every open knowledge_link, emitted from both endpoints with the reading that applies from that end. One stored row, two readable directions.';
