-- Fix "column account.name does not exist" on Confirm Attendance (Time In/Time Out).
--
-- record_attendance_action() derived actor_name with a coalesce() fallback chain
-- that included `nullif(trim(account.name), '')`, where `account` is an alias for
-- public.admin. public.admin has never had a `name` column in this migration
-- history - it stores first/last name as separate `first_name`/`last_name`
-- columns (see the legacy migration_split_name.sql note at the repo root, and
-- every other read of public.admin in this codebase, e.g. src/components/
-- Accounts.jsx and src/utils/personnelOperationsService.js, which all compose
-- the display name from first_name + last_name). The stray `account.name`
-- reference was therefore always invalid and broke every attendance submission.
--
-- The fix simply drops that dead fallback line; the preceding
-- concat_ws(' ', account.first_name, account.last_name) fallback already
-- covers the same case correctly. No other logic in this function (active
-- personnel validation, duplicate Time In/Time Out checks, row locking) is
-- changed.

begin;

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

  if not (select private.is_active_personnel_account()) then
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

revoke all on function public.record_attendance_action(text, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.record_attendance_action(text, text, text, jsonb, jsonb, text) to authenticated;

commit;
