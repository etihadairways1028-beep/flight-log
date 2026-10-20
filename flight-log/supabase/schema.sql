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
