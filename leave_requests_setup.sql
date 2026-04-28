-- Setup script for personnel leave request approval workflow
-- Run this in Supabase SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.leave_requests (
  request_id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references public.admin(admin_id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid null references public.admin(admin_id) on delete set null,
  approved_at timestamptz null,
  rejection_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_date_range_chk check (end_date >= start_date)
);

create index if not exists idx_leave_requests_personnel on public.leave_requests (personnel_id);
create index if not exists idx_leave_requests_status_created on public.leave_requests (status, created_at desc);

create or replace function public.set_leave_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_leave_requests_updated_at on public.leave_requests;
create trigger trg_leave_requests_updated_at
before update on public.leave_requests
for each row
execute function public.set_leave_requests_updated_at();

alter table public.leave_requests enable row level security;

grant select, insert, update on table public.leave_requests to authenticated;

drop policy if exists "leave_requests_select_own_or_admin" on public.leave_requests;
create policy "leave_requests_select_own_or_admin"
on public.leave_requests
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

drop policy if exists "leave_requests_insert_personnel" on public.leave_requests;
create policy "leave_requests_insert_personnel"
on public.leave_requests
for insert
to authenticated
with check (
  personnel_id = auth.uid()
  and status = 'pending'
);

drop policy if exists "leave_requests_update_admin" on public.leave_requests;
create policy "leave_requests_update_admin"
on public.leave_requests
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
