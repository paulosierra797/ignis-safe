create table if not exists public.personnel_workspace_profiles (
  admin_id uuid primary key references public.admin(admin_id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  rank text,
  contact_number text,
  avatar_url text,
  status text not null default 'Active'
    check (status in ('Active', 'Inactive', 'Suspended', 'On Leave')),
  leave_start_date date,
  leave_end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.personnel_workspace_profiles enable row level security;

drop policy if exists personnel_workspace_profiles_select_authenticated
  on public.personnel_workspace_profiles;
create policy personnel_workspace_profiles_select_authenticated
  on public.personnel_workspace_profiles
  for select
  to authenticated
  using (true);

drop policy if exists personnel_workspace_profiles_insert_admin
  on public.personnel_workspace_profiles;
create policy personnel_workspace_profiles_insert_admin
  on public.personnel_workspace_profiles
  for insert
  to authenticated
  with check (
    admin_id = auth.uid()
    or exists (
      select 1
      from public.admin actor
      where actor.admin_id = auth.uid()
        and lower(actor.role) = 'admin'
    )
  );

drop policy if exists personnel_workspace_profiles_update_admin
  on public.personnel_workspace_profiles;
create policy personnel_workspace_profiles_update_admin
  on public.personnel_workspace_profiles
  for update
  to authenticated
  using (
    admin_id = auth.uid()
    or exists (
      select 1
      from public.admin actor
      where actor.admin_id = auth.uid()
        and lower(actor.role) = 'admin'
    )
  )
  with check (
    admin_id = auth.uid()
    or exists (
      select 1
      from public.admin actor
      where actor.admin_id = auth.uid()
        and lower(actor.role) = 'admin'
    )
  );

insert into public.personnel_workspace_profiles (
  admin_id,
  first_name,
  last_name,
  email,
  rank,
  contact_number,
  avatar_url
)
select
  admin_id,
  first_name,
  last_name,
  email,
  rank,
  contact_number,
  avatar_url
from public.admin
where lower(role) = 'admin'
on conflict (admin_id) do nothing;
