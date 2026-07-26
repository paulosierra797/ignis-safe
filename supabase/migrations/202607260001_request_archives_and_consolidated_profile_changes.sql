alter table public.leave_requests
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.admin(admin_id) on delete set null;

alter table public.profile_change_requests
  add column if not exists changes jsonb not null default '{}'::jsonb,
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.admin(admin_id) on delete set null;

drop index if exists public.idx_profile_change_requests_unique_pending;
create unique index if not exists idx_profile_change_requests_one_pending
  on public.profile_change_requests (personnel_id)
  where status = 'pending';

create index if not exists idx_leave_requests_archived
  on public.leave_requests (is_archived, created_at desc);

create index if not exists idx_profile_change_requests_archived
  on public.profile_change_requests (is_archived, requested_at desc);

update public.admin
set
  status = 'Active',
  leave_start_date = null,
  leave_end_date = null
where lower(role) = 'admin'
  and (
    lower(coalesce(status, '')) = 'on leave'
    or leave_start_date is not null
    or leave_end_date is not null
  );

alter table public.admin
  drop constraint if exists admin_accounts_cannot_be_on_leave;

alter table public.admin
  add constraint admin_accounts_cannot_be_on_leave
  check (
    lower(coalesce(role, '')) <> 'admin'
    or (
      lower(coalesce(status, '')) <> 'on leave'
      and leave_start_date is null
      and leave_end_date is null
    )
  );
