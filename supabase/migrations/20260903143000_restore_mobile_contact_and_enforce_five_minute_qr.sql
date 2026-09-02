begin;

-- Clamp any still-open legacy sessions before switching all new QR codes to
-- one hard five-minute lifetime from their creation time.
update public.qr_sessions
set expires_at = least(expires_at, created_at + interval '5 minutes'),
    claim_expires_at = case
      when claim_expires_at is null then null
      else least(claim_expires_at, expires_at, created_at + interval '5 minutes')
    end
where coalesce(used, false) = false;

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

  update public.qr_sessions
  set used = true
  where station_id = normalized_station
    and coalesce(used, false) = false
    and claimed_by is null
    and expires_at > now();

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
    now() + interval '5 minutes',
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
  expired_reason constant text :=
    'This QR code is invalid because it has expired. Please wait for a new QR code.';
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

  if coalesce(qr_row.used, false) then
    return jsonb_build_object('valid', false, 'reason', 'QR already used');
  end if;

  if qr_row.claimed_by = actor_uid then
    if least(qr_row.claim_expires_at, qr_row.expires_at, qr_row.created_at + interval '5 minutes') <= now() then
      return jsonb_build_object('valid', false, 'reason', expired_reason);
    end if;

    return jsonb_build_object(
      'valid', true,
      'session', jsonb_build_object(
        'session_id', qr_row.session_id,
        'station_id', qr_row.station_id,
        'created_at', qr_row.created_at,
        'expires_at', least(qr_row.claim_expires_at, qr_row.expires_at, qr_row.created_at + interval '5 minutes'),
        'claimed_at', qr_row.claimed_at,
        'used', false
      )
    );
  end if;

  if qr_row.claimed_by is not null then
    return jsonb_build_object('valid', false, 'reason', other_account_reason);
  end if;

  if least(qr_row.expires_at, qr_row.created_at + interval '5 minutes') <= now() then
    return jsonb_build_object('valid', false, 'reason', expired_reason);
  end if;

  update public.qr_sessions
  set claimed_by = actor_uid,
      claimed_at = now(),
      claim_expires_at = least(expires_at, created_at + interval '5 minutes')
  where session_id = qr_row.session_id
    and claimed_by is null
    and coalesce(used, false) = false
  returning * into qr_row;

  if not found then
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
  expired_reason constant text :=
    'This QR code is invalid because it has expired. Please wait for a new QR code.';
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

  effective_expiry := least(
    coalesce(qr_session.claim_expires_at, qr_session.expires_at),
    qr_session.expires_at,
    qr_session.created_at + interval '5 minutes'
  );

  if effective_expiry <= now() then
    return jsonb_build_object('valid', false, 'reason', expired_reason);
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

revoke all on function public.claim_attendance_qr_session(text) from public, anon;
grant execute on function public.claim_attendance_qr_session(text) to authenticated;

revoke all on function public.validate_attendance_qr_session(text) from public;
grant execute on function public.validate_attendance_qr_session(text) to anon, authenticated;

commit;
