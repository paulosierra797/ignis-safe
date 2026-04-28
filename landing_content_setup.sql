-- Landing page content setup
-- Run this in Supabase SQL Editor.

create table if not exists public.landing_content (
  id text primary key,
  content jsonb not null,
  updated_by uuid null references public.admin(admin_id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint landing_content_default_id_check check (id = 'default')
);

create index if not exists idx_landing_content_updated_at
  on public.landing_content (updated_at desc);

alter table public.landing_content enable row level security;

grant select on table public.landing_content to anon;
grant select, insert, update on table public.landing_content to authenticated;

-- Public can read current landing content.
drop policy if exists "landing_content_select_public" on public.landing_content;
create policy "landing_content_select_public"
on public.landing_content
for select
to anon, authenticated
using (id = 'default');

-- Only admins can insert first landing content row.
drop policy if exists "landing_content_insert_admin" on public.landing_content;
create policy "landing_content_insert_admin"
on public.landing_content
for insert
to authenticated
with check (
  id = 'default'
  and exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
);

-- Only admins can update landing content.
drop policy if exists "landing_content_update_admin" on public.landing_content;
create policy "landing_content_update_admin"
on public.landing_content
for update
to authenticated
using (
  id = 'default'
  and exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
)
with check (
  id = 'default'
  and exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
);
