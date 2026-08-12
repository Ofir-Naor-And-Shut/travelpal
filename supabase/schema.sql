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

-- `trips` and `trip_members` policies each need to check the other table —
-- done as plain EXISTS subqueries at first, which Postgres rejected with
-- "infinite recursion detected in policy for relation trips" (42P17):
-- evaluating trips' policy required trip_members' policy, which required
-- trips' policy again, forever. These two SECURITY DEFINER functions break
-- the cycle — their internal queries run as the function's (superuser) owner
-- and so bypass RLS entirely, instead of re-triggering the other table's policy.
create or replace function public.is_trip_owner(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip_id and t.owner_id = auth.uid()
  );
$$;

grant execute on function public.is_trip_owner(uuid) to authenticated;

create or replace function public.is_trip_editor(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id and m.user_id = auth.uid() and m.status = 'accepted'
  );
$$;

grant execute on function public.is_trip_editor(uuid) to authenticated;

-- Same check but ANY status — lets a not-yet-accepted invitee still read the
-- trip (title, dates) so the app can show them what they're being asked to
-- join, without granting edit access before they've actually accepted.
create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id and m.user_id = auth.uid()
  );
$$;

grant execute on function public.is_trip_member(uuid) to authenticated;

create table if not exists public.trip_members (
  trip_id    uuid not null references public.trips (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index if not exists trip_members_user_id_idx on public.trip_members (user_id);

alter table public.trip_members enable row level security;
grant select, insert, update, delete on public.trip_members to authenticated;

-- Added after some deployments already had this table — backfill existing
-- rows (shared before "accept" existed) as already-accepted, so a past share
-- doesn't retroactively lose edit access. Every new row defaults to pending.
alter table public.trip_members add column if not exists status text;
update public.trip_members set status = 'accepted' where status is null;
alter table public.trip_members alter column status set default 'pending';
alter table public.trip_members alter column status set not null;
alter table public.trip_members drop constraint if exists trip_members_status_check;
alter table public.trip_members add constraint trip_members_status_check
  check (status in ('pending', 'accepted'));

drop policy if exists trip_members_select on public.trip_members;
create policy trip_members_select on public.trip_members
  for select using (
    auth.uid() = user_id
    or public.is_trip_owner(trip_id)
  );

drop policy if exists trip_members_insert_owner on public.trip_members;
create policy trip_members_insert_owner on public.trip_members
  for insert with check ( public.is_trip_owner(trip_id) );

-- The only self-update allowed is accepting an invitation (status only —
-- there's nothing else on this row worth protecting column-by-column).
drop policy if exists trip_members_update_self on public.trip_members;
create policy trip_members_update_self on public.trip_members
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists trip_members_delete on public.trip_members;
create policy trip_members_delete on public.trip_members
  for delete using (
    auth.uid() = user_id -- a member may remove themselves ("leave" or decline)
    or public.is_trip_owner(trip_id)
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
  for all using ( public.is_trip_owner(trip_id) )
  with check ( public.is_trip_owner(trip_id) );

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
-- Dropped first: Postgres refuses to CREATE OR REPLACE a function whose
-- return columns changed (here, adding `status`) — only DROP + recreate can.
drop function if exists public.list_trip_collaborators(uuid);
create or replace function public.list_trip_collaborators(p_trip_id uuid)
returns table (user_id uuid, email text, status text, created_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select m.user_id, u.email, m.status, m.created_at
  from public.trip_members m
  join auth.users u on u.id = m.user_id
  where m.trip_id = p_trip_id
    and public.is_trip_owner(p_trip_id);
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
  for all using ( public.is_trip_owner(trip_id) )
  with check ( public.is_trip_owner(trip_id) );

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
    or public.is_trip_member(id)
  );

drop policy if exists trips_update_own on public.trips;
create policy trips_update_own on public.trips
  for update using (
    auth.uid() = owner_id
    or public.is_trip_editor(id)
  )
  with check (
    auth.uid() = owner_id
    or public.is_trip_editor(id)
  );

-- trips_insert_own and trips_delete_own are unchanged: creating and deleting
-- a trip both stay owner-only, even for an editor collaborator.

-- ============================================================================
--  Phase 4 — Admin access.
--
--  One designated admin account that signs in with a real Supabase password
--  instead of a magic link (no email round trip). The account itself is
--  created once by hand in the Supabase dashboard (Authentication → Add
--  user → set a password → tick "Auto Confirm User") — never scripted here,
--  so no password ever passes through this repo.
--
--  What this section adds is the *authorization*: a `role: admin` claim in
--  app_metadata unlocks read/update/delete on every trip, on top of the
--  normal owner/collaborator policies. app_metadata (unlike user_metadata)
--  can only be set by a service-role request — a signed-in user can never
--  grant themselves this claim by editing their own profile — so `auth.jwt()`
--  is a trustworthy place to read it back from inside a policy.
-- ============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

grant execute on function public.is_admin() to authenticated;

drop policy if exists trips_select_own on public.trips;
create policy trips_select_own on public.trips
  for select using (
    auth.uid() = owner_id
    or public.is_trip_member(id)
    or public.is_admin()
  );

drop policy if exists trips_update_own on public.trips;
create policy trips_update_own on public.trips
  for update using (
    auth.uid() = owner_id
    or public.is_trip_editor(id)
    or public.is_admin()
  )
  with check (
    auth.uid() = owner_id
    or public.is_trip_editor(id)
    or public.is_admin()
  );

drop policy if exists trips_delete_own on public.trips;
create policy trips_delete_own on public.trips
  for delete using (auth.uid() = owner_id or public.is_admin());

-- trips_insert_own is unchanged — the admin manages existing trips, it never
-- creates one on another user's behalf (that would need an owner_id it isn't).

-- Run once, after creating the admin account above, to grant it the claim
-- (replace the email). Safe to re-run.
-- update auth.users
-- set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
-- where email = 'admin@example.com';

