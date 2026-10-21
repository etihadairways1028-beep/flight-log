-- Flight Log cloud schema for Supabase.
-- Run once in your project: Supabase dashboard → SQL Editor → New query → paste → Run.
-- Each user's logbook is stored as JSON documents keyed by (user_id, key).
-- Row-level security guarantees a signed-in user can only read and write their own rows.

create table if not exists public.skylog_data (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  key        text        not null check (key in ('settings', 'ws:personal')),
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.skylog_data enable row level security;

drop policy if exists "skylog: read own"   on public.skylog_data;
drop policy if exists "skylog: insert own" on public.skylog_data;
drop policy if exists "skylog: update own" on public.skylog_data;
drop policy if exists "skylog: delete own" on public.skylog_data;

create policy "skylog: read own"   on public.skylog_data for select using (auth.uid() = user_id);
create policy "skylog: insert own" on public.skylog_data for insert with check (auth.uid() = user_id);
create policy "skylog: update own" on public.skylog_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "skylog: delete own" on public.skylog_data for delete using (auth.uid() = user_id);

-- Keep documents to a sane size (≈5 MB). Photos stay on each device and are not uploaded.
alter table public.skylog_data drop constraint if exists skylog_value_size;
alter table public.skylog_data add constraint skylog_value_size check (pg_column_size(value) < 5242880);

-- ─── Public profiles (optional "Friends" feature) ──────────────────────────
-- A profile is a summary you choose to publish (totals, route list, top aircraft).
-- Anyone can read published profiles; only the owner can create, change or remove theirs.
create table if not exists public.skylog_profiles (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  handle     text        not null unique check (handle ~ '^[a-z0-9_.-]{3,30}$'),
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.skylog_profiles enable row level security;

drop policy if exists "profiles: public read" on public.skylog_profiles;
drop policy if exists "profiles: insert own"  on public.skylog_profiles;
drop policy if exists "profiles: update own"  on public.skylog_profiles;
drop policy if exists "profiles: delete own"  on public.skylog_profiles;

create policy "profiles: public read" on public.skylog_profiles for select using (true);
create policy "profiles: insert own"  on public.skylog_profiles for insert with check (auth.uid() = user_id);
create policy "profiles: update own"  on public.skylog_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "profiles: delete own"  on public.skylog_profiles for delete using (auth.uid() = user_id);

alter table public.skylog_profiles drop constraint if exists skylog_profile_size;
alter table public.skylog_profiles add constraint skylog_profile_size check (pg_column_size(data) < 262144);
