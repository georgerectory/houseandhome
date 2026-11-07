-- ------------------------------------------------------------------
-- 92_brain.sql - the property brain's knowledge layer (Overhaul Stage 2).
--
-- One organised, linked store an AI can reach in one call:
--
--   sources          where every fact came from (a page, an email, a
--                    research reply, the owner's own word)
--   topics           a small fixed vocabulary for evidence
--   listing_facts    one row per fact about one listing (EPC, heating,
--                    drainage, flood band, broadband, covenants ...),
--                    so a house's facts are rows, never variable keys
--   places           villages, towns, wards, postcode sectors
--   market_stats     numbers by place, metric, segment and period
--   lending_products one row per lender product, dated and sourced
--   forecasts        one row per forecaster, area, year and vintage
--
-- and three entry points, all SECURITY INVOKER (they read through the
-- caller's own policies):
--
--   brain_context(household)        the lean start of every session
--   brain_about(household, ref)     everything about one thing
--   brain_search(household, query)  ranked search across all of it
--
-- knowledge_links gains a strength (0-1), the basis it was set on, and a
-- source. refresh_brain_links() derives the engine-set links: comparable
-- to listing, evidence to what it is about.
--
-- RLS and policies live in THIS file, in the same change as the tables
-- (CLAUDE.md rule 2). Nothing here holds a figure: the rows are private.
-- ------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------
create table if not exists public.sources (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  -- Natural key for idempotent loads: 'url:<url>', 'doc:<uuid>',
  -- 'text:<md5 of the source text>', 'owner:<date>'.
  key                text not null,
  kind               text not null default 'web'
    check (kind in ('web','portal','agent','auction','lender','government','email','pdf',
                    'research_reply','chat','owner','document','model','other')),
  title              text not null,
  url                text,
  publisher          text,
  published_on       date,
  retrieved_on       date,
  source_document_id uuid references public.source_documents (id),
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (household_id, key)
);
drop trigger if exists sources_updated_at on public.sources;
create trigger sources_updated_at before update on public.sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- topics: vocabulary, readable by any signed-in user
-- ---------------------------------------------------------------
create table if not exists public.topics (
  key        text primary key,
  label      text not null,
  parent_key text references public.topics (key),
  sort_order integer not null default 100
);
insert into public.topics (key, label, sort_order) values
  ('listing',     'A house or listing',                    10),
  ('lending',     'Lenders, mortgages and the broker',     20),
  ('rates',       'Interest rates and Bank Rate',          30),
  ('market',      'Prices, sales and supply',              40),
  ('forecast',    'House-price forecasts',                 50),
  ('rent',        'Rents',                                 60),
  ('costs',       'Running costs and works costs',         70),
  ('tax',         'Stamp duty and other tax',              80),
  ('income',      'Income, savings and spending',          90),
  ('planning',    'Planning, policy and grants',          100),
  ('services',    'Broadband, drainage, energy and EPC',  110),
  ('flood',       'Flood risk',                           120),
  ('place',       'A village or area',                    130),
  ('routes',      'Routes, roads and the model',          140),
  ('recall',      'Recalled from past chats',             150),
  ('preference',  'What the owner wants',                 160),
  ('research',    'Research verdicts and gaps',           170),
  ('property',    'A modelled property',                  180),
  ('general',     'Anything else',                        990)
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- Provenance on the evidence and comparables already held
-- ---------------------------------------------------------------
alter table public.ra_evidence add column if not exists topic_key text references public.topics (key);
alter table public.ra_evidence add column if not exists label text
  check (label is null or label in ('STATED','VERIFIED','ESTIMATE','CHECK'));
alter table public.ra_evidence add column if not exists source_id uuid references public.sources (id);
alter table public.ra_evidence add column if not exists source_date date;

alter table public.ra_comparables add column if not exists beds integer check (beds is null or beds >= 0);
alter table public.ra_comparables add column if not exists floor_area_m2 numeric check (floor_area_m2 is null or floor_area_m2 > 0);
alter table public.ra_comparables add column if not exists place_id uuid;
alter table public.ra_comparables add column if not exists source_id uuid references public.sources (id);

-- ---------------------------------------------------------------
-- places
-- ---------------------------------------------------------------
create table if not exists public.places (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  key              text not null check (key ~ '^[a-z0-9_]+$'),
  name             text not null,
  kind             text not null default 'village'
    check (kind in ('village','town','ward','msoa','postcode_sector','postcode_district','district','county','region','country')),
  parent_id        uuid references public.places (id),
  district         text,
  postcode_sectors text[] not null default '{}',
  lat              numeric,
  lng              numeric,
  drive_minutes    integer check (drive_minutes is null or drive_minutes >= 0),
  attrs            jsonb not null default '{}'::jsonb,
  source_id        uuid references public.sources (id),
  label            text check (label is null or label in ('STATED','VERIFIED','ESTIMATE','CHECK')),
  confidence       text not null default 'researched' references public.confidence_levels (key),
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (household_id, key)
);
drop trigger if exists places_updated_at on public.places;
create trigger places_updated_at before update on public.places
  for each row execute function public.set_updated_at();

do $$ begin
  alter table public.ra_comparables add constraint ra_comparables_place_fk
    foreign key (place_id) references public.places (id);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------
-- listing_facts: one current fact per listing and attribute
-- ---------------------------------------------------------------
create table if not exists public.listing_facts (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  listing_id       uuid not null references public.ra_listings (id),
  attribute        text not null check (attribute ~ '^[a-z0-9_]+$'),
  value_text       text,
  value_num        numeric,
  unit             text,
  as_of            date,
  source_id        uuid references public.sources (id),
  label            text check (label is null or label in ('STATED','VERIFIED','ESTIMATE','CHECK')),
  confidence       text not null default 'researched' references public.confidence_levels (key),
  status           text not null default 'active' check (status in ('active','superseded','retired')),
  superseded_by_id uuid references public.listing_facts (id),
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (value_text is not null or value_num is not null),
  check (status = 'active' or note is not null or superseded_by_id is not null)
);
create unique index if not exists listing_facts_current
  on public.listing_facts (listing_id, attribute) where status = 'active';
drop trigger if exists listing_facts_updated_at on public.listing_facts;
create trigger listing_facts_updated_at before update on public.listing_facts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- market_stats
-- ---------------------------------------------------------------
create table if not exists public.market_stats (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  place_id     uuid not null references public.places (id),
  metric       text not null check (metric in ('sales_count','median_price','mean_price','median_price_m2',
                 'median_days_on_market','rent_monthly','hpi_index','avg_price','price_change')),
  segment      text not null default 'all',
  period       text not null,
  value        numeric not null,
  n            integer,
  source_id    uuid references public.sources (id),
  label        text check (label is null or label in ('STATED','VERIFIED','ESTIMATE','CHECK')),
  confidence   text not null default 'researched' references public.confidence_levels (key),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists market_stats_natural
  on public.market_stats (household_id, place_id, metric, segment, period, coalesce(source_id, '00000000-0000-0000-0000-000000000000'::uuid));
drop trigger if exists market_stats_updated_at on public.market_stats;
create trigger market_stats_updated_at before update on public.market_stats
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- lending_products
-- ---------------------------------------------------------------
create table if not exists public.lending_products (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households (id) on delete cascade,
  lender              text not null,
  product             text not null,
  ltv_max             numeric check (ltv_max is null or (ltv_max > 0 and ltv_max <= 1)),
  rate                numeric check (rate is null or (rate >= 0 and rate < 1)),
  fixed_years         numeric,
  fee                 numeric,
  cashback            numeric,
  lti_max             numeric,
  min_income          numeric,
  max_term_years      integer,
  max_age_at_end      integer,
  ftb_only            boolean,
  condition_policy    text,
  retention_policy    text,
  non_standard_policy text,
  attrs               jsonb not null default '{}'::jsonb,
  as_of               date,
  source_id           uuid references public.sources (id),
  label               text check (label is null or label in ('STATED','VERIFIED','ESTIMATE','CHECK')),
  confidence          text not null default 'researched' references public.confidence_levels (key),
  status              text not null default 'active' check (status in ('active','retired')),
  resolution          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (status = 'active' or resolution is not null)
);
create unique index if not exists lending_products_natural
  on public.lending_products (household_id, lower(lender), lower(product), coalesce(as_of, '1900-01-01'::date));
drop trigger if exists lending_products_updated_at on public.lending_products;
create trigger lending_products_updated_at before update on public.lending_products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- forecasts
-- ---------------------------------------------------------------
create table if not exists public.forecasts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  forecaster   text not null,
  area         text not null,
  published    date,
  year         integer not null check (year between 2000 and 2100),
  pct          numeric not null,
  source_id    uuid references public.sources (id),
  label        text check (label is null or label in ('STATED','VERIFIED','ESTIMATE','CHECK')),
  confidence   text not null default 'researched' references public.confidence_levels (key),
  note         text,
  created_at   timestamptz not null default now(),
  unique (household_id, forecaster, area, published, year)
);

-- ---------------------------------------------------------------
-- Links: strength, basis, source; every entity linkable
-- ---------------------------------------------------------------
alter table public.knowledge_links add column if not exists strength numeric(3,2)
  check (strength is null or (strength >= 0 and strength <= 1));
alter table public.knowledge_links add column if not exists basis text;
alter table public.knowledge_links add column if not exists source_id uuid references public.sources (id);

insert into public.link_entity_types (key, table_name, label, sort_order) values
  ('source',          'sources',          'Source',              220),
  ('listing_fact',    'listing_facts',    'Listing fact',        230),
  ('place',           'places',           'Place',               240),
  ('market_stat',     'market_stats',     'Market statistic',    250),
  ('lending_product', 'lending_products', 'Lending product',     260),
  ('forecast',        'forecasts',        'Forecast',            270),
  ('comparable',      'ra_comparables',   'Comparable',          280),
  ('contradiction',   'contradictions',   'Contradiction',       290),
  ('property',        'properties',       'Property',            300),
  ('event',           'scheduled_events', 'Dated action',        310),
  ('document',        'source_documents', 'Document',            320)
on conflict (key) do nothing;

insert into public.link_kinds (key, label, inverse_label, family, is_symmetric, description, sort_order) values
  ('evidence_for', 'Evidence for', 'Evidenced by', 'knowledge', false,
   'The FROM evidence bears on the TO thing. Strength: how much (label weight times recency when the engine sets it).', 150),
  ('comparable_for', 'Comparable for', 'Has comparable', 'knowledge', false,
   'The FROM sale or listing is used to value the TO listing. Strength: kind, recency, size and bedroom match (refresh_brain_links).', 160),
  ('supports', 'Supports', 'Supported by', 'knowledge', false,
   'The FROM row argues for the TO row (a decision, a criterion, a figure).', 170),
  ('contradicts', 'Contradicts', 'Contradicted by', 'knowledge', false,
   'The FROM row argues against the TO row. A standing disagreement belongs in contradictions; this records which rows it touches.', 180),
  ('located_in', 'Located in', 'Contains', 'spatial', false,
   'The FROM listing, comparable or place sits inside the TO place.', 190),
  ('drives', 'Drives', 'Driven by', 'knowledge', false,
   'The owner''s words (a signal or decision) set the TO preference or rule.', 200),
  ('from_party', 'From', 'Sent', 'knowledge', false,
   'The FROM source, email or fact came from the TO party.', 210)
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- RLS, in the same change
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sources','topics','listing_facts','places','market_stats','lending_products','forecasts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;

  foreach t in array array['sources','listing_facts','places','market_stats','lending_products','forecasts'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated '
      || 'using (public.is_household_member(household_id))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated '
      || 'with check (public.is_household_member(household_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated '
      || 'using (public.is_household_member(household_id)) '
      || 'with check (public.is_household_member(household_id))', t || '_update', t);
  end loop;
end $$;

drop policy if exists topics_read on public.topics;
create policy topics_read on public.topics for select to authenticated using (true);

-- ---------------------------------------------------------------
-- brain_entities: every thing the brain knows, one row each, with a
-- ref an AI can quote back (L55, S-107, R-22, E140, a key) and the text
-- that search reads.
-- ---------------------------------------------------------------
create or replace view public.brain_entities with (security_invoker = on) as
  select l.household_id, 'listing'::text type, l.id, l.code ref, l.name title,
         concat_ws(' ', l.address, l.postcode, l.property_type, l.condition, l.status, l.status_reason, l.reaction, l.notes) body,
         l.status, l.updated_at
    from public.ra_listings l
  union all
  select f.household_id, 'listing_fact', f.id, l.code || ':' || f.attribute, l.name || ' - ' || replace(f.attribute, '_', ' '),
         concat_ws(' ', f.value_text, f.value_num::text, f.unit, f.note), f.status, f.updated_at
    from public.listing_facts f join public.ra_listings l on l.id = f.listing_id
  union all
  select p.household_id, 'property', p.id, p.ref, p.name,
         concat_ws(' ', p.address_line, p.postcode, p.status, p.status_reason, p.notes), p.status, p.updated_at
    from public.properties p
  union all
  select e.household_id, 'evidence', e.id, e.code, coalesce(e.topic, 'Evidence'),
         concat_ws(' ', e.claim, e.figure, e.source, e.used_in), 'active', e.updated_at
    from public.ra_evidence e
  union all
  select s.household_id, 'signal', s.id, s.code, coalesce(left(s.words, 80), s.code),
         concat_ws(' ', s.words, s.context, s.implies, s.open_question, s.rating), s.status, s.updated_at
    from public.ra_signals s
  union all
  select d.household_id, 'decision', d.id, coalesce(d.code, d.id::text), d.title,
         concat_ws(' ', d.decided, d.rationale, d.alternatives_rejected, d.topic, d.reopen_if), d.status, d.updated_at
    from public.decisions d
  union all
  select c.household_id, 'contradiction', c.id, coalesce(c.key, c.id::text), coalesce(c.topic, c.key),
         concat_ws(' ', c.position_a, c.position_b, c.source_a, c.source_b, c.what_it_changes, c.resolution), c.status, c.updated_at
    from public.contradictions c
  union all
  select v.household_id, 'variable', v.id, v.key, coalesce(v.label, v.key),
         concat_ws(' ', v.notes, v.source, v.evidence, v.confidence), v.status, v.updated_at
    from public.ra_variables v
  union all
  select c.household_id, 'comparable', c.id, coalesce(l.code, '') || ':' || left(c.address, 40), c.address,
         concat_ws(' ', c.property_type, c.kind, c.when_text, c.source, c.notes), 'active', c.updated_at
    from public.ra_comparables c left join public.ra_listings l on l.id = c.listing_id
  union all
  select p.household_id, 'place', p.id, p.key, p.name,
         concat_ws(' ', p.kind, p.district, array_to_string(p.postcode_sectors, ' '), p.attrs::text, p.note), 'active', p.updated_at
    from public.places p
  union all
  select m.household_id, 'market_stat', m.id, pl.key || ':' || m.metric || ':' || m.segment || ':' || m.period,
         pl.name || ' ' || replace(m.metric, '_', ' ') || ' (' || m.segment || ', ' || m.period || ')',
         concat_ws(' ', m.value::text, m.note), 'active', m.updated_at
    from public.market_stats m join public.places pl on pl.id = m.place_id
  union all
  select g.household_id, 'lending_product', g.id, g.lender || ':' || g.product, g.lender || ' ' || g.product,
         concat_ws(' ', g.condition_policy, g.retention_policy, g.non_standard_policy, g.attrs::text), g.status, g.updated_at
    from public.lending_products g
  union all
  select f.household_id, 'forecast', f.id, f.forecaster || ':' || f.area || ':' || f.year, f.forecaster || ' ' || f.area || ' ' || f.year,
         concat_ws(' ', f.pct::text, f.note), 'active', f.created_at
    from public.forecasts f
  union all
  select s.household_id, 'source', s.id, s.key, s.title,
         concat_ws(' ', s.kind, s.url, s.publisher, s.note), 'active', s.updated_at
    from public.sources s
  union all
  select ev.household_id, 'event', ev.id, to_char(ev.starts_at, 'YYYY-MM-DD') || ' ' || left(ev.title, 40), ev.title,
         concat_ws(' ', ev.kind, ev.location, ev.notes), ev.status, ev.updated_at
    from public.scheduled_events ev
  union all
  select h.household_id, 'house_fact', h.id, h.category || ':' || left(h.fact, 40), h.fact,
         concat_ws(' ', h.detail, h.source), 'active', h.updated_at
    from public.house_facts h
  union all
  select d.household_id, 'document', d.id, d.kind || ':' || left(d.title, 40), d.title,
         concat_ws(' ', d.author, d.source_note), d.status, d.updated_at
    from public.source_documents d;

comment on view public.brain_entities is
  'Every entity the brain holds, one row each: type, ref (the code to quote back), title, and the text search reads. The base of brain_search and of the link labels in brain_about.';

-- ---------------------------------------------------------------
-- brain_search: ranked full-text plus fuzzy title match
-- ---------------------------------------------------------------
create or replace function public.brain_search(p_household_id uuid, p_query text, p_limit integer default 25)
returns table (type text, ref text, title text, status text, snippet text, rank real)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (select websearch_to_tsquery('english', p_query) tsq),
  hits as (
    select e.type, e.ref, e.title, e.status, e.body,
           (ts_rank(to_tsvector('english', coalesce(e.title, '') || ' ' || coalesce(e.ref, '') || ' ' || coalesce(e.body, '')), q.tsq)
            + extensions.similarity(lower(coalesce(e.title, '') || ' ' || coalesce(e.ref, '')), lower(p_query))
            + case when e.ref ilike p_query then 1 else 0 end
            -- The thing itself before what is said about it.
            + case e.type when 'listing' then 0.4 when 'property' then 0.4 when 'place' then 0.3
                          when 'decision' then 0.15 when 'signal' then 0.1 else 0 end)::real as rank
      from public.brain_entities e, q
     where e.household_id = p_household_id
       and (to_tsvector('english', coalesce(e.title, '') || ' ' || coalesce(e.ref, '') || ' ' || coalesce(e.body, '')) @@ q.tsq
            or extensions.similarity(lower(coalesce(e.title, '')), lower(p_query)) > 0.3
            or e.ref ilike p_query
            or e.title ilike '%' || p_query || '%')
  )
  select h.type, h.ref, h.title, h.status,
         left(regexp_replace(coalesce(h.body, ''), '\s+', ' ', 'g'), 240) as snippet, h.rank
    from hits h
   order by h.rank desc, h.type, h.ref
   limit greatest(1, least(coalesce(p_limit, 25), 200));
$$;

-- ---------------------------------------------------------------
-- brain_links: every open link touching one entity, both directions,
-- with the other end named, strongest first.
-- ---------------------------------------------------------------
create or replace function public.brain_links(p_household_id uuid, p_type text, p_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x.strength desc nulls last, x.kind, x.ref), '[]'::jsonb)
    from (
      select k.kind, 'out' as direction, o.type, o.ref, o.title, k.strength, k.basis, k.note
        from public.knowledge_links k
        join public.brain_entities o on o.id = k.to_id and o.type = k.to_type
       where k.household_id = p_household_id and k.valid_to is null
         and k.from_type = p_type and k.from_id = p_id
      union all
      select k.kind, 'in', o.type, o.ref, o.title, k.strength, k.basis, k.note
        from public.knowledge_links k
        join public.brain_entities o on o.id = k.from_id and o.type = k.from_type
       where k.household_id = p_household_id and k.valid_to is null
         and k.to_type = p_type and k.to_id = p_id
    ) x;
$$;

-- ---------------------------------------------------------------
-- brain_about: everything about one thing, in one call.
-- p_ref is what a person would say: L55, G12, P-004, E140, S-107,
-- R-22, a contradiction key, a variable key, a place key or name.
-- ---------------------------------------------------------------
create or replace function public.brain_about(p_household_id uuid, p_ref text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_ent   record;
  v_l     public.ra_listings;
  v_out   jsonb;
  v_name  text;
begin
  select e.* into v_ent from public.brain_entities e
   where e.household_id = p_household_id
     and (e.ref = p_ref or (e.type = 'place' and lower(e.title) = lower(p_ref)))
   order by case e.type when 'listing' then 1 when 'property' then 2 when 'decision' then 3
                        when 'signal' then 4 when 'evidence' then 5 when 'place' then 6 else 9 end
   limit 1;
  if not found then
    return jsonb_build_object('ref', p_ref, 'found', false,
      'hint', 'Not a known ref. Try brain_search(household, text).',
      'search', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                   from public.brain_search(p_household_id, p_ref, 10) s));
  end if;

  v_out := jsonb_build_object('ref', v_ent.ref, 'type', v_ent.type, 'title', v_ent.title,
    'status', v_ent.status, 'found', true,
    'links', public.brain_links(p_household_id, v_ent.type, v_ent.id));

  if v_ent.type = 'listing' then
    select * into v_l from public.ra_listings where id = v_ent.id;
    v_name := split_part(v_l.name, ',', 1);
    v_out := v_out || jsonb_build_object(
      'listing', to_jsonb(v_l) - 'household_id',
      'facts', (select coalesce(jsonb_agg(jsonb_build_object(
                  'attribute', f.attribute, 'value', coalesce(f.value_text, f.value_num::text), 'unit', f.unit,
                  'as_of', f.as_of, 'label', f.label, 'confidence', f.confidence,
                  'source', s.title, 'url', s.url, 'note', f.note) order by f.attribute), '[]'::jsonb)
                  from public.listing_facts f left join public.sources s on s.id = f.source_id
                 where f.listing_id = v_l.id and f.status = 'active'),
      'comparables', (select coalesce(jsonb_agg(jsonb_build_object(
                  'address', c.address, 'type', c.property_type, 'beds', c.beds, 'm2', c.floor_area_m2,
                  'price', c.price, 'kind', c.kind, 'date', coalesce(c.on_date::text, c.when_text),
                  'strength', k.strength, 'source', coalesce(c.url, c.source), 'confidence', c.confidence)
                  order by k.strength desc nulls last, c.on_date desc nulls last), '[]'::jsonb)
                  from public.ra_comparables c
                  left join public.knowledge_links k on k.from_type = 'comparable' and k.from_id = c.id
                       and k.to_type = 'listing' and k.to_id = v_l.id and k.kind = 'comparable_for' and k.valid_to is null
                 where c.listing_id = v_l.id),
      'evidence', (select coalesce(jsonb_agg(jsonb_build_object(
                  'code', e.code, 'topic', e.topic, 'claim', e.claim, 'figure', e.figure,
                  'label', e.label, 'date', coalesce(e.source_date::text, e.period), 'source', e.source)
                  order by e.code), '[]'::jsonb)
                  from public.ra_evidence e
                 where e.household_id = p_household_id
                   and (exists (select 1 from public.knowledge_links k where k.from_type = 'evidence' and k.from_id = e.id
                                   and k.to_type = 'listing' and k.to_id = v_l.id and k.valid_to is null)
                        or e.used_in ~ ('(^|[^0-9A-Z])' || v_l.code || '([^0-9]|$)'))),
      'appraisals', (select coalesce(jsonb_agg(jsonb_build_object(
                  'on', a.appraised_on, 'protocol', a.protocol, 'verdict', a.verdict,
                  'positives', a.positives, 'negatives', a.negatives, 'red_flags', a.red_flags,
                  'next_checks', a.next_checks) order by a.appraised_on desc), '[]'::jsonb)
                  from (select * from public.ra_appraisals where listing_id = v_l.id
                         order by appraised_on desc, created_at desc limit 3) a),
      'signals', (select coalesce(jsonb_agg(jsonb_build_object('code', s.code, 'kind', s.kind, 'words', s.words,
                  'said_on', s.said_on, 'rating', s.rating) order by s.said_on desc nulls last), '[]'::jsonb)
                  from public.ra_signals s
                 where s.household_id = p_household_id
                   and (exists (select 1 from public.knowledge_links k where k.from_type = 'signal' and k.from_id = s.id
                                   and k.to_type = 'listing' and k.to_id = v_l.id and k.valid_to is null)
                        or s.words ~* ('\m' || v_l.code || '\M') or s.context ~* ('\m' || v_l.code || '\M'))),
      'contradictions', (select coalesce(jsonb_agg(jsonb_build_object('key', c.key, 'topic', c.topic, 'status', c.status,
                  'a', c.position_a, 'b', c.position_b, 'changes', c.what_it_changes)), '[]'::jsonb)
                  from public.contradictions c
                 where c.household_id = p_household_id
                   and (c.topic ~* ('\m' || v_l.code || '\M') or c.what_it_changes ~* ('\m' || v_l.code || '\M')
                        or (length(v_name) > 4 and (c.topic ilike '%' || v_name || '%' or c.what_it_changes ilike '%' || v_name || '%')))),
      'events', (select coalesce(jsonb_agg(jsonb_build_object('on', ev.starts_at::date, 'title', ev.title, 'status', ev.status)
                  order by ev.starts_at), '[]'::jsonb)
                  from public.scheduled_events ev
                 where ev.household_id = p_household_id and length(v_name) > 4
                   and (ev.title ilike '%' || v_name || '%' or ev.notes ilike '%' || v_name || '%')),
      'property', (select to_jsonb(p) - 'household_id' from public.properties p where p.id = v_l.property_id));
  elsif v_ent.type = 'place' then
    v_out := v_out || jsonb_build_object(
      'place', (select to_jsonb(p) - 'household_id' from public.places p where p.id = v_ent.id),
      'stats', (select coalesce(jsonb_agg(jsonb_build_object('metric', m.metric, 'segment', m.segment, 'period', m.period,
                  'value', m.value, 'n', m.n, 'label', m.label, 'source', s.title, 'url', s.url)
                  order by m.metric, m.segment, m.period), '[]'::jsonb)
                  from public.market_stats m left join public.sources s on s.id = m.source_id
                 where m.place_id = v_ent.id),
      'listings', (select coalesce(jsonb_agg(jsonb_build_object('code', l.code, 'name', l.name, 'status', l.status)), '[]'::jsonb)
                  from public.ra_listings l join public.places p on p.id = v_ent.id
                 where l.household_id = p_household_id
                   and (l.name ilike '%' || p.name || '%' or l.address ilike '%' || p.name || '%')));
  else
    v_out := v_out || jsonb_build_object('row', (
      select to_jsonb(r) - 'household_id' from (
        select * from public.brain_entities where id = v_ent.id and type = v_ent.type) r),
      'detail', case v_ent.type
        when 'decision' then (select to_jsonb(d) - 'household_id' from public.decisions d where d.id = v_ent.id)
        when 'signal' then (select to_jsonb(s) - 'household_id' from public.ra_signals s where s.id = v_ent.id)
        when 'evidence' then (select to_jsonb(e) - 'household_id' from public.ra_evidence e where e.id = v_ent.id)
        when 'contradiction' then (select to_jsonb(c) - 'household_id' from public.contradictions c where c.id = v_ent.id)
        when 'variable' then (select to_jsonb(v) - 'household_id' from public.ra_variables v where v.id = v_ent.id)
        when 'property' then (select to_jsonb(p) - 'household_id' from public.properties p where p.id = v_ent.id)
        else null end);
  end if;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------
-- brain_context: the lean start of a session.
-- ---------------------------------------------------------------
create or replace function public.brain_context(p_household_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'mode', case when public.active_property_id(p_household_id) is null then 'search' else 'focus' end,
    'today', public.london_today(),
    'active_property', (select jsonb_build_object('ref', p.ref, 'name', p.name, 'status', p.status)
                          from public.properties p where p.id = public.active_property_id(p_household_id)),
    'candidates', (select coalesce(jsonb_agg(jsonb_build_object('ref', p.ref, 'name', p.name)), '[]'::jsonb)
                     from public.properties p where p.household_id = p_household_id and p.status = 'candidate'),
    'lead_listings', (select coalesce(jsonb_agg(jsonb_build_object('code', l.code, 'name', l.name, 'status', l.status,
                        'price', coalesce(l.asking_price, l.guide_price), 'beds', l.beds, 'facts',
                        (select count(*) from public.listing_facts f where f.listing_id = l.id and f.status = 'active'),
                        'comparables', (select count(*) from public.ra_comparables c where c.listing_id = l.id),
                        'latest_verdict', (select a.verdict from public.ra_appraisals a where a.listing_id = l.id
                                            order by a.appraised_on desc, a.created_at desc limit 1))
                        order by l.code), '[]'::jsonb)
                        from public.ra_listings l
                       where l.household_id = p_household_id and l.purpose = 'candidate'
                         and l.status in ('chase','viewing','legal','survey','bid','offer')),
    'register', (select jsonb_object_agg(s, n) from (select l.status s, count(*) n from public.ra_listings l
                   where l.household_id = p_household_id group by l.status) x),
    'next_actions', (select coalesce(jsonb_agg(jsonb_build_object('on', ev.starts_at::date, 'title', ev.title,
                       'status', ev.status) order by ev.starts_at), '[]'::jsonb)
                       from (select * from public.scheduled_events ev
                              where ev.household_id = p_household_id and ev.status in ('planned','confirmed')
                                and public.in_default_scope(p_household_id, ev.property_id)
                              order by ev.starts_at limit 15) ev),
    'recent_decisions', (select coalesce(jsonb_agg(jsonb_build_object('code', d.code, 'title', d.title, 'decided', d.decided,
                           'on', d.decided_on) order by d.decided_on desc nulls last), '[]'::jsonb)
                           from (select * from public.decisions d where d.household_id = p_household_id and d.status = 'active'
                                  order by d.decided_on desc nulls last, d.created_at desc limit 8) d),
    'recent_signals', (select coalesce(jsonb_agg(jsonb_build_object('code', s.code, 'words', left(s.words, 200),
                         'on', s.said_on) order by s.created_at desc), '[]'::jsonb)
                         from (select * from public.ra_signals s where s.household_id = p_household_id
                                order by s.created_at desc limit 8) s),
    'open_contradictions', jsonb_build_object(
        'count', (select count(*) from public.contradictions c where c.household_id = p_household_id and c.status = 'open'),
        'top', (select coalesce(jsonb_agg(jsonb_build_object('key', c.key, 'topic', c.topic, 'at_stake', c.value_at_stake)), '[]'::jsonb)
                  from (select * from public.contradictions c where c.household_id = p_household_id and c.status = 'open'
                         order by c.value_at_stake desc nulls last, c.created_at desc limit 8) c)),
    'counts', (select jsonb_object_agg(type, n) from (select e.type, count(*) n from public.brain_entities e
                 where e.household_id = p_household_id group by e.type) x),
    'how', jsonb_build_array(
        'brain_about(household, ref): everything about L55, P-004, R-22, S-107, E140, a place, a key',
        'brain_search(household, text): ranked search across every entity',
        'road_ahead_context(household): the model''s variables, roads, rules and register',
        'house_context(room): the active house (none in search mode)'));
$$;

-- ---------------------------------------------------------------
-- refresh_brain_links: the engine-set links, re-runnable.
--   comparable_for  comparable -> its listing; strength = kind x recency
--                   x size match x bedroom match (basis engine:comparable_v1)
--   evidence_for    evidence -> each listing, property or decision its
--                   used_in or "house: <name>" topic names; strength =
--                   label weight (VERIFIED 1, STATED 1, ESTIMATE 0.5,
--                   CHECK 0.3, unlabelled 0.6) (basis engine:evidence_v1)
-- Owner- or Claude-written links (any other basis) are never touched.
-- ---------------------------------------------------------------
create or replace function public.refresh_brain_links(p_household_id uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare v_comp integer; v_ev integer;
begin
  with c as (
    select c.id cid, l.id lid,
           (case c.kind when 'sold' then 1.0 when 'guide' then 0.7 when 'asking' then 0.6 else 0.3 end)
           * greatest(0.3, 1 - (extract(epoch from (now() - coalesce(c.on_date::timestamptz, c.created_at))) / 2629800.0) / 48.0)
           * case when c.floor_area_m2 is not null and l.floor_area_m2 is not null
                  then greatest(0.3, 1 - abs(ln(c.floor_area_m2 / l.floor_area_m2))) else 0.8 end
           * case when c.beds is not null and l.beds is not null
                  then greatest(0.5, 1 - 0.15 * abs(c.beds - l.beds)) else 0.9 end as s
      from public.ra_comparables c join public.ra_listings l on l.id = c.listing_id
     where c.household_id = p_household_id
  ), up as (
    insert into public.knowledge_links (household_id, from_type, from_id, to_type, to_id, kind, strength, basis, confidence)
    select p_household_id, 'comparable', c.cid, 'listing', c.lid, 'comparable_for', round(least(1, c.s)::numeric, 2),
           'engine:comparable_v1', 'derived'
      from c
    on conflict (from_type, from_id, to_type, to_id, kind) where valid_to is null
    do update set strength = excluded.strength, basis = excluded.basis
      where public.knowledge_links.basis like 'engine:%' or public.knowledge_links.basis is null
    returning 1
  ) select count(*) into v_comp from up;

  with refs as (
    select e.id eid, coalesce(e.label, substring(e.source from '(VERIFIED|STATED|ESTIMATE|CHECK)')) lab, m[1] ref
      from public.ra_evidence e, regexp_matches(coalesce(e.used_in, ''), '(?:^|[^A-Z0-9-])((?:L|G)[0-9]{2,3}|P-[0-9]{3}|(?:R|RA|G|P)-[0-9A-Z]+)', 'g') m
     where e.household_id = p_household_id
    union
    select e.id, coalesce(e.label, substring(e.source from '(VERIFIED|STATED|ESTIMATE|CHECK)')), l.code
      from public.ra_evidence e
      join public.ra_listings l on l.household_id = e.household_id
       and lower(split_part(l.name, ',', 1)) = lower(trim(substring(e.topic from '^house:\s*(.+)$')))
     where e.household_id = p_household_id and e.topic ~* '^house:'
  ), targets as (
    select r.eid, r.lab, 'listing' tt, l.id tid from refs r join public.ra_listings l
      on l.household_id = p_household_id and l.code = r.ref
    union
    select r.eid, r.lab, 'property', p.id from refs r join public.properties p
      on p.household_id = p_household_id and p.ref = r.ref
    union
    select r.eid, r.lab, 'decision', d.id from refs r join public.decisions d
      on d.household_id = p_household_id and d.code = r.ref
  ), up as (
    insert into public.knowledge_links (household_id, from_type, from_id, to_type, to_id, kind, strength, basis, confidence)
    select p_household_id, 'evidence', t.eid, t.tt, t.tid, 'evidence_for',
           case t.lab when 'VERIFIED' then 1.0 when 'STATED' then 1.0 when 'ESTIMATE' then 0.5 when 'CHECK' then 0.3 else 0.6 end,
           'engine:evidence_v1', 'derived'
      from targets t
    on conflict (from_type, from_id, to_type, to_id, kind) where valid_to is null
    do update set strength = excluded.strength, basis = excluded.basis
      where public.knowledge_links.basis like 'engine:%' or public.knowledge_links.basis is null
    returning 1
  ) select count(*) into v_ev from up;

  return jsonb_build_object('comparable_for', v_comp, 'evidence_for', v_ev);
end;
$$;

grant execute on function public.brain_context(uuid) to authenticated;
grant execute on function public.brain_about(uuid, text) to authenticated;
grant execute on function public.brain_search(uuid, text, integer) to authenticated;
grant execute on function public.brain_links(uuid, text, uuid) to authenticated;
grant execute on function public.refresh_brain_links(uuid) to authenticated;
