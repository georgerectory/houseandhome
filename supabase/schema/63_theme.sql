-- ------------------------------------------------------------------
-- 63_theme.sql - the specification: what to buy when standing in a shop.
--
-- `palettes` (60_knowledge.sql) was paint-shaped: brand, colour, litres.
-- But the question the owner actually has in a shop is never only about
-- paint. It is which timber, which bulb, which ironmongery, and above
-- all WHICH ONES ARE WRONG. So the table grows into the specification
-- rather than gaining a parallel table beside it, because two
-- mechanisms for one job is the thing this repository does not do.
--
-- It borrows `spec` and `reject_if` from stock_targets deliberately,
-- and for the same reason: a spec you cannot hold a listing up against
-- is not a spec, and half the job is naming what disqualifies a thing.
-- "Warm white" fails. "2700K, CRI 90+, dimmable, reject anything above
-- 3000K or under CRI 90" passes.
--
-- Numbered after 60_knowledge.sql because it alters a table that file
-- creates, and the schema applies in numeric order.
-- ------------------------------------------------------------------

alter table public.palettes
  add column if not exists category text not null default 'paint'
    check (category in ('paint','timber','lighting','metalwork','tile',
                        'stone','textile','glass','plaster','hardware')),
  add column if not exists spec text,
  -- WHY, so a later session inherits the judgement instead of
  -- re-deriving it and quietly choosing differently.
  add column if not exists rationale text,
  -- What disqualifies it. On a lime-plastered solid wall the wrong paint
  -- is not a taste question: a plastic film traps moisture in a wall
  -- that has to breathe, and the damage shows up years later.
  add column if not exists reject_if text,
  -- Lighting, where the whole decision is two numbers nobody prints on
  -- the front of the box.
  add column if not exists kelvin integer
    check (kelvin is null or kelvin between 1800 and 6500),
  add column if not exists cri smallint
    check (cri is null or cri between 0 and 100),
  add column if not exists supplier text,
  add column if not exists unit_cost numeric(10,2),
  add column if not exists unit text,
  add column if not exists status text not null default 'idea'
    check (status in ('idea','shortlisted','chosen','bought','rejected')),
  add column if not exists sort_order integer not null default 100;

comment on column public.palettes.reject_if is
  'What disqualifies a product on sight. Half of a usable spec: without it a stockpile or a scheme becomes a pile of things that nearly match.';

-- The old surface list was written for paint alone.
alter table public.palettes drop constraint if exists palettes_surface_check;
alter table public.palettes add constraint palettes_surface_check
  check (surface in ('wall','ceiling','woodwork','floor','exterior',
                     'metalwork','feature','joinery','lighting','window','hearth'));

create index if not exists palettes_category_idx
  on public.palettes (household_id, category, sort_order);

-- One row per named decision. Soft-unique on the name so a re-seed
-- updates in place instead of leaving two answers to one question.
create unique index if not exists palettes_name_uniq
  on public.palettes (household_id, lower(name));

-- ---------------------------------------------------------------
-- theme_book: the specification, organised by DECISION not by room.
-- SECURITY INVOKER IS NOT OPTIONAL - see 55_stock.sql.
--
-- Organised by category because that is how a shop is organised and how
-- the question arrives. "What paint goes in the back bedroom" is a
-- question you can only answer once; "what paint may touch lime plaster
-- anywhere in this house" is a rule that answers itself every time.
-- ---------------------------------------------------------------
create or replace view public.theme_book
with (security_invoker = on) as
select
  p.id, p.household_id, p.category, p.surface, p.name, p.spec, p.rationale,
  p.reject_if, p.brand, p.colour_name, p.colour_code, p.finish, p.hex,
  p.kelvin, p.cri, p.supplier, p.unit_cost, p.unit, p.status, p.confidence,
  p.notes, p.sort_order,
  r.name as room_name,
  -- A spec is only usable in a shop if it says what to reject too.
  (p.spec is not null and p.reject_if is not null) as is_shoppable,
  p.confidence in ('confirmed','actual') as is_trusted
from public.palettes p
left join public.rooms r on r.id = p.room_id
where p.status <> 'rejected';

comment on view public.theme_book is
  'The specification by decision rather than by room. is_shoppable is false where a row names what to buy but not what to reject, which is the half that keeps a scheme consistent.';
