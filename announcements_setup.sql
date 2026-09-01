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

create table if not exists public.announcement_acknowledgments (
  ack_id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(announcement_id) on delete cascade,
  personnel_id uuid not null references public.admin(admin_id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  unique (announcement_id, personnel_id)
);

create index if not exists idx_announcement_ack_announcement
  on public.announcement_acknowledgments (announcement_id);

create index if not exists idx_announcement_ack_personnel
  on public.announcement_acknowledgments (personnel_id);

alter table public.announcements
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz null,
  add column if not exists archived_by uuid null references public.admin(admin_id) on delete set null;

-- Optional acknowledgement deadline (all_personnel / specific_personnel only).
-- When set, unacknowledged recipients are auto-nudged once a day until they
-- acknowledge. See migration
-- 20260901130000_add_announcement_acknowledgement_deadline.sql for the
-- private.generate_announcement_ack_nudges() generator and its pg_cron job.
alter table public.announcements
  add column if not exists acknowledgement_deadline timestamptz null;

create index if not exists idx_announcements_is_archived
  on public.announcements (is_archived);

-- Multi-recipient support: an announcement targeted at "specific_personnel"
-- can now address more than one person. target_personnel_id is kept only for
-- backward compatibility with rows written before this table existed; new
-- rows leave it null and record recipients here instead.
create table if not exists public.announcement_recipients (
  announcement_id uuid not null references public.announcements(announcement_id) on delete cascade,
  personnel_id uuid not null references public.admin(admin_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (announcement_id, personnel_id)
);

create index if not exists idx_announcement_recipients_personnel
  on public.announcement_recipients (personnel_id);

alter table public.announcements enable row level security;
alter table public.announcement_acknowledgments enable row level security;
alter table public.announcement_recipients enable row level security;

-- RLS on announcements and announcement_recipients used to reference each
-- other directly (announcements_select_authenticated queried
-- announcement_recipients, while announcement_recipients_insert_admin
-- queried announcements). Because each read re-triggers the other table's
-- RLS policies, this two-table cycle made Postgres raise "infinite
-- recursion detected in policy for relation announcement_recipients" as
-- soon as an admin tried to insert recipients (i.e. submit the Create
-- Announcement form). These SECURITY DEFINER helpers read the referenced
-- table directly, bypassing its RLS, so neither policy re-enters
-- announcement_recipients' own policy evaluation.
create schema if not exists private;

create or replace function private.is_announcement_recipient(_announcement_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.announcement_recipients ar
    where ar.announcement_id = _announcement_id
      and ar.personnel_id = (select auth.uid())
  );
$$;

create or replace function private.is_own_specific_announcement(_announcement_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.announcements an
    where an.announcement_id = _announcement_id
      and an.audience_type = 'specific_personnel'
      and an.created_by = (select auth.uid())
  );
$$;

drop policy if exists "announcements_select_public" on public.announcements;
create policy "announcements_select_public"
on public.announcements
for select
to anon
using (
  audience_type = 'public'
  and is_archived = false
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
    is_archived = false
    and audience_type = 'all_personnel'
    and exists (
      select 1
      from public.admin actor
      where actor.admin_id = auth.uid()
        and lower(actor.role) = 'personnel'
    )
  )
  or (
    is_archived = false
    and audience_type = 'specific_personnel'
    and (
      target_personnel_id = auth.uid()
      or private.is_announcement_recipient(announcements.announcement_id)
    )
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
  and target_personnel_id is null
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

drop policy if exists "announcement_recipients_select" on public.announcement_recipients;
create policy "announcement_recipients_select"
on public.announcement_recipients
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

drop policy if exists "announcement_recipients_insert_admin" on public.announcement_recipients;
create policy "announcement_recipients_insert_admin"
on public.announcement_recipients
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
  and exists (
    select 1
    from public.admin target_user
    where target_user.admin_id = personnel_id
      and lower(target_user.role) = 'personnel'
  )
  and private.is_own_specific_announcement(announcement_recipients.announcement_id)
);

drop policy if exists "announcement_recipients_delete_admin" on public.announcement_recipients;
create policy "announcement_recipients_delete_admin"
on public.announcement_recipients
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

drop policy if exists "announcement_ack_select_admin" on public.announcement_acknowledgments;
create policy "announcement_ack_select_admin"
on public.announcement_acknowledgments
for select
to authenticated
using (
  exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
);

drop policy if exists "announcement_ack_select_personnel_own" on public.announcement_acknowledgments;
create policy "announcement_ack_select_personnel_own"
on public.announcement_acknowledgments
for select
to authenticated
using (
  personnel_id = auth.uid()
);

-- personnel_id = auth.uid() plus the announcement-visibility check below
-- already restrict inserts to the caller's own row for announcements they
-- can see, so no separate admin.role = 'personnel' gate is needed (that
-- gate previously blocked the Personnel Workspace preview, where an admin
-- browsing /personnel routes gets a JS-only role override while
-- admin.role stays 'admin'). The subquery must correlate with
-- announcement_acknowledgments.announcement_id explicitly: writing the
-- unqualified column name here resolves to the subquery's own `an` alias
-- instead (both have an announcement_id column), which compiles to the
-- tautology `an.announcement_id = an.announcement_id` and silently breaks
-- the audience check.
drop policy if exists "announcement_ack_insert_personnel_own" on public.announcement_acknowledgments;
create policy "announcement_ack_insert_personnel_own"
on public.announcement_acknowledgments
for insert
to authenticated
with check (
  personnel_id = auth.uid()
  and exists (
    select 1
    from public.announcements an
    where an.announcement_id = announcement_acknowledgments.announcement_id
      and an.is_archived = false
      and (
        an.audience_type = 'all_personnel'
        or (
          an.audience_type = 'specific_personnel'
          and (
            an.target_personnel_id = auth.uid()
            or exists (
              select 1
              from public.announcement_recipients ar
              where ar.announcement_id = an.announcement_id
                and ar.personnel_id = auth.uid()
            )
          )
        )
      )
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
