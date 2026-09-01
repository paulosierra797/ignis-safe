-- Station House Rules & Personnel Guidelines acknowledgement.
--
-- Personnel must read and acknowledge the station house rules before their
-- Time In and before their Time Out are officially recorded. The
-- acknowledgement has to be tied to the exact attendance record it was made
-- for, be impossible to bypass, and never leave the attendance row and the
-- acknowledgement row in disagreement.
--
-- This is done inside record_attendance_action() itself so the attendance write
-- and the acknowledgement INSERT share one transaction: if the personnel did
-- not acknowledge, the Time In / Time Out is rolled back and never recorded.
-- All existing attendance and authentication logic (active-personnel check, QR
-- validation, duplicate Time In/Time Out guards, row locking) is copied
-- verbatim from
-- 20260815120000_fix_record_attendance_action_missing_name_column and left
-- unchanged - only the new p_house_rules_ack parameter and the acknowledgement
-- INSERTs are added.

begin;

create table if not exists public.station_house_rule_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null
    references public.attendance_records(id) on delete cascade,
  personnel_user_id uuid not null,
  personnel_name text not null,
  shift_id text not null,
  -- Which attendance action the acknowledgement was made for: 'in' is the
  -- start-of-duty acknowledgement, 'out' is the end-of-duty attestation that
  -- the rules were complied with during the shift.
  acknowledgement_type text not null check (acknowledgement_type in ('in', 'out')),
  acknowledgement_date date not null,
  acknowledged_at timestamptz not null default now(),
  acknowledgement_status text not null default 'acknowledged'
    check (acknowledgement_status in ('acknowledged')),
  created_at timestamptz not null default now(),
  -- One acknowledgement per attendance record per action - prevents duplicates
  -- and guarantees each acknowledgement corresponds to a single Time In or a
  -- single Time Out.
  constraint station_house_rule_ack_record_action_unique
    unique (attendance_record_id, acknowledgement_type)
);

create index if not exists idx_station_house_rule_ack_personnel
  on public.station_house_rule_acknowledgements (personnel_user_id, acknowledgement_date);

alter table public.station_house_rule_acknowledgements enable row level security;

-- Personnel may read their own acknowledgements; admins may read all (mirrors
-- the attendance_records select policy).
drop policy if exists "house_rule_ack_read_own_or_admin" on public.station_house_rule_acknowledgements;
create policy "house_rule_ack_read_own_or_admin"
on public.station_house_rule_acknowledgements
for select
to authenticated
using (
  personnel_user_id = (select auth.uid())
  or (select private.current_backoffice_role()) = 'admin'
);

-- Acknowledgement writes must go through public.record_attendance_action(),
-- exactly like attendance_records writes.
revoke all on table public.station_house_rule_acknowledgements from anon, authenticated;
grant select on table public.station_house_rule_acknowledgements to authenticated;

-- Replace the 6-argument function with a 7-argument version that also takes the
-- House Rules acknowledgement payload. The only caller is
-- src/utils/attendanceService.js, which is updated in the same change.
drop function if exists public.record_attendance_action(text, text, text, jsonb, jsonb, text);

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
  duplicate_message constant text := 'Your attendance for this action has already been recorded.';
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

    -- House Rules must be acknowledged before a Time In can be recorded.
    -- Raised before the INSERT so no attendance row is ever created without it.
    if not house_rules_acknowledged then
      raise exception '%', house_rules_in_message using errcode = '42501';
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
    );

    return jsonb_build_object(
      'action', 'created',
      'status', public.get_own_attendance_status(normalized_shift, p_qr_session_id),
      'record', to_jsonb(changed_row),
      'house_rules_acknowledged', true
    );
  end if;

  if not found or existing_row.time_in is null then
    raise exception 'Time Out cannot be recorded without an existing Time In.' using errcode = '23514';
  end if;

  if existing_row.time_out is not null then
    raise exception '%', duplicate_message using errcode = '23505';
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

  if not found then
    raise exception '%', duplicate_message using errcode = '23505';
  end if;

  -- Persist the end-of-duty acknowledgement in the same transaction as the Time
  -- Out. The unique (attendance_record_id, acknowledgement_type) key makes a
  -- duplicate Time Out acknowledgement impossible.
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
  );

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
