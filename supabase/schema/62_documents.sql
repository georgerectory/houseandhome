-- ------------------------------------------------------------------
-- 62_documents.sql - a document, as data.
--
-- NUMBERED AFTER 60_knowledge.sql DELIBERATELY. `document_claims` has a
-- foreign key to `house_facts`, which that file creates, and the schema
-- applies in numeric order. As 58 this file referenced a table that did
-- not exist yet: it applied cleanly against the live database, where
-- house_facts was already there, and failed against an empty Postgres -
-- which is exactly the failure the SQL gate exists to catch.
--
-- WHY THIS IS NOT A BLOB. The 54-page handbook holds the cost plan, the
-- quote tracker, the assumptions register, the month-by-month year one
-- and the viewing checklist. As a PDF none of it is queryable, none of
-- it reaches the roadmap, and all of it goes stale the moment anything
-- changes - silently, in somebody's downloads folder.
--
-- The important table is `document_claims`. Sections make the document
-- READABLE; claims make it ACTIONABLE, because a cost-plan line becomes
-- a row that points at the work item it prices. That join is the whole
-- reason for the exercise: without it this is a nicer way to read a PDF
-- and nothing more.
--
-- PRIVACY. The repository is public and this document carries the
-- address, the floor plans, the condition photographs and the full
-- financial position. So the text lives here, behind RLS, and never in
-- the repo - the same rule that gitignores data/buildings/*/sources/.
-- ------------------------------------------------------------------

create table if not exists public.source_documents (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  property_id   uuid references public.properties (id) on delete set null,
  title         text not null,
  kind          text not null default 'handbook'
    check (kind in ('handbook','survey','quote','certificate','plan','report','other')),
  -- WHEN IT WAS TRUE. A document is a snapshot of what was believed on
  -- a date, and every figure in it inherits that date. Without this a
  -- two-year-old cost plan reads exactly like this morning's.
  as_of         date not null,
  author        text,
  page_count    integer check (page_count is null or page_count > 0),
  -- The file itself is NOT stored. It identifies the property and the
  -- owner's finances, and a checksum is enough to say whether the copy
  -- somebody is holding is the one that was ingested.
  source_sha256 text,
  source_note   text,
  status        text not null default 'current'
    check (status in ('current','superseded','withdrawn')),
  superseded_by_id uuid references public.source_documents (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.document_sections (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  document_id   uuid not null references public.source_documents (id) on delete cascade,
  part          text,
  number        text,
  title         text not null,
  -- The one-line summary the handbook itself puts under every heading.
  lede          text,
  body          text,
  page_from     integer not null,
  page_to       integer,
  sort_order    integer not null default 100,
  -- A section is `researched` at best: it is a real source, written by
  -- somebody, and not verified here.
  confidence    text not null default 'researched' references public.confidence_levels (key),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- The natural key, so re-ingesting the same document updates in place
  -- instead of leaving a second copy. Same discipline as the carry-over
  -- protocol's rule 3.
  unique (document_id, page_from, sort_order)
);

create index if not exists document_sections_doc_idx
  on public.document_sections (document_id, sort_order);

create table if not exists public.document_figures (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  document_id   uuid not null references public.source_documents (id) on delete cascade,
  section_id    uuid references public.document_sections (id) on delete set null,
  page          integer not null,
  caption       text,
  kind          text not null default 'diagram'
    check (kind in ('floor_plan','site_plan','elevation','photo','diagram','chart','other')),
  -- WHERE THE PICTURE IS, if anywhere. Three honest states:
  --   storage_path      an uploaded copy in a private bucket
  --   replaced_by_view  the site draws this live from the model, so a
  --                     bitmap would go stale the moment a wall moves
  --   neither           it exists in the source and was not ingested
  storage_path     text,
  replaced_by_view text,
  created_at    timestamptz not null default now(),
  unique (document_id, page, caption)
);

-- ---------------------------------------------------------------
-- document_claims: one extracted assertion.
--
-- This is what turns a document into part of the system. A line in the
-- cost plan is a claim with a number, a unit and a date, pointing at
-- the work item it prices - so "the handbook says 7,590 for the
-- rewire" becomes a row the roadmap can be checked against instead of
-- a sentence on page 41.
-- ---------------------------------------------------------------
create table if not exists public.document_claims (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  document_id   uuid not null references public.source_documents (id) on delete cascade,
  section_id    uuid references public.document_sections (id) on delete set null,
  claim_type    text not null default 'fact'
    check (claim_type in ('cost','price','date','duration','dimension',
      'quantity','assumption','decision','risk','fact')),
  label         text not null,
  value_numeric numeric(14,2),
  unit          text,
  value_text    text,
  page          integer,
  -- WHERE IT LANDS. A claim that points at nothing is a quotation; a
  -- claim that points at a work item is a figure somebody can act on.
  work_item_id  uuid references public.work_items (id) on delete set null,
  stock_target_id uuid references public.stock_targets (id) on delete set null,
  house_fact_id uuid references public.house_facts (id) on delete set null,
  -- The document's own labelling. It marks figures VERIFIED or
  -- ESTIMATE, and flattening that distinction would dress an estimate
  -- as a survey.
  confidence    text not null default 'researched' references public.confidence_levels (key),
  as_of         date,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists document_claims_doc_idx
  on public.document_claims (document_id, claim_type);
create index if not exists document_claims_item_idx
  on public.document_claims (work_item_id) where work_item_id is not null;

drop trigger if exists source_documents_updated_at on public.source_documents;
create trigger source_documents_updated_at before update on public.source_documents
  for each row execute function public.set_updated_at();
drop trigger if exists document_sections_updated_at on public.document_sections;
create trigger document_sections_updated_at before update on public.document_sections
  for each row execute function public.set_updated_at();
drop trigger if exists document_claims_updated_at on public.document_claims;
create trigger document_claims_updated_at before update on public.document_claims
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- document_outline: the contents page, derived.
-- SECURITY INVOKER IS NOT OPTIONAL - see 55_stock.sql.
-- ---------------------------------------------------------------
create or replace view public.document_outline
with (security_invoker = on) as
select
  s.id, s.household_id, s.document_id, s.part, s.number, s.title, s.lede,
  s.page_from, s.page_to, s.sort_order, s.confidence,
  d.title                                      as document_title,
  d.as_of                                      as document_as_of,
  length(coalesce(s.body, ''))                 as body_chars,
  (select count(*) from public.document_figures f where f.section_id = s.id) as figures,
  (select count(*) from public.document_claims c where c.section_id = s.id) as claims,
  (select count(*) from public.document_claims c
     where c.section_id = s.id and c.work_item_id is not null)              as claims_landed
from public.document_sections s
join public.source_documents d on d.id = s.document_id
where d.status = 'current';

comment on view public.document_outline is
  'The document as a contents page, with how many claims each section makes and how many of them point at a work item. A section with claims and none landed is one nobody has connected to the plan yet.';
