-- Drop the manual "Mobile Learning Access" flag. Access to the mobile
-- learning tables is now purely status-driven: Admin/Personnel accounts
-- (rows in public.admin) are allowed whenever their status is Active,
-- with no separate opt-in flag required. Mobile-only accounts (no row in
-- public.admin) remain unaffected.
begin;

alter table public.admin
  drop column if exists mobile_access_enabled;

create or replace function private.mobile_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not exists (
      select 1 from public.admin a where a.admin_id = (select auth.uid())
    )
    or exists (
      select 1 from public.admin a
      where a.admin_id = (select auth.uid())
        and lower(coalesce(a.status, '')) = 'active'
    );
$$;

commit;
