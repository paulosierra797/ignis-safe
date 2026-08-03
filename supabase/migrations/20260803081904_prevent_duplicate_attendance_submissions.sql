-- Prevent duplicate QR attendance submissions with server-side validation.
-- Applied in Supabase as version 20260803081904.

begin;

alter table public.attendance_records
  add column if not exists shift_id text,
  add column if not exists qr_session_id text;

update public.attendance_records
set shift_id = coalesce(nullif(trim(shift_id), ''), nullif(trim(station_id), ''), 'DEFAULT')
where shift_id is null or trim(shift_id) = '';

alter table public.attendance_records
  alter column shift_id set default 'DEFAULT',
  alter column shift_id set not null;

do $$
begin
  if exists (
    select 1
    from public.attendance_records
    group by personnel_id, shift_id, attendance_date
    having count(*) > 1
  ) then
    raise exception 'Duplicate attendance records already exist. Resolve duplicates before adding attendance uniqueness.';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attendance_records_personnel_shift_date_unique'
  ) then
    alter table public.attendance_records
      add constraint attendance_records_personnel_shift_date_unique
      unique (personnel_id, shift_id, attendance_date);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'attendance_records_time_out_requires_time_in'
  ) then
    alter table public.attendance_records
      add constraint attendance_records_time_out_requires_time_in
      check (time_out is null or time_in is not null);
  end if;
end
$$;

create index if not exists idx_attendance_records_personnel_user_shift_date
  on public.attendance_records(personnel_user_id, shift_id, attendance_date);

alter table public.attendance_records enable row level security;

drop policy if exists "Attendance admins read all or personnel read own" on public.attendance_records;
drop policy if exists "Attendance personnel insert own" on public.attendance_records;
drop policy if exists "Attendance personnel update own" on public.attendance_records;

create policy "Attendance admins read all or personnel read own"
on public.attendance_records
for select
to authenticated
using (
  personnel_user_id = (select auth.uid())
  or (select private.current_backoffice_role()) = 'admin'
);

-- Attendance writes must go through public.record_attendance_action().
revoke insert, update, delete, truncate, references, trigger on table public.attendance_records from anon, authenticated;
grant select on table public.attendance_records to authenticated;

create or replace function private.manila_attendance_date()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;

revoke all on function private.manila_attendance_date() from public, anon;
grant execute on function private.manila_attendance_date() to authenticated;

create or replace function public.get_own_attendance_status(
  p_shift_id text default 'DEFAULT',
  p_qr_session_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_uid uuid := (select auth.uid());
  actor_role text;
  attendance_day date := private.manila_attendance_date();
  normalized_shift text := coalesce(nullif(trim(p_shift_id), ''), 'DEFAULT');
  qr_row public.qr_sessions%rowtype;
  attendance_row public.attendance_records%rowtype;
  time_in_label text;
begin
  if actor_uid is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  actor_role := (select private.current_backoffice_role());
  if actor_role not in ('admin', 'personnel') then
    raise exception 'Only active accounts may view attendance status.' using errcode = '42501';
  end if;

  if p_qr_session_id is not null and trim(p_qr_session_id) <> '' then
    select *
    into qr_row
    from public.qr_sessions
    where session_id = trim(p_qr_session_id)
    limit 1;

    if not found then
      raise exception 'Invalid QR session' using errcode = '22023';
    end if;

    if coalesce(qr_row.used, false) then
      raise exception 'QR already used' using errcode = '22023';
    end if;

    if qr_row.expires_at <= now() then
      raise exception 'QR expired' using errcode = '22023';
    end if;

    normalized_shift := coalesce(nullif(trim(qr_row.station_id), ''), normalized_shift);
  end if;

  select *
  into attendance_row
  from public.attendance_records
  where personnel_user_id = actor_uid
    and shift_id = normalized_shift
    and attendance_date = attendance_day
  limit 1;

  if not found then
    return jsonb_build_object(
      'state', 'none',
      'attendance_date', attendance_day,
      'shift_id', normalized_shift,
      'can_time_in', true,
      'can_time_out', false,
      'message', 'No attendance record found. You may record Time In.',
      'record', null
    );
  end if;

  if attendance_row.time_in is not null and attendance_row.time_out is null then
    time_in_label := to_char(attendance_row.time_in at time zone 'Asia/Manila', 'HH12:MI AM');

    return jsonb_build_object(
      'state', 'time_in_only',
      'attendance_date', attendance_day,
      'shift_id', normalized_shift,
      'can_time_in', false,
      'can_time_out', true,
      'message', 'Your Time In was recorded at ' || time_in_label || '. You may record your Time Out after your shift.',
      'record', to_jsonb(attendance_row)
    );
  end if;

  return jsonb_build_object(
    'state', 'completed',
    'attendance_date', attendance_day,
    'shift_id', normalized_shift,
    'can_time_in', false,
    'can_time_out', false,
    'message', 'Attendance completed for today.',
    'record', to_jsonb(attendance_row)
  );
end;
$$;

create or replace function public.record_attendance_action(
  p_mode text,
  p_shift_id text,
  p_qr_session_id text,
  p_location jsonb default '{}'::jsonb,
  p_verification jsonb default '{}'::jsonb,
  p_photo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  duplicate_message constant text := 'Your attendance for this action has already been recorded.';
  actor_uid uuid := (select auth.uid());
  actor_role text;
  actor_name text;
  actor_rank text;
  legacy_personnel_id integer;
  attendance_day date := private.manila_attendance_date();
  action_time timestamptz := now();
  normalized_mode text := lower(trim(coalesce(p_mode, '')));
  normalized_shift text := coalesce(nullif(trim(p_shift_id), ''), 'DEFAULT');
  qr_row public.qr_sessions%rowtype;
  existing_row public.attendance_records%rowtype;
  changed_row public.attendance_records%rowtype;
begin
  if actor_uid is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  actor_role := (select private.current_backoffice_role());
  if actor_role <> 'personnel' then
    raise exception 'Only active personnel accounts may record attendance.' using errcode = '42501';
  end if;

  if normalized_mode not in ('in', 'out') then
    raise exception 'Invalid attendance action.' using errcode = '22023';
  end if;

  if p_qr_session_id is null or trim(p_qr_session_id) = '' then
    raise exception 'Invalid QR session' using errcode = '22023';
  end if;

  select *
  into qr_row
  from public.qr_sessions
  where session_id = trim(p_qr_session_id)
  limit 1;

  if not found then
    raise exception 'Invalid QR session' using errcode = '22023';
  end if;

  if coalesce(qr_row.used, false) then
    raise exception 'QR already used' using errcode = '22023';
  end if;

  if qr_row.expires_at <= now() then
    raise exception 'QR expired' using errcode = '22023';
  end if;

  normalized_shift := coalesce(nullif(trim(qr_row.station_id), ''), normalized_shift);

  select
    coalesce(
      nullif(trim(concat_ws(' ', workspace.first_name, workspace.last_name)), ''),
      nullif(trim(concat_ws(' ', account.first_name, account.last_name)), ''),
      nullif(trim(account.name), ''),
      nullif(trim(account.email), ''),
      actor_uid::text
    ),
    coalesce(nullif(trim(workspace.rank), ''), nullif(trim(account.rank), ''), 'Personnel')
  into actor_name, actor_rank
  from public.admin as account
  left join public.personnel_workspace_profiles as workspace
    on workspace.admin_id = account.admin_id
  where account.admin_id = actor_uid
  limit 1;

  legacy_personnel_id := least(2147483647, abs(hashtext(actor_uid::text)::bigint) + 1)::integer;

  select *
  into existing_row
  from public.attendance_records
  where personnel_user_id = actor_uid
    and shift_id = normalized_shift
    and attendance_date = attendance_day
  for update;

  if normalized_mode = 'in' then
    if found then
      raise exception '%', duplicate_message using errcode = '23505';
    end if;

    insert into public.attendance_records (
      id,
      personnel_id,
      personnel_user_id,
      shift_id,
      qr_session_id,
      name,
      rank,
      attendance_date,
      time_in,
      time_out,
      signature,
      latitude,
      longitude,
      accuracy,
      location_address,
      distance_from_station_m,
      station_id,
      station_name,
      face_match_percentage,
      verification_photo_path,
      face_verification_passed,
      location_verification_passed,
      verification_status,
      verification_type,
      verification_recorded_at,
      verification_metadata,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      legacy_personnel_id,
      actor_uid,
      normalized_shift,
      trim(p_qr_session_id),
      actor_name,
      actor_rank,
      attendance_day,
      action_time,
      null,
      actor_name || ' (QR Verified)',
      nullif(p_location->>'latitude', '')::double precision,
      nullif(p_location->>'longitude', '')::double precision,
      nullif(p_location->>'accuracy', '')::double precision,
      p_verification->>'location_address',
      nullif(p_verification->>'distance_from_station_m', '')::double precision,
      coalesce(nullif(p_verification->>'station_id', ''), normalized_shift),
      p_verification->>'station_name',
      nullif(p_verification->>'face_match_percentage', '')::numeric,
      p_photo_path,
      nullif(p_verification->>'face_verification_passed', '')::boolean,
      nullif(p_verification->>'location_verification_passed', '')::boolean,
      p_verification->>'verification_status',
      'in',
      coalesce(p_verification->>'verification_recorded_at', p_verification->>'recorded_at')::timestamptz,
      coalesce(p_verification->'verification_metadata', '{}'::jsonb),
      action_time,
      action_time
    )
    returning * into changed_row;

    return jsonb_build_object(
      'action', 'created',
      'status', public.get_own_attendance_status(normalized_shift, p_qr_session_id),
      'record', to_jsonb(changed_row)
    );
  end if;

  if not found or existing_row.time_in is null then
    raise exception 'Time Out cannot be recorded without an existing Time In.' using errcode = '23514';
  end if;

  if existing_row.time_out is not null then
    raise exception '%', duplicate_message using errcode = '23505';
  end if;

  update public.attendance_records
  set
    time_out = action_time,
    qr_session_id = trim(p_qr_session_id),
    signature = actor_name || ' (QR Verified)',
    latitude = nullif(p_location->>'latitude', '')::double precision,
    longitude = nullif(p_location->>'longitude', '')::double precision,
    accuracy = nullif(p_location->>'accuracy', '')::double precision,
    location_address = p_verification->>'location_address',
    distance_from_station_m = nullif(p_verification->>'distance_from_station_m', '')::double precision,
    station_id = coalesce(nullif(p_verification->>'station_id', ''), normalized_shift),
    station_name = p_verification->>'station_name',
    face_match_percentage = nullif(p_verification->>'face_match_percentage', '')::numeric,
    verification_photo_path = p_photo_path,
    face_verification_passed = nullif(p_verification->>'face_verification_passed', '')::boolean,
    location_verification_passed = nullif(p_verification->>'location_verification_passed', '')::boolean,
    verification_status = p_verification->>'verification_status',
    verification_type = 'out',
    verification_recorded_at = coalesce(p_verification->>'verification_recorded_at', p_verification->>'recorded_at')::timestamptz,
    verification_metadata = coalesce(p_verification->'verification_metadata', '{}'::jsonb),
    updated_at = action_time
  where id = existing_row.id
    and time_out is null
  returning * into changed_row;

  if not found then
    raise exception '%', duplicate_message using errcode = '23505';
  end if;

  return jsonb_build_object(
    'action', 'updated',
    'status', public.get_own_attendance_status(normalized_shift, p_qr_session_id),
    'record', to_jsonb(changed_row)
  );
end;
$$;

revoke all on function public.get_own_attendance_status(text, text) from public, anon;
revoke all on function public.record_attendance_action(text, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.get_own_attendance_status(text, text) to authenticated;
grant execute on function public.record_attendance_action(text, text, text, jsonb, jsonb, text) to authenticated;

commit;
