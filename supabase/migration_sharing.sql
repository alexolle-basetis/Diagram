-- ====================================================================
-- Diagram App — Sharing system migration
-- Run this in the Supabase SQL Editor AFTER the initial migration.sql
-- ====================================================================

-- 1. Add visibility column to diagrams
alter table public.diagrams
  add column if not exists is_public boolean not null default false;

-- 2. Create diagram_shares table
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

-- 3. Enable RLS on diagram_shares
alter table public.diagram_shares enable row level security;

-- 4. Drop old overly-permissive policies on diagrams
drop policy if exists "Authenticated can view any diagram" on public.diagrams;
drop policy if exists "Authenticated can update any diagram" on public.diagrams;

-- 5. New RLS policies for diagrams (more restrictive)

-- Owner can view/edit (already exists via "Owner full access")

-- Anyone can view public diagrams
create policy "Public diagrams are viewable"
  on public.diagrams for select
  using (is_public = true);

-- Shared users can view
create policy "Shared users can view"
  on public.diagrams for select
  using (
    exists (
      select 1 from public.diagram_shares
      where diagram_id = id and shared_with = auth.uid()
    )
  );

-- Shared editors can update
create policy "Shared editors can update"
  on public.diagrams for update
  using (
    exists (
      select 1 from public.diagram_shares
      where diagram_id = id and shared_with = auth.uid() and role = 'editor'
    )
  );

-- 6. RLS policies for diagram_shares

-- Owner of the diagram can manage shares
create policy "Diagram owner manages shares"
  on public.diagram_shares for all
  using (
    exists (
      select 1 from public.diagrams
      where id = diagram_id and owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.diagrams
      where id = diagram_id and owner_id = auth.uid()
    )
  );

-- Shared user can view their own share entry
create policy "Users can view own shares"
  on public.diagram_shares for select
  using (shared_with = auth.uid());

-- 7. Helper: look up user by email (for sharing UI)
create or replace function public.find_user_by_email(lookup_email text)
returns table (id uuid, email text, full_name text, avatar_url text) as $$
begin
  return query
    select
      u.id,
      u.email::text,
      (u.raw_user_meta_data->>'full_name')::text as full_name,
      (u.raw_user_meta_data->>'avatar_url')::text as avatar_url
    from auth.users u
    where u.email = lookup_email
    limit 1;
end;
$$ language plpgsql security definer;

-- 8. Helper: list shares with user info for a diagram
create or replace function public.get_diagram_shares(p_diagram_id uuid)
returns table (share_id uuid, user_id uuid, email text, full_name text, avatar_url text, role text) as $$
begin
  return query
    select
      ds.id as share_id,
      ds.shared_with as user_id,
      u.email::text,
      (u.raw_user_meta_data->>'full_name')::text as full_name,
      (u.raw_user_meta_data->>'avatar_url')::text as avatar_url,
      ds.role::text
    from public.diagram_shares ds
    join auth.users u on u.id = ds.shared_with
    where ds.diagram_id = p_diagram_id;
end;
$$ language plpgsql security definer;

-- 9. Helper: list diagrams shared with the current user (with owner info)
create or replace function public.list_shared_with_me()
returns table (
  diagram_id uuid, name text, data jsonb, updated_at timestamptz, created_at timestamptz,
  owner_email text, owner_name text, owner_avatar text, share_role text
) as $$
begin
  return query
    select
      d.id as diagram_id, d.name, d.data, d.updated_at, d.created_at,
      u.email::text as owner_email,
      (u.raw_user_meta_data->>'full_name')::text as owner_name,
      (u.raw_user_meta_data->>'avatar_url')::text as owner_avatar,
      ds.role::text as share_role
    from public.diagram_shares ds
    join public.diagrams d on d.id = ds.diagram_id
    join auth.users u on u.id = d.owner_id
    where ds.shared_with = auth.uid();
end;
$$ language plpgsql security definer;
