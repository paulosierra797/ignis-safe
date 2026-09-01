-- Fix the false "Your attendance for this action has already been recorded."
--
-- Two independent defects made the duplicate guard fire when no Time In had
-- ever been recorded:
--
-- 1. get_own_attendance_status() RAISED on QR problems ('Invalid QR session',
--    'QR already used', 'QR expired'). The Confirm screen calls it on mount and
--    keeps `attendanceStatus = null` when it throws, and its Time In gate was a
--    single `!attendanceStatus?.canTimeIn` boolean wired to the duplicate
--    message. Because create_attendance_qr_session() marks every older unused
--    session for the station `used = true` each time the QR display rotates
--    (every ~60s, 5 minute TTL), the session the personnel actually scanned is
--    routinely already `used`/expired by the time they reach the Confirm page -
--    so a perfectly fresh personnel with zero attendance rows got told their
--    attendance was already recorded. QR state is now REPORTED in the payload
--    instead of raising; record_attendance_action() still enforces the QR
--    strictly at write time, so no protection is lost.
--
-- 2. Both functions treated "a row exists" as "already timed in". A row whose
--    time_in is null (a partial or rolled-back attempt) permanently blocked
--    Time In - get_own_attendance_status() fell through to state 'completed'
--    with can_time_in = false AND can_time_out = false, and
--    record_attendance_action() raised the duplicate error on `if found`
--    without ever looking at time_in. Duplicate detection is now based on the
--    actual timestamps: Time In is blocked only when a real time_in already
--    exists, Time Out only when a real time_out already exists.
--
-- A House Rules acknowledgement still cannot stand in for attendance: the
-- acknowledgement lives in its own table, is never consulted by the duplicate
-- check, and is only ever written in the same transaction as a real timestamp.
--
-- Scoping is unchanged and remains (personnel_user_id, shift_id,
-- attendance_date) with attendance_date = private.manila_attendance_date(), so
-- rows from previous dates or other shifts can never be reused; the lookups
-- just gain a deterministic order/limit.

begin;

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
  qr_found boolean := false;
  qr_valid boolean := true;
  qr_error text := null;
  attendance_row public.attendance_records%rowtype;
  attendance_found boolean := false;
  has_time_in boolean := false;
  has_time_out boolean := false;
  time_in_label text;
begin
  if actor_uid is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  actor_role := (select private.current_backoffice_role());
  if actor_role not in ('admin', 'personnel') then
    raise exception 'Only active accounts may view attendance status.' using errcode = '42501';
  end if;

  -- QR state is reported, never raised. This is a read-only status probe: a
  -- rotated, consumed or expired QR says nothing about whether attendance was
  -- recorded, and raising here is what made the caller fall back to its
  -- "already recorded" branch. record_attendance_action() still rejects an
  -- invalid QR when the write is actually attempted.
  if p_qr_session_id is not null and trim(p_qr_session_id) <> '' then
    select *
    into qr_row
    from public.qr_sessions
    where session_id = trim(p_qr_session_id)
    limit 1;

    qr_found := found;

    if not qr_found then
      qr_valid := false;
      qr_error := 'Invalid QR session';
    else
      -- Resolve the shift from the QR row even when the session is no longer
      -- usable, so the status is still read against the correct shift.
      normalized_shift := coalesce(nullif(trim(qr_row.station_id), ''), normalized_shift);

      if coalesce(qr_row.used, false) then
        qr_valid := false;
        qr_error := 'QR already used';
      elsif qr_row.expires_at <= now() then
        qr_valid := false;
        qr_error := 'QR expired';
      end if;
    end if;
  end if;

  -- Scoped to this personnel, this shift and today's Manila attendance date, so
  -- a stale row from a previous date or a different shift is never picked up.
  select *
  into attendance_row
  from public.attendance_records
  where personnel_user_id = actor_uid
    and shift_id = normalized_shift
    and attendance_date = attendance_day
  order by created_at desc
  limit 1;

  attendance_found := found;
  has_time_in := attendance_found and attendance_row.time_in is not null;
  has_time_out := attendance_found and attendance_row.time_out is not null;

  -- No row at all, or a row that never got a real time_in (a partial or
  -- rolled-back attempt): Time In has NOT happened, so it must stay available.
  if not has_time_in then
    return jsonb_build_object(
      'state', case when attendance_found then 'pending' else 'none' end,
      'attendance_date', attendance_day,
      'shift_id', normalized_shift,
      'can_time_in', true,
      'can_time_out', false,
      'has_time_in', false,
      'has_time_out', false,
      'qr_valid', qr_valid,
      'qr_error', qr_error,
      'message', 'No Time In recorded for this shift yet. You may record Time In.',
      'record', case when attendance_found then to_jsonb(attendance_row) else null end
    );
  end if;

  if not has_time_out then
    time_in_label := to_char(attendance_row.time_in at time zone 'Asia/Manila', 'HH12:MI AM');

    return jsonb_build_object(
      'state', 'time_in_only',
      'attendance_date', attendance_day,
      'shift_id', normalized_shift,
      'can_time_in', false,
      'can_time_out', true,
      'has_time_in', true,
      'has_time_out', false,
      'qr_valid', qr_valid,
      'qr_error', qr_error,
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
    'has_time_in', true,
    'has_time_out', true,
    'qr_valid', qr_valid,
    'qr_error', qr_error,
    'message', 'Attendance completed for today.',
    'record', to_jsonb(attendance_row)
  );
end;
$$;

revoke all on function public.get_own_attendance_status(text, text) from public, anon;
grant execute on function public.get_own_attendance_status(text, text) to authenticated;

create or replace function public.record_attendance_action(
  p_mode text,
  p_shift_id text,
  p_qr_session_id text,
  p_location jsonb default '{}'::jsonb,
  p_verification jsonb default '{}'::jsonb,
  p_photo_path text default null,
  p_house_rules_ack jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  duplicate_time_in_message constant text :=
    'Your Time In for this shift has already been recorded.';
  duplicate_time_out_message constant text :=
    'Your Time Out for this shift has already been recorded.';
  house_rules_in_message constant text :=
    'You must acknowledge the Station House Rules and Personnel Guidelines before recording Time In.';
  house_rules_out_message constant text :=
    'You must acknowledge the Station House Rules and Personnel Guidelines before recording Time Out.';
  actor_uid uuid := (select auth.uid());
  actor_name text;
  actor_rank text;
  legacy_personnel_id integer;
  attendance_day date := private.manila_attendance_date();
  action_time timestamptz := now();
  normalized_mode text := lower(trim(coalesce(p_mode, '')));
  normalized_shift text := coalesce(nullif(trim(p_shift_id), ''), 'DEFAULT');
  house_rules_acknowledged boolean :=
    coalesce((p_house_rules_ack->>'acknowledged')::boolean, false);
  house_rules_ack_time timestamptz :=
    coalesce(nullif(p_house_rules_ack->>'acknowledged_at', '')::timestamptz, action_time);
  qr_row public.qr_sessions%rowtype;
  existing_row public.attendance_records%rowtype;
  existing_found boolean := false;
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

  -- The QR is still validated strictly for a write. Only the read-only status
  -- probe was relaxed.
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

  -- Scoped to this personnel + this shift + today's Manila attendance date, so
  -- rows from earlier dates or other shifts can never trigger a duplicate.
  -- `found` is captured immediately because later statements overwrite it.
  select *
  into existing_row
  from public.attendance_records
  where personnel_user_id = actor_uid
    and shift_id = normalized_shift
    and attendance_date = attendance_day
  order by created_at desc
  limit 1
  for update;

  existing_found := found;

  if normalized_mode = 'in' then
    -- Duplicate protection: a Time In is a duplicate ONLY when a real time_in
    -- timestamp already exists for this personnel/shift/date. A row without
    -- one (a partial write, or an attempt that never completed) is not
    -- attendance and must not block the personnel.
    if existing_found and existing_row.time_in is not null then
      raise exception '%', duplicate_time_in_message using errcode = '23505';
    end if;

    -- House Rules must be acknowledged before a Time In can be recorded.
    -- Raised before any write so no attendance row is ever created without it.
    if not house_rules_acknowledged then
      raise exception '%', house_rules_in_message using errcode = '42501';
    end if;

    if existing_found then
      -- Adopt the existing time_in-less row instead of inserting a second one.
      -- Inserting would collide with
      -- attendance_records_personnel_shift_date_unique and surface as an
      -- opaque Postgres error.
      update public.attendance_records
      set
        personnel_id = legacy_personnel_id,
        qr_session_id = trim(p_qr_session_id),
        name = actor_name,
        rank = actor_rank,
        time_in = action_time,
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
        verification_type = 'in',
        verification_recorded_at = coalesce(p_verification->>'verification_recorded_at', p_verification->>'recorded_at')::timestamptz,
        verification_metadata = coalesce(p_verification->'verification_metadata', '{}'::jsonb),
        updated_at = action_time
      where id = existing_row.id
        and time_in is null
      returning * into changed_row;

      -- Lost the race against a concurrent Time In on the same row: that other
      -- transaction wrote the real time_in, so this one is a true duplicate.
      if not found then
        raise exception '%', duplicate_time_in_message using errcode = '23505';
      end if;
    else
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
    end if;

    -- Persist the acknowledgement in the same transaction as the Time In, tied
    -- to this exact attendance record / shift.
    insert into public.station_house_rule_acknowledgements (
      attendance_record_id,
      personnel_user_id,
      personnel_name,
      shift_id,
      acknowledgement_type,
      acknowledgement_date,
      acknowledged_at,
      acknowledgement_status
    )
    values (
      changed_row.id,
      actor_uid,
      actor_name,
      normalized_shift,
      'in',
      attendance_day,
      house_rules_ack_time,
      'acknowledged'
    )
    on conflict on constraint station_house_rule_ack_record_action_unique
    do update set acknowledged_at = excluded.acknowledged_at;

    return jsonb_build_object(
      'action', 'created',
      'status', public.get_own_attendance_status(normalized_shift, p_qr_session_id),
      'record', to_jsonb(changed_row),
      'house_rules_acknowledged', true
    );
  end if;

  -- Time Out requires a real Time In first. A row without a time_in is not a
  -- recorded Time In, so it is rejected here rather than treated as one.
  if not existing_found or existing_row.time_in is null then
    raise exception 'Time Out cannot be recorded without an existing Time In.' using errcode = '23514';
  end if;

  -- Duplicate protection: a Time Out is a duplicate ONLY when a real time_out
  -- timestamp already exists.
  if existing_row.time_out is not null then
    raise exception '%', duplicate_time_out_message using errcode = '23505';
  end if;

  -- House Rules must be acknowledged before a Time Out can be recorded. Checked
  -- after the "must already have a Time In" and duplicate guards so those keep
  -- priority, and before the UPDATE so no time_out is ever written without it.
  if not house_rules_acknowledged then
    raise exception '%', house_rules_out_message using errcode = '42501';
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

  -- Lost the race against a concurrent Time Out: it is a genuine duplicate.
  if not found then
    raise exception '%', duplicate_time_out_message using errcode = '23505';
  end if;

  insert into public.station_house_rule_acknowledgements (
    attendance_record_id,
    personnel_user_id,
    personnel_name,
    shift_id,
    acknowledgement_type,
    acknowledgement_date,
    acknowledged_at,
    acknowledgement_status
  )
  values (
    changed_row.id,
    actor_uid,
    actor_name,
    normalized_shift,
    'out',
    attendance_day,
    house_rules_ack_time,
    'acknowledged'
  )
  on conflict on constraint station_house_rule_ack_record_action_unique
  do update set acknowledged_at = excluded.acknowledged_at;

  return jsonb_build_object(
    'action', 'updated',
    'status', public.get_own_attendance_status(normalized_shift, p_qr_session_id),
    'record', to_jsonb(changed_row),
    'house_rules_acknowledged', true
  );
end;
$$;

revoke all on function public.record_attendance_action(text, text, text, jsonb, jsonb, text, jsonb) from public, anon;
grant execute on function public.record_attendance_action(text, text, text, jsonb, jsonb, text, jsonb) to authenticated;

commit;
