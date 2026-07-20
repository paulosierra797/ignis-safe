-- Attendance records and verification details for the QR attendance flow.
-- This script is additive and safe to run against an existing installation.

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  personnel_id integer not null,
  personnel_user_id uuid null references public.admin(admin_id) on delete set null,
  name text not null,
  rank text not null,
  attendance_date date not null,
  time_in timestamptz null,
  time_out timestamptz null,
  signature text,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  location_address text,
  distance_from_station_m double precision,
  station_id text,
  station_name text,
  face_match_percentage numeric(5, 2),
  verification_photo_path text,
  face_verification_passed boolean,
  location_verification_passed boolean,
  verification_status text,
  verification_type text,
  verification_recorded_at timestamptz,
  verification_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.attendance_records
  add column if not exists personnel_user_id uuid,
  add column if not exists location_address text,
  add column if not exists distance_from_station_m double precision,
  add column if not exists station_id text,
  add column if not exists station_name text,
  add column if not exists face_match_percentage numeric(5, 2),
  add column if not exists verification_photo_path text,
  add column if not exists face_verification_passed boolean,
  add column if not exists location_verification_passed boolean,
  add column if not exists verification_status text,
  add column if not exists verification_type text,
  add column if not exists verification_recorded_at timestamptz,
  add column if not exists verification_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_records_personnel_user_id_fkey'
  ) then
    alter table public.attendance_records
      add constraint attendance_records_personnel_user_id_fkey
      foreign key (personnel_user_id)
      references public.admin(admin_id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'attendance_records_distance_nonnegative'
  ) then
    alter table public.attendance_records
      add constraint attendance_records_distance_nonnegative
      check (distance_from_station_m is null or distance_from_station_m >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'attendance_records_face_percentage_range'
  ) then
    alter table public.attendance_records
      add constraint attendance_records_face_percentage_range
      check (face_match_percentage is null or face_match_percentage between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'attendance_records_verification_status_check'
  ) then
    alter table public.attendance_records
      add constraint attendance_records_verification_status_check
      check (verification_status is null or verification_status in ('passed', 'failed', 'partial'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'attendance_records_verification_type_check'
  ) then
    alter table public.attendance_records
      add constraint attendance_records_verification_type_check
      check (verification_type is null or verification_type in ('in', 'out'));
  end if;
end
$$;

create index if not exists idx_attendance_records_date
  on public.attendance_records(attendance_date);
create index if not exists idx_attendance_records_personnel
  on public.attendance_records(personnel_id);
create index if not exists idx_attendance_records_personnel_user
  on public.attendance_records(personnel_user_id);
create index if not exists idx_attendance_records_created_at
  on public.attendance_records(created_at desc);

alter table public.attendance_records enable row level security;

-- Remove the legacy policies that exposed every record to every visitor.
drop policy if exists "Attendance public read" on public.attendance_records;
drop policy if exists "Attendance public insert" on public.attendance_records;
drop policy if exists "Attendance public update" on public.attendance_records;
drop policy if exists "Attendance admins read all or personnel read own" on public.attendance_records;
drop policy if exists "Attendance personnel insert own" on public.attendance_records;
drop policy if exists "Attendance personnel update own" on public.attendance_records;

create policy "Attendance admins read all or personnel read own"
on public.attendance_records
for select
to authenticated
using (
  personnel_user_id = (select auth.uid())
  or exists (
    select 1
    from public.admin account
    where account.admin_id = (select auth.uid())
      and lower(account.role::text) = 'admin'
  )
);

create policy "Attendance personnel insert own"
on public.attendance_records
for insert
to authenticated
with check (personnel_user_id = (select auth.uid()));

create policy "Attendance personnel update own"
on public.attendance_records
for update
to authenticated
using (personnel_user_id = (select auth.uid()))
with check (personnel_user_id = (select auth.uid()));

revoke all on table public.attendance_records from anon;
revoke delete, truncate, references, trigger on table public.attendance_records from authenticated;
grant select, insert, update on table public.attendance_records to authenticated;

-- Verification captures contain biometric data and must remain private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attendance_verifications',
  'attendance_verifications',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Attendance verification photos read own or admin" on storage.objects;
drop policy if exists "Attendance verification photos upload own" on storage.objects;
drop policy if exists "Attendance verification photos delete own" on storage.objects;

create policy "Attendance verification photos read own or admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'attendance_verifications'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1
      from public.admin account
      where account.admin_id = (select auth.uid())
        and lower(account.role::text) = 'admin'
    )
  )
);

create policy "Attendance verification photos upload own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'attendance_verifications'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Attendance verification photos delete own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'attendance_verifications'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
