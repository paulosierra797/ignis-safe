-- App session tracking setup
-- Run this in Supabase SQL Editor to record app open/close durations

create table if not exists public.app_sessions (
  session_id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admin(admin_id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  duration_seconds integer null check (duration_seconds >= 0),
  closure_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_sessions_admin_started_at
  on public.app_sessions (admin_id, started_at desc);

create index if not exists idx_app_sessions_ended_at
  on public.app_sessions (ended_at desc);

alter table public.app_sessions enable row level security;

drop policy if exists "app_sessions_select_authenticated" on public.app_sessions;
create policy "app_sessions_select_authenticated"
on public.app_sessions
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "app_sessions_insert_own" on public.app_sessions;
create policy "app_sessions_insert_own"
on public.app_sessions
for insert
to authenticated
with check (admin_id::text = auth.uid()::text);

drop policy if exists "app_sessions_update_own" on public.app_sessions;
create policy "app_sessions_update_own"
on public.app_sessions
for update
to authenticated
using (admin_id::text = auth.uid()::text)
with check (admin_id::text = auth.uid()::text);
