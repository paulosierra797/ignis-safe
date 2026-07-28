-- Restrict legacy role access and secure account, report, and QR operations.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_backoffice_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(trim(account.role))
  from public.admin as account
  where account.admin_id = (select auth.uid())
    and lower(coalesce(account.status, '')) = 'active'
  limit 1;
$$;

revoke all on function private.current_backoffice_role() from public, anon;
grant execute on function private.current_backoffice_role() to authenticated;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'admin',
        'app_sessions',
        'organizational_chart',
        'personnel_workspace_profiles',
        'profiles',
        'qr_sessions',
        'reports'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

alter table public.admin enable row level security;
revoke all on table public.admin from anon;
grant select, insert, update, delete on table public.admin to authenticated;

create policy admin_select_own_or_admin
  on public.admin
  for select
  to authenticated
  using (
    admin_id = (select auth.uid())
    or (select private.current_backoffice_role()) = 'admin'
  );

create policy admin_insert_admin_only
  on public.admin
  for insert
  to authenticated
  with check ((select private.current_backoffice_role()) = 'admin');

create policy admin_update_admin_only
  on public.admin
  for update
  to authenticated
  using ((select private.current_backoffice_role()) = 'admin')
  with check ((select private.current_backoffice_role()) = 'admin');

create policy admin_delete_non_admin_accounts
  on public.admin
  for delete
  to authenticated
  using (
    (select private.current_backoffice_role()) = 'admin'
    and admin_id <> (select auth.uid())
    and lower(trim(role)) <> 'admin'
  );

alter table public.personnel_workspace_profiles enable row level security;
revoke all on table public.personnel_workspace_profiles from anon;
grant select, insert, update on table public.personnel_workspace_profiles to authenticated;

create policy personnel_workspace_select_own_or_admin
  on public.personnel_workspace_profiles
  for select
  to authenticated
  using (
    admin_id = (select auth.uid())
    or (select private.current_backoffice_role()) = 'admin'
  );

create policy personnel_workspace_insert_own_or_admin
  on public.personnel_workspace_profiles
  for insert
  to authenticated
  with check (
    admin_id = (select auth.uid())
    or (select private.current_backoffice_role()) = 'admin'
  );

create policy personnel_workspace_update_own_or_admin
  on public.personnel_workspace_profiles
  for update
  to authenticated
  using (
    admin_id = (select auth.uid())
    or (select private.current_backoffice_role()) = 'admin'
  )
  with check (
    admin_id = (select auth.uid())
    or (select private.current_backoffice_role()) = 'admin'
  );

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon;
grant select, insert, update on table public.profiles to authenticated;

create policy profiles_select_own_or_admin
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select private.current_backoffice_role()) = 'admin'
  );

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter table public.reports enable row level security;
revoke all on table public.reports from anon;
grant select, insert, update, delete on table public.reports to authenticated;

create policy reports_select_own_or_admin
  on public.reports
  for select
  to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.current_backoffice_role()) = 'admin'
  );

create policy reports_insert_own
  on public.reports
  for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy reports_update_own_editable
  on public.reports
  for update
  to authenticated
  using (
    created_by = (select auth.uid())
    and status = any (array['draft'::text, 'submitted'::text, 'rejected'::text])
  )
  with check (
    created_by = (select auth.uid())
    and status = any (array['draft'::text, 'submitted'::text, 'rejected'::text])
  );

create policy reports_update_admin
  on public.reports
  for update
  to authenticated
  using ((select private.current_backoffice_role()) = 'admin')
  with check ((select private.current_backoffice_role()) = 'admin');

create policy reports_delete_admin
  on public.reports
  for delete
  to authenticated
  using ((select private.current_backoffice_role()) = 'admin');

alter table public.organizational_chart enable row level security;
revoke all on table public.organizational_chart from anon;
grant select, insert, update on table public.organizational_chart to authenticated;

create policy organizational_chart_read_authenticated
  on public.organizational_chart
  for select
  to authenticated
  using (true);

create policy organizational_chart_write_admin
  on public.organizational_chart
  for insert
  to authenticated
  with check ((select private.current_backoffice_role()) = 'admin');

create policy organizational_chart_update_admin
  on public.organizational_chart
  for update
  to authenticated
  using ((select private.current_backoffice_role()) = 'admin')
  with check ((select private.current_backoffice_role()) = 'admin');

alter table public.app_sessions enable row level security;
revoke all on table public.app_sessions from anon;
grant select, insert, update on table public.app_sessions to authenticated;

create policy app_sessions_select_own_or_admin
  on public.app_sessions
  for select
  to authenticated
  using (
    admin_id = (select auth.uid())
    or (select private.current_backoffice_role()) = 'admin'
  );

create policy app_sessions_insert_own
  on public.app_sessions
  for insert
  to authenticated
  with check (admin_id = (select auth.uid()));

create policy app_sessions_update_own
  on public.app_sessions
  for update
  to authenticated
  using (admin_id = (select auth.uid()))
  with check (admin_id = (select auth.uid()));

alter table public.qr_sessions enable row level security;
revoke all on table public.qr_sessions from anon, authenticated;

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
  qr_session public.qr_sessions%rowtype;
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

  if qr_session.expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'QR expired');
  end if;

  return jsonb_build_object(
    'valid', true,
    'session', jsonb_build_object(
      'session_id', qr_session.session_id,
      'station_id', qr_session.station_id,
      'created_at', qr_session.created_at,
      'expires_at', qr_session.expires_at,
      'used', false
    )
  );
end;
$$;

create or replace function public.consume_attendance_qr_session(
  p_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  consumed_count integer;
begin
  actor_role := (select private.current_backoffice_role());
  if actor_role not in ('admin', 'personnel') then
    raise exception 'Only active administrator or personnel accounts may consume attendance QR sessions.'
      using errcode = '42501';
  end if;

  update public.qr_sessions
  set used = true
  where session_id = trim(coalesce(p_session_id, ''))
    and coalesce(used, false) = false
    and expires_at > now();

  get diagnostics consumed_count = row_count;
  return consumed_count = 1;
end;
$$;

revoke all on function public.create_attendance_qr_session(text) from public, anon;
revoke all on function public.get_active_attendance_qr_session(text) from public, anon;
revoke all on function public.validate_attendance_qr_session(text) from public;
revoke all on function public.consume_attendance_qr_session(text) from public, anon;
grant execute on function public.create_attendance_qr_session(text) to authenticated;
grant execute on function public.get_active_attendance_qr_session(text) to authenticated;
grant execute on function public.validate_attendance_qr_session(text) to anon, authenticated;
grant execute on function public.consume_attendance_qr_session(text) to authenticated;

create or replace function public.activate_own_backoffice_account()
returns public.admin
language plpgsql
security definer
set search_path = ''
as $$
declare
  activated_account public.admin%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  update public.admin
  set status = 'Active',
      updated_at = now(),
      last_login = now()
  where admin_id = (select auth.uid())
    and status in ('Pending Activation', 'Pending Verification', 'Active')
  returning * into activated_account;

  if not found then
    raise exception 'No pending account is available for this invitation.'
      using errcode = 'P0002';
  end if;

  return activated_account;
end;
$$;

create or replace function public.touch_backoffice_activity()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity_at timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  update public.admin
  set last_login = activity_at,
      status = case
        when status in ('Pending Activation', 'Pending Verification') then status
        else 'Active'
      end,
      updated_at = activity_at
  where admin_id = (select auth.uid());

  if not found then
    raise exception 'Back-office account was not found.' using errcode = 'P0002';
  end if;

  return activity_at;
end;
$$;

revoke all on function public.activate_own_backoffice_account() from public, anon;
revoke all on function public.touch_backoffice_activity() from public, anon;
grant execute on function public.activate_own_backoffice_account() to authenticated;
grant execute on function public.touch_backoffice_activity() to authenticated;

create or replace function public.accept_terms(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or p_user_id <> (select auth.uid()) then
    raise exception 'Users may only accept terms for their own account.'
      using errcode = '42501';
  end if;

  update public.profiles
  set terms_accepted = true,
      terms_accepted_at = now(),
      updated_at = now()
  where id = p_user_id;
end;
$$;

revoke all on function public.accept_terms(uuid) from public, anon;
grant execute on function public.accept_terms(uuid) to authenticated;

revoke all on function public.cleanup_pending_registration(text) from public, anon, authenticated;
grant execute on function public.cleanup_pending_registration(text) to service_role;

commit;
