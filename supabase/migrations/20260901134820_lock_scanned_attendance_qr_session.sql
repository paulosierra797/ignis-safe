-- Lock a scanned attendance QR into a personnel-bound session that survives QR
-- rotation.
--
-- Problem
-- -------
-- The station QR rotates on a short timer. create_attendance_qr_session() used
-- to mark EVERY older unused session for the station `used = true` on every
-- rotation. A personnel could scan a perfectly valid QR, but by the time they
-- finished liveness + face match + location + House Rules the QR had rotated and
-- the session they scanned was already `used`/expired - so record_attendance_action()
-- rejected the write ("QR already used" / "QR expired") even though the QR was
-- valid at scan time.
--
-- Fix
-- ---
-- Two distinct lifetimes are now tracked on public.qr_sessions:
--
--   * expires_at        - the raw QR-rotation window (~60s). Governs an
--                         UNSCANNED QR only.
--   * claim_expires_at   - the locked attendance session (~5 min), created the
--                         moment a personnel successfully scans (claims) the QR.
--                         Governs a SCANNED QR. Counted from the first scan and
--                         never extended.
--
-- Rotation (create_attendance_qr_session) now retires only QR codes that were
-- never scanned (claimed_by is null). A scanned QR keeps its lock for the full
-- ~5 minutes regardless of how many times the QR rotates behind it.
--
-- The locked session stays:
--   * bound to the personnel who scanned it   (claimed_by = auth.uid())
--   * bound to one attendance submission       (used flag flips on success)
--   * one-time use                             (record_attendance_action consumes it)
--   * unusable after submission                (used = true)
--   * unusable after it expires                (claim_expires_at <= now())
--
-- No face, liveness, location, shift, duplicate-attendance or House Rules check
-- is touched - record_attendance_action() still enforces every one of them, and
-- still validates the QR strictly at write time (it just checks the claim lock
-- instead of the rotation window).

begin;

-- ---------------------------------------------------------------------------
-- 1. Schema: claim + consumption bookkeeping on qr_sessions
-- ---------------------------------------------------------------------------

alter table public.qr_sessions
  add column if not exists claimed_by uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_expires_at timestamptz,
  add column if not exists consumed_at timestamptz,
  add column if not exists consumed_action text;

alter table public.qr_sessions
  drop constraint if exists qr_sessions_consumed_action_check;
alter table public.qr_sessions
  add constraint qr_sessions_consumed_action_check
  check (consumed_action is null or consumed_action in ('in', 'out'));

-- claimed_by and claim_expires_at are always written together.
alter table public.qr_sessions
  drop constraint if exists qr_sessions_claim_pairing_check;
alter table public.qr_sessions
  add constraint qr_sessions_claim_pairing_check
  check ((claimed_by is null) = (claim_expires_at is null));

-- The "active QR to display / to claim" lookup: unused, unscanned, unexpired.
create index if not exists qr_sessions_station_open_idx
  on public.qr_sessions (station_id, expires_at)
  where coalesce(used, false) = false and claimed_by is null;

-- Fast "does this personnel already hold a lock" lookups.
create index if not exists qr_sessions_claimed_by_idx
  on public.qr_sessions (claimed_by)
  where claimed_by is not null;

-- ---------------------------------------------------------------------------
-- 2. create_attendance_qr_session - rotate only NEVER-SCANNED QR codes
-- ---------------------------------------------------------------------------

create or replace function public.create_attendance_qr_session(
  p_station_id text default 'DEFAULT'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  normalized_station text;
  new_session public.qr_sessions%rowtype;
begin
  actor_role := (select private.current_backoffice_role());
  if actor_role not in ('admin', 'personnel') then
    raise exception 'Only active administrator or personnel accounts may create attendance QR sessions.'
      using errcode = '42501';
  end if;

  normalized_station := trim(coalesce(p_station_id, 'DEFAULT'));
  if normalized_station = '' or length(normalized_station) > 100 then
    raise exception 'Invalid station identifier.' using errcode = '22023';
  end if;

  -- QR rotation. Retire only QR codes that were displayed but NEVER successfully
  -- scanned. A QR a personnel already scanned holds a locked ~5 minute
  -- attendance session (claim_expires_at) that MUST survive rotation so face +
  -- location + House Rules + submission can still finish.
  update public.qr_sessions
  set used = true
  where station_id = normalized_station
    and coalesce(used, false) = false
    and claimed_by is null
    and expires_at > now();

  -- The QR itself keeps rotating on a short (~60s) window for security.
  insert into public.qr_sessions (
    session_id,
    station_id,
    created_at,
    expires_at,
    used
  )
  values (
    gen_random_uuid()::text,
    normalized_station,
    now(),
    now() + interval '60 seconds',
    false
  )
  returning * into new_session;

  return jsonb_build_object(
    'session_id', new_session.session_id,
    'station_id', new_session.station_id,
    'created_at', new_session.created_at,
    'expires_at', new_session.expires_at,
    'used', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. get_active_attendance_qr_session - never hand back a scanned QR
-- ---------------------------------------------------------------------------

create or replace function public.get_active_attendance_qr_session(
  p_station_id text default 'DEFAULT'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role text;
  active_session public.qr_sessions%rowtype;
begin
  actor_role := (select private.current_backoffice_role());
  if actor_role not in ('admin', 'personnel') then
    raise exception 'Only active administrator or personnel accounts may view attendance QR sessions.'
      using errcode = '42501';
  end if;

  select *
  into active_session
  from public.qr_sessions
  where station_id = trim(coalesce(p_station_id, 'DEFAULT'))
    and coalesce(used, false) = false
    and claimed_by is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'session_id', active_session.session_id,
    'station_id', active_session.station_id,
    'created_at', active_session.created_at,
    'expires_at', active_session.expires_at,
    'used', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. claim_attendance_qr_session - the "successful scan" lock
-- ---------------------------------------------------------------------------
-- Called the instant a personnel opens the scanned QR link. Atomically binds
-- the QR to that personnel and opens a ~5 minute attendance session. Idempotent
-- for the same personnel (page reloads / re-entry keep the ORIGINAL 5 minute
-- deadline - it is never pushed out). Rejects a QR already locked by someone
-- else, already consumed, or past its window.

create or replace function public.claim_attendance_qr_session(
  p_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_uid uuid := (select auth.uid());
  qr_row public.qr_sessions%rowtype;
  claim_ttl constant interval := interval '5 minutes';
  other_account_reason constant text :=
    'This QR code was already scanned by another account. Please scan the current station QR code.';
begin
  if actor_uid is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not (select private.is_active_personnel_account()) then
    raise exception 'Only active personnel accounts may scan attendance QR codes.' using errcode = '42501';
  end if;

  if p_session_id is null or length(trim(p_session_id)) < 20 then
    return jsonb_build_object('valid', false, 'reason', 'Invalid QR session');
  end if;

  select *
  into qr_row
  from public.qr_sessions
  where session_id = trim(p_session_id)
  limit 1
  for update;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'Invalid QR session');
  end if;

  -- Already consumed by a completed attendance submission - never reusable.
  if coalesce(qr_row.used, false) then
    return jsonb_build_object('valid', false, 'reason', 'QR already used');
  end if;

  -- Already locked to this same personnel: idempotent re-scan / reload. The
  -- 5 minute window keeps counting from the FIRST scan and is not extended.
  if qr_row.claimed_by is not null and qr_row.claimed_by = actor_uid then
    if qr_row.claim_expires_at <= now() then
      return jsonb_build_object('valid', false, 'reason', 'QR expired');
    end if;
    return jsonb_build_object(
      'valid', true,
      'session', jsonb_build_object(
        'session_id', qr_row.session_id,
        'station_id', qr_row.station_id,
        'created_at', qr_row.created_at,
        'expires_at', qr_row.claim_expires_at,
        'claimed_at', qr_row.claimed_at,
        'used', false
      )
    );
  end if;

  -- Locked to a different personnel.
  if qr_row.claimed_by is not null and qr_row.claimed_by <> actor_uid then
    return jsonb_build_object('valid', false, 'reason', other_account_reason);
  end if;

  -- Unclaimed: it can only be claimed while still inside the short QR-rotation
  -- window. Once the QR has rotated, an unscanned code is dead.
  if qr_row.expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'QR expired');
  end if;

  update public.qr_sessions
  set claimed_by = actor_uid,
      claimed_at = now(),
      claim_expires_at = now() + claim_ttl
  where session_id = qr_row.session_id
    and claimed_by is null
    and coalesce(used, false) = false
  returning * into qr_row;

  if not found then
    -- Lost the race: another personnel claimed it a moment ago.
    return jsonb_build_object('valid', false, 'reason', other_account_reason);
  end if;

  return jsonb_build_object(
    'valid', true,
    'session', jsonb_build_object(
      'session_id', qr_row.session_id,
      'station_id', qr_row.station_id,
      'created_at', qr_row.created_at,
      'expires_at', qr_row.claim_expires_at,
      'claimed_at', qr_row.claimed_at,
      'used', false
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. validate_attendance_qr_session - claim-aware read-only probe
-- ---------------------------------------------------------------------------
-- Still a pure read (no locking, no state change), still anon-callable so the
-- pre-login bounce page can show a clean error for a dead QR. Now understands
-- the claim lock: for a scanned QR the deadline is claim_expires_at, and a QR
-- locked to another account reports itself as such.

create or replace function public.validate_attendance_qr_session(
  p_session_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_uid uuid := (select auth.uid());
  qr_session public.qr_sessions%rowtype;
  effective_expiry timestamptz;
begin
  if p_session_id is null or length(trim(p_session_id)) < 20 then
    return jsonb_build_object('valid', false, 'reason', 'Invalid QR session');
  end if;

  select *
  into qr_session
  from public.qr_sessions
  where session_id = trim(p_session_id)
  limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'Invalid QR session');
  end if;

  if coalesce(qr_session.used, false) then
    return jsonb_build_object('valid', false, 'reason', 'QR already used');
  end if;

  if qr_session.claimed_by is not null
     and (actor_uid is null or qr_session.claimed_by <> actor_uid) then
    return jsonb_build_object(
      'valid', false,
      'reason', 'This QR code was already scanned by another account. Please scan the current station QR code.'
    );
  end if;

  if qr_session.claimed_by is not null then
    effective_expiry := qr_session.claim_expires_at;
  else
    effective_expiry := qr_session.expires_at;
  end if;

  if effective_expiry <= now() then
    return jsonb_build_object('valid', false, 'reason', 'QR expired');
  end if;

  return jsonb_build_object(
    'valid', true,
    'session', jsonb_build_object(
      'session_id', qr_session.session_id,
      'station_id', qr_session.station_id,
      'created_at', qr_session.created_at,
      'expires_at', effective_expiry,
      'claimed_at', qr_session.claimed_at,
      'used', false
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. get_own_attendance_status - claim-aware QR reporting
-- ---------------------------------------------------------------------------
-- Unchanged except the QR probe block, which now judges validity by the claim
-- lock (claim_expires_at) for a scanned QR and by the rotation window
-- (expires_at) for an unscanned one, and flags a QR locked to another account.
-- QR state is still REPORTED here, never raised.

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

  -- QR state is reported, never raised. A rotated, consumed or expired QR says
  -- nothing about whether attendance was recorded. record_attendance_action()
  -- still rejects an invalid QR when the write is actually attempted.
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
      elsif qr_row.claimed_by is not null and qr_row.claimed_by <> actor_uid then
        qr_valid := false;
        qr_error := 'This QR code was scanned by another account';
      elsif qr_row.claimed_by is not null and qr_row.claim_expires_at <= now() then
        qr_valid := false;
        qr_error := 'QR expired';
      elsif qr_row.claimed_by is null and qr_row.expires_at <= now() then
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

-- ---------------------------------------------------------------------------
-- 7. record_attendance_action - consume the claimed session
-- ---------------------------------------------------------------------------
-- Unchanged except:
--   * the QR gate now requires a live claim held BY THIS personnel
--     (claimed_by = auth.uid(), claim_expires_at > now()) instead of the raw
--     60s rotation window, and locks the qr row FOR UPDATE; and
--   * on a successful write the qr row is consumed (used = true, plus
--     consumed_at / consumed_action) in the same transaction, so it can never
--     be replayed for a second submission or the other action.
-- Every face / liveness / location / duplicate / House Rules rule is verbatim.

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
  qr_not_scanned_message constant text :=
    'QR session was not scanned. Please rescan the station QR code.';
  qr_other_account_message constant text :=
    'This QR code was scanned by another account.';
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
  qr_consumed_count integer;
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

  -- The QR is still validated strictly for a write. It must be an unconsumed
  -- session this personnel actually scanned (claimed), still inside its ~5
  -- minute locked window. The raw 60s rotation window is irrelevant once a
  -- claim exists - that is the whole point of the lock.
  if p_qr_session_id is null or trim(p_qr_session_id) = '' then
    raise exception 'Invalid QR session' using errcode = '22023';
  end if;

  select *
  into qr_row
  from public.qr_sessions
  where session_id = trim(p_qr_session_id)
  limit 1
  for update;

  if not found then
    raise exception 'Invalid QR session' using errcode = '22023';
  end if;

  if coalesce(qr_row.used, false) then
    raise exception 'QR already used' using errcode = '22023';
  end if;

  if qr_row.claimed_by is null then
    raise exception '%', qr_not_scanned_message using errcode = '22023';
  end if;

  if qr_row.claimed_by <> actor_uid then
    raise exception '%', qr_other_account_message using errcode = '42501';
  end if;

  if qr_row.claim_expires_at <= now() then
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

    -- One-time use: consume the scanned session now that the Time In is written.
    -- The FOR UPDATE lock above means a second concurrent submission on the same
    -- session is serialized behind this and then sees used = true.
    update public.qr_sessions
    set used = true,
        consumed_at = action_time,
        consumed_action = normalized_mode
    where session_id = qr_row.session_id
      and coalesce(used, false) = false
      and claimed_by = actor_uid;

    get diagnostics qr_consumed_count = row_count;
    if qr_consumed_count <> 1 then
      raise exception 'QR already used' using errcode = '23505';
    end if;

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

  -- One-time use: consume the scanned session now that the Time Out is written.
  update public.qr_sessions
  set used = true,
      consumed_at = action_time,
      consumed_action = normalized_mode
  where session_id = qr_row.session_id
    and coalesce(used, false) = false
    and claimed_by = actor_uid;

  get diagnostics qr_consumed_count = row_count;
  if qr_consumed_count <> 1 then
    raise exception 'QR already used' using errcode = '23505';
  end if;

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

-- ---------------------------------------------------------------------------
-- 8. Grants for the new claim RPC
-- ---------------------------------------------------------------------------

revoke all on function public.claim_attendance_qr_session(text) from public, anon;
grant execute on function public.claim_attendance_qr_session(text) to authenticated;

commit;
