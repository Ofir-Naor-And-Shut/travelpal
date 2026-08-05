-- ============================================================================
--  Project Travel — Supabase schema, phase 1: trips + owner-only access.
--
--  Run this in the Supabase dashboard → SQL Editor → New query → Run.
--  It is idempotent: safe to run again after edits.
--
--  Design: a trip is stored as one JSONB document — the same object the app
--  already keeps in localStorage. Sync becomes "upsert this JSON". Documents
--  (booking PDFs, passport scans) are NOT stored here; they go to a Storage
--  bucket in phase 2, because blobs bloat the database and its backups.
--
--  Sharing (trip_members) and roles come in phase 3; the owner policy below is
--  written so that phase can add member policies without rewriting this one.
-- ============================================================================

-- One row per trip. `data` holds the whole trip object.
create table if not exists public.trips (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Fetching "my trips" hits owner_id constantly.
create index if not exists trips_owner_id_idx on public.trips (owner_id);

-- ---------------------------------------------------------------------------
--  Table privileges + Row-Level Security.
--
--  Two independent gates: a GRANT decides whether a Data API role may touch
--  the table at all; RLS then restricts which rows. Both are required.
--
--  `authenticated` (signed-in users) gets full CRUD, filtered to their own
--  rows by the policies below. `anon` is granted nothing on purpose — trips
--  require a login, so anonymous requests are refused at the privilege level.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.trips to authenticated;

alter table public.trips enable row level security;

-- A signed-in user may read and write only their own trips. Split per command
-- so phase-3 sharing can add member SELECT/UPDATE policies alongside these
-- rather than having to replace a single FOR ALL policy.
drop policy if exists trips_select_own on public.trips;
create policy trips_select_own on public.trips
  for select using (auth.uid() = owner_id);

drop policy if exists trips_insert_own on public.trips;
create policy trips_insert_own on public.trips
  for insert with check (auth.uid() = owner_id);

drop policy if exists trips_update_own on public.trips;
create policy trips_update_own on public.trips
  for update using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists trips_delete_own on public.trips;
create policy trips_delete_own on public.trips
  for delete using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
--  Keep updated_at honest — it drives last-write-wins conflict handling.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trips_touch_updated_at on public.trips;
create trigger trips_touch_updated_at
  before update on public.trips
  for each row execute function public.touch_updated_at();
