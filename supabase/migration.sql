-- ====================================================================
-- Diagram App — Supabase migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ====================================================================

-- 1. Create the diagrams table
create table if not exists public.diagrams (
  id         uuid default gen_random_uuid() primary key,
  name       text not null default 'Sin título',
  data       jsonb not null default '{"screens":[],"apiCalls":[]}',
  positions  jsonb not null default '{}',
  owner_id   uuid references auth.users(id) on delete cascade not null,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 2. Index for listing user's diagrams
create index if not exists idx_diagrams_owner on public.diagrams(owner_id);

-- 3. Enable Row Level Security
alter table public.diagrams enable row level security;

-- 4. RLS policies

-- Owner has full CRUD
create policy "Owner full access"
  on public.diagrams for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Any authenticated user can SELECT diagrams (for shared links)
create policy "Authenticated can view any diagram"
  on public.diagrams for select
  using (auth.role() = 'authenticated');

-- Any authenticated user can UPDATE diagrams (for real-time collaboration)
create policy "Authenticated can update any diagram"
  on public.diagrams for update
  using (auth.role() = 'authenticated');

-- 5. Auto-update updated_at on changes
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger diagrams_updated_at
  before update on public.diagrams
  for each row execute function public.update_updated_at();

-- 6. Enable Realtime for the diagrams table
alter publication supabase_realtime add table public.diagrams;
