-- Announcements setup
-- Run this in Supabase SQL Editor

create table if not exists public.announcements (
  announcement_id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  audience_type text not null check (audience_type in ('public', 'all_personnel', 'specific_personnel')),
  target_personnel_id uuid null references public.admin(admin_id) on delete set null,
  created_by uuid not null references public.admin(admin_id),
  created_at timestamptz not null default now()
);

create index if not exists idx_announcements_created_at
  on public.announcements (created_at desc);

create index if not exists idx_announcements_audience
  on public.announcements (audience_type);

create index if not exists idx_announcements_target_personnel
  on public.announcements (target_personnel_id);

alter table public.announcements enable row level security;

drop policy if exists "announcements_select_public" on public.announcements;
create policy "announcements_select_public"
on public.announcements
for select
to anon
using (
  audience_type = 'public'
);

drop policy if exists "announcements_select_authenticated" on public.announcements;
create policy "announcements_select_authenticated"
on public.announcements
for select
to authenticated
using (
  exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
  or (
    audience_type = 'all_personnel'
    and exists (
      select 1
      from public.admin actor
      where actor.admin_id = auth.uid()
        and lower(actor.role) = 'personnel'
    )
  )
  or (
    audience_type = 'specific_personnel'
    and target_personnel_id = auth.uid()
  )
);

drop policy if exists "announcements_insert_admin" on public.announcements;
create policy "announcements_insert_admin"
on public.announcements
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
  and (
    (audience_type = 'specific_personnel' and target_personnel_id is not null)
    or (audience_type in ('public', 'all_personnel') and target_personnel_id is null)
  )
  and (
    target_personnel_id is null
    or exists (
      select 1
      from public.admin target_user
      where target_user.admin_id = target_personnel_id
        and lower(target_user.role) = 'personnel'
    )
  )
  and created_by = auth.uid()
);

drop policy if exists "announcements_update_admin" on public.announcements;
create policy "announcements_update_admin"
on public.announcements
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

drop policy if exists "announcements_delete_admin" on public.announcements;
create policy "announcements_delete_admin"
on public.announcements
for delete
to authenticated
using (
  exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
);
