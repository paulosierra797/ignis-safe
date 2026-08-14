-- Fix "Only active personnel accounts may record attendance" false rejection.
--
-- private.current_backoffice_role() only ever returns a single role string
-- ('admin' or 'personnel') from public.admin, so record_attendance_action()
-- was requiring actor_role = 'personnel' exactly. That silently excludes the
-- supported case where an account has admin.role = 'admin' but also owns a
-- public.personnel_workspace_profiles row (an admin who is also registered
-- as active Personnel and uses the Personnel workspace to mark their own
-- attendance) - the same combination the attendance-login gate in
-- src/utils/attendanceService.js already accepts. This introduces a single
-- source of truth for "is this an active personnel account", backed by the
-- real public.admin + public.personnel_workspace_profiles records, and wires
-- both the login gate (via the public RPC) and the submission RPC to it.

begin;

create or replace function private.is_active_personnel_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin as account
    where account.admin_id = (select auth.uid())
      and lower(coalesce(account.status, '')) = 'active'
      and (
        lower(trim(account.role)) = 'personnel'
        or (
          lower(trim(account.role)) = 'admin'
          and exists (
            select 1
            from public.personnel_workspace_profiles as workspace
            where workspace.admin_id = account.admin_id
          )
        )
      )
  );
$$;

revoke all on function private.is_active_personnel_account() from public, anon;
grant execute on function private.is_active_personnel_account() to authenticated;

-- Public wrapper so the client (the /attendance-login gate) can call the
-- exact same check the record_attendance_action() RPC enforces, instead of
-- re-deriving eligibility from admin/personnel_workspace_profiles rows in
-- JavaScript.
create or replace function public.is_active_personnel_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_personnel_account();
$$;

revoke all on function public.is_active_personnel_account() from public, anon;
grant execute on function public.is_active_personnel_account() to authenticated;

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

revoke all on function public.record_attendance_action(text, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.record_attendance_action(text, text, text, jsonb, jsonb, text) to authenticated;

commit;
