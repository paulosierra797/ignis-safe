-- Setup script for personnel profile change request workflow
-- Run this in Supabase SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.profile_change_requests (
  request_id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references public.admin(admin_id) on delete cascade,
  field_name text not null check (field_name in ('first_name', 'last_name', 'rank', 'email', 'contact_number')),
  current_value text,
  requested_value text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by uuid null references public.admin(admin_id) on delete set null,
  constraint profile_change_requests_name_value_format check (
    field_name not in ('first_name', 'last_name')
    or requested_value ~ '^[A-Za-z]+( [A-Za-z]+)*$'
  )
);

-- If the table already exists from an earlier version of this script, add the
-- name-format constraint on its own so re-running this file stays idempotent.
-- NOT VALID means Postgres enforces it for all new inserts/updates but does not
-- re-check rows that already exist, so legacy requests saved before this rule
-- existed won't block the migration. Run the VALIDATE CONSTRAINT statement
-- below once old offending rows have been reviewed/cleaned up, if desired.
alter table public.profile_change_requests
  drop constraint if exists profile_change_requests_name_value_format;
alter table public.profile_change_requests
  add constraint profile_change_requests_name_value_format check (
    field_name not in ('first_name', 'last_name')
    or requested_value ~ '^[A-Za-z]+( [A-Za-z]+)*$'
  ) not valid;

-- Optional: inspect any existing rows that would fail the new rule.
-- select request_id, personnel_id, field_name, requested_value, status
-- from public.profile_change_requests
-- where field_name in ('first_name', 'last_name')
--   and requested_value !~ '^[A-Za-z]+( [A-Za-z]+)*$';

-- Optional: once legacy rows above are fixed or removed, tighten enforcement
-- to cover existing rows too by running:
-- alter table public.profile_change_requests
--   validate constraint profile_change_requests_name_value_format;

create index if not exists idx_profile_change_requests_personnel on public.profile_change_requests (personnel_id);
create index if not exists idx_profile_change_requests_status on public.profile_change_requests (status, requested_at desc);

-- Prevent more than one pending request for the same personnel + field combination
create unique index if not exists idx_profile_change_requests_unique_pending
on public.profile_change_requests (personnel_id, field_name)
where (status = 'pending');

alter table public.profile_change_requests enable row level security;

grant select, insert, update on table public.profile_change_requests to authenticated;

drop policy if exists "profile_change_requests_select_own_or_admin" on public.profile_change_requests;
create policy "profile_change_requests_select_own_or_admin"
on public.profile_change_requests
for select
to authenticated
using (
  personnel_id = auth.uid()
  or exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
);

drop policy if exists "profile_change_requests_insert_own" on public.profile_change_requests;
create policy "profile_change_requests_insert_own"
on public.profile_change_requests
for insert
to authenticated
with check (
  personnel_id = auth.uid()
  and status = 'pending'
);

drop policy if exists "profile_change_requests_update_admin" on public.profile_change_requests;
create policy "profile_change_requests_update_admin"
on public.profile_change_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
);
