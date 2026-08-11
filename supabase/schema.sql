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
--  Sharing (trip_members) and roles are phase 3, appended further down this
--  file — the owner policies below were written so that phase could add
--  member policies without rewriting this one.
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

-- A defense-in-depth backstop: no update path (RLS `with check`, an app bug,
-- a future code change) can ever move a trip to a different owner. Ownership
-- only changes by deleting and re-creating a row, never by UPDATE.
create or replace function public.protect_trip_owner()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id <> old.owner_id then
    raise exception 'owner_id cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trips_protect_owner on public.trips;
create trigger trips_protect_owner
  before update on public.trips
  for each row execute function public.protect_trip_owner();

-- ============================================================================
--  Phase 3 — Sharing.
--
--  Two independent mechanisms for two different needs:
--
--   1. Editor collaborators (`trip_members` + `pending_trip_invites`): the
--      owner invites a specific person, by email, to edit the trip. If that
--      email already has an account they become a member immediately; if not,
--      the invite waits and resolves itself the moment that email signs up
--      (the `resolve_pending_invites` trigger below — the app never polls for
--      it). A member can fully edit trip content but can never delete the
--      trip or manage its sharing — that stays owner-only.
--
--   2. View-only share links (`trip_share_links`): a link anyone can open
--      without an account, read-only, via the `get_trip_by_share_token` RPC.
--      An optional `label` lets the owner note who a link was sent to — it's
--      just a note, not an access check.
-- ============================================================================

-- --- 1. Editor collaborators -------------------------------------------------

create table if not exists public.trip_members (
  trip_id    uuid not null references public.trips (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index if not exists trip_members_user_id_idx on public.trip_members (user_id);

alter table public.trip_members enable row level security;
grant select, insert, delete on public.trip_members to authenticated;

drop policy if exists trip_members_select on public.trip_members;
create policy trip_members_select on public.trip_members
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid())
  );

drop policy if exists trip_members_insert_owner on public.trip_members;
create policy trip_members_insert_owner on public.trip_members
  for insert with check (
    exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid())
  );

drop policy if exists trip_members_delete on public.trip_members;
create policy trip_members_delete on public.trip_members
  for delete using (
    auth.uid() = user_id -- a member may remove themselves ("leave")
    or exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid())
  );

-- An invite waiting for its email to sign up. Resolved automatically by the
-- trigger below rather than the app ever having to poll it.
create table if not exists public.pending_trip_invites (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  email      text not null,
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (trip_id, email)
);

alter table public.pending_trip_invites enable row level security;
grant select, insert, delete on public.pending_trip_invites to authenticated;

drop policy if exists pending_invites_owner on public.pending_trip_invites;
create policy pending_invites_owner on public.pending_trip_invites
  for all using (
    exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid())
  );

-- Looks up an existing account by email, so the app can add a collaborator
-- immediately instead of only ever going through the pending-invite path.
-- security definer (+ a pinned search_path, to not be hijackable by a
-- session-local one) because it reads auth.users, which `authenticated` has
-- no grant on directly.
create or replace function public.find_user_id_by_email(lookup_email text)
returns uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select id from auth.users where lower(email) = lower(lookup_email) limit 1;
$$;

grant execute on function public.find_user_id_by_email(text) to authenticated;

-- Lets the owner see who already has access, with their email — same
-- security-definer reasoning as above. Returns no rows for a non-owner
-- caller rather than erroring, so the app doesn't need a separate check.
create or replace function public.list_trip_collaborators(p_trip_id uuid)
returns table (user_id uuid, email text, created_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select m.user_id, u.email, m.created_at
  from public.trip_members m
  join auth.users u on u.id = m.user_id
  where m.trip_id = p_trip_id
    and exists (select 1 from public.trips t where t.id = p_trip_id and t.owner_id = auth.uid());
$$;

grant execute on function public.list_trip_collaborators(uuid) to authenticated;

-- Fires on every new signup; a no-op unless that email has an invite waiting.
create or replace function public.resolve_pending_invites()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.trip_members (trip_id, user_id, invited_by)
  select trip_id, new.id, invited_by
  from public.pending_trip_invites
  where lower(email) = lower(new.email)
  on conflict (trip_id, user_id) do nothing;

  delete from public.pending_trip_invites where lower(email) = lower(new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_resolve_invites on auth.users;
create trigger on_auth_user_created_resolve_invites
  after insert on auth.users
  for each row execute function public.resolve_pending_invites();

-- --- 2. View-only share links -------------------------------------------------

create table if not exists public.trip_share_links (
  token      uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  label      text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists trip_share_links_trip_id_idx on public.trip_share_links (trip_id);

alter table public.trip_share_links enable row level security;
grant select, insert, update, delete on public.trip_share_links to authenticated;

drop policy if exists trip_share_links_owner on public.trip_share_links;
create policy trip_share_links_owner on public.trip_share_links
  for all using (
    exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid())
  );

-- Public, unauthenticated read for a share link. Deliberately bypasses RLS
-- (security definer) so `anon` never needs a direct grant on `trips` — only
-- the trip's `data` is returned, and only when the token is valid and not
-- revoked.
create or replace function public.get_trip_by_share_token(share_token uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select t.data
  from public.trip_share_links l
  join public.trips t on t.id = l.trip_id
  where l.token = share_token and l.revoked_at is null;
$$;

grant execute on function public.get_trip_by_share_token(uuid) to anon, authenticated;

-- --- 3. Let collaborators reach the trip itself ------------------------------

drop policy if exists trips_select_own on public.trips;
create policy trips_select_own on public.trips
  for select using (
    auth.uid() = owner_id
    or exists (
      select 1 from public.trip_members m
      where m.trip_id = id and m.user_id = auth.uid()
    )
  );

drop policy if exists trips_update_own on public.trips;
create policy trips_update_own on public.trips
  for update using (
    auth.uid() = owner_id
    or exists (
      select 1 from public.trip_members m
      where m.trip_id = id and m.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = owner_id
    or exists (
      select 1 from public.trip_members m
      where m.trip_id = id and m.user_id = auth.uid()
    )
  );

-- trips_insert_own and trips_delete_own are unchanged: creating and deleting
-- a trip both stay owner-only, even for an editor collaborator.

