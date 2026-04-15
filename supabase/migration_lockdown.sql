-- ====================================================================
-- Diagram App — Security lockdown migration (re-runnable)
--
-- IMPORTANT: Run this in the Supabase SQL Editor if private diagrams
-- are accessible to other authenticated users. This typically happens
-- when only `migration.sql` was applied (which had open policies for
-- the initial collaboration MVP) but `migration_sharing.sql` (which
-- replaces those open policies with proper sharing-aware ones) was
-- never executed.
--
-- This script is fully IDEMPOTENT: it can be run multiple times
-- safely. It will:
--   1. Ensure `is_public` column exists (default false).
--   2. Drop ANY existing policy on `diagrams` (open or restrictive).
--   3. Drop ANY existing policy on `diagram_shares`.
--   4. Re-create the correct restrictive policies.
--   5. Verify RLS is enabled on both tables.
-- ====================================================================

-- 1. Ensure the column exists with safe default
alter table public.diagrams
  add column if not exists is_public boolean not null default false;

-- 2. Ensure the diagram_shares table exists (in case lockdown is run on
--    a DB that only had the initial migration)
create table if not exists public.diagram_shares (
  id          uuid default gen_random_uuid() primary key,
  diagram_id  uuid references public.diagrams(id) on delete cascade not null,
  shared_with uuid references auth.users(id) on delete cascade not null,
  role        text not null default 'viewer' check (role in ('viewer', 'editor')),
  created_at  timestamptz default now(),
  unique (diagram_id, shared_with)
);

create index if not exists idx_shares_diagram on public.diagram_shares(diagram_id);
create index if not exists idx_shares_user on public.diagram_shares(shared_with);

-- 3. Drop ALL existing policies on `diagrams` (clean slate)
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'diagrams'
  loop
    execute format('drop policy if exists %I on public.diagrams', pol.policyname);
  end loop;
end$$;

-- 4. Drop ALL existing policies on `diagram_shares`
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'diagram_shares'
  loop
    execute format('drop policy if exists %I on public.diagram_shares', pol.policyname);
  end loop;
end$$;

-- 5. Enable RLS (no-op if already enabled, but defensive)
alter table public.diagrams enable row level security;
alter table public.diagram_shares enable row level security;

-- ====================================================================
-- 6. Re-create RESTRICTIVE policies for `diagrams`
-- ====================================================================

-- Owner has full CRUD on their diagrams
create policy "Owner full access"
  on public.diagrams for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Public diagrams (is_public = true) are viewable by any authenticated user
create policy "Public diagrams are viewable"
  on public.diagrams for select
  using (is_public = true and auth.role() = 'authenticated');

-- Users can view diagrams shared with them
create policy "Shared users can view"
  on public.diagrams for select
  using (
    exists (
      select 1 from public.diagram_shares
      where diagram_shares.diagram_id = diagrams.id
        and diagram_shares.shared_with = auth.uid()
    )
  );

-- Users with editor role can update shared diagrams
create policy "Shared editors can update"
  on public.diagrams for update
  using (
    exists (
      select 1 from public.diagram_shares
      where diagram_shares.diagram_id = diagrams.id
        and diagram_shares.shared_with = auth.uid()
        and diagram_shares.role = 'editor'
    )
  );

-- ====================================================================
-- 7. Re-create policies for `diagram_shares`
-- ====================================================================

-- Owner of the diagram can manage shares
create policy "Diagram owner manages shares"
  on public.diagram_shares for all
  using (
    exists (
      select 1 from public.diagrams
      where diagrams.id = diagram_shares.diagram_id
        and diagrams.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.diagrams
      where diagrams.id = diagram_shares.diagram_id
        and diagrams.owner_id = auth.uid()
    )
  );

-- Shared user can see their own share entry
create policy "Users can view own shares"
  on public.diagram_shares for select
  using (shared_with = auth.uid());

-- ====================================================================
-- 8. Verification queries — run these to inspect the result
-- ====================================================================

-- After running this script, list the current policies to verify:
--
-- select tablename, policyname, cmd, qual
-- from pg_policies
-- where schemaname = 'public' and tablename in ('diagrams', 'diagram_shares')
-- order by tablename, policyname;
--
-- Expected output (6 policies in `diagrams`, 2 in `diagram_shares`):
--   diagrams         | Owner full access            | ALL
--   diagrams         | Public diagrams are viewable | SELECT
--   diagrams         | Shared editors can update    | UPDATE
--   diagrams         | Shared users can view        | SELECT
--   diagram_shares   | Diagram owner manages shares | ALL
--   diagram_shares   | Users can view own shares    | SELECT
--
-- If you see "Authenticated can view/update any diagram" still listed,
-- the DROP commands above failed silently — re-run the whole script.

-- Sanity check: count diagrams visible to current user (should be ONLY
-- your own + public + shared-with-you). If you see other users' private
-- diagrams here, RLS is misconfigured.
--
-- select count(*) as visible_diagrams from public.diagrams;
