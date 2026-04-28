-- Announcements setup
-- Run this in Supabase SQL Editor

create table if not exists public.announcements (
  announcement_id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  audience_type text not null check (audience_type in ('public', 'all_personnel', 'specific_personnel')),
  target_personnel_id uuid null references public.admin(admin_id) on delete set null,
  created_by uuid not null references public.admin(admin_id),
  created_at timestamptz not null default now()
);

alter table public.announcements
  add column if not exists attachments jsonb;

update public.announcements
set attachments = '[]'::jsonb
where attachments is null;

alter table public.announcements
  alter column attachments set default '[]'::jsonb;

alter table public.announcements
  alter column attachments set not null;

alter table public.announcements
  drop constraint if exists announcements_attachments_is_array;

alter table public.announcements
  add constraint announcements_attachments_is_array
  check (jsonb_typeof(attachments) = 'array');

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'announcement_attachments',
  'announcement_attachments',
  true,
  20971520,
  array[
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/bmp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "announcement_attachments_select_public" on storage.objects;
create policy "announcement_attachments_select_public"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'announcement_attachments');

drop policy if exists "announcement_attachments_insert_admin" on storage.objects;
create policy "announcement_attachments_insert_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'announcement_attachments'
  and exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
);

drop policy if exists "announcement_attachments_update_admin" on storage.objects;
create policy "announcement_attachments_update_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'announcement_attachments'
  and exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
)
with check (
  bucket_id = 'announcement_attachments'
  and exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
);

drop policy if exists "announcement_attachments_delete_admin" on storage.objects;
create policy "announcement_attachments_delete_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'announcement_attachments'
  and exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
);
