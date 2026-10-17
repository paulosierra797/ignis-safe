-- Super Admin account management: role changes, Admin/Super Admin Trash, and
-- the manage_account RPC used by single-account and Bulk Manage actions.
--
-- Rules enforced here (the UI only mirrors them):
--   * Only an active Super Admin can change an account's role, create an Admin
--     account, or move an Admin / Super Admin account to Trash.
--   * Allowed role changes: Personnel -> Admin, Admin -> Super Admin,
--     Super Admin -> Admin. Personnel -> Super Admin is never allowed.
--   * The official account (private.protected_accounts) cannot be trashed,
--     deleted, deactivated, or demoted. Rejected attempts are audit-logged.
--   * Nobody can demote, deactivate, or trash their own account.
--   * Deletion stays recoverable: accounts go through the existing Archive &
--     Trash lifecycle (archive_record), which keeps Audit Logs.
begin;

-- ---------------------------------------------------------------------------
-- public.admin guard: role changes / Admin creation need a Super Admin
-- ---------------------------------------------------------------------------

create or replace function private.guard_super_admin_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Set (transaction-local) only by Super Admin RPCs and the one-time
  -- designation; not settable through the REST API.
  privileged_change boolean :=
    coalesce(current_setting('ignis.super_admin_change', true), '') = 'on';
begin
  -- Official account: deletion and identity/privilege changes are never allowed.
  if tg_op = 'DELETE' and private.is_protected_account(old.admin_id) then
    raise exception 'This is the official IGNIS SAFE system account. It is permanently protected and cannot be deleted.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and private.is_protected_account(old.admin_id) then
    if new.admin_id is distinct from old.admin_id
      or new.is_super_admin is distinct from true
      or lower(trim(coalesce(new.role, ''))) <> 'admin'
      or lower(trim(coalesce(new.email, ''))) is distinct from lower(trim(coalesce(old.email, ''))) then
      raise exception 'The official IGNIS SAFE account''s ID, email, Admin role, and Super Admin privileges are permanently protected.'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status and lower(trim(coalesce(new.status, ''))) <> 'active' then
      raise exception 'The official IGNIS SAFE account cannot be deactivated, archived, or suspended.'
        using errcode = '42501';
    end if;

    if (select auth.uid()) is not null
      and (select auth.uid()) <> old.admin_id
      and not private.is_super_admin() then
      raise exception 'Only the account owner or a Super Admin can edit the official IGNIS SAFE account.'
        using errcode = '42501';
    end if;
  end if;

  -- Defense in depth: a signed-in caller must also be an active Super Admin.
  if privileged_change and (select auth.uid()) is not null and not private.is_super_admin() then
    privileged_change := false;
  end if;

  if tg_op = 'INSERT' then
    if new.is_super_admin and not privileged_change then
      raise exception 'Super Admin privileges can only be granted by a Super Admin.'
        using errcode = '42501';
    end if;
    if lower(trim(coalesce(new.role, ''))) = 'admin'
      and (select auth.uid()) is not null
      and not private.is_super_admin() then
      raise exception 'Only a Super Admin can create Admin accounts.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- A Super Admin can only be removed after being moved to Trash.
    if old.is_super_admin and lower(trim(coalesce(old.status, ''))) <> 'archived' then
      raise exception 'A Super Admin account must be moved to Trash before it can be deleted.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if new.is_super_admin is distinct from old.is_super_admin and not privileged_change then
    raise exception 'Super Admin privileges can only be granted or revoked by a Super Admin.'
      using errcode = '42501';
  end if;

  if lower(trim(coalesce(new.role, ''))) is distinct from lower(trim(coalesce(old.role, '')))
    and (select auth.uid()) is not null
    and not private.is_super_admin() then
    raise exception 'Only a Super Admin can change account roles.'
      using errcode = '42501';
  end if;

  if old.is_super_admin
    and new.is_super_admin
    and new.status is distinct from old.status
    and (select auth.uid()) is not null
    and (select auth.uid()) <> old.admin_id
    and not private.is_super_admin() then
    raise exception 'Only a Super Admin can change the status of a Super Admin account.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_super_admin_changes() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- archive_record: a Super Admin may also move Admin / Super Admin accounts
-- to Trash (identical to the previous definition otherwise)
-- ---------------------------------------------------------------------------

create or replace function public.archive_record(p_module text, p_record_id text, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_archive_admin();
  record_uuid uuid;
  affected integer := 0;
  profile_row public.profiles;
  account_row public.admin;
  result_id uuid;
begin
  begin
    record_uuid := p_record_id::uuid;
  exception when invalid_text_representation then
    raise exception 'Invalid record id.' using errcode = '22023';
  end;

  if p_module in ('personnel_accounts', 'mobile_users') and private.is_protected_account(record_uuid) then
    perform private.log_protected_account_attempt(record_uuid, 'move to Trash', 'archive_record');
    return null;
  end if;

  if length(coalesce(p_reason, '')) > 500 then
    raise exception 'The reason must be 500 characters or fewer.' using errcode = '22023';
  end if;
  perform set_config('ignis.archive_reason', coalesce(trim(p_reason), ''), true);

  if p_module = 'announcements' then
    update public.announcements
      set is_archived = true, archived_at = now(), archived_by = actor
      where announcement_id = record_uuid and not is_archived;
    get diagnostics affected = row_count;
  elsif p_module = 'reports' then
    update public.reports
      set status = 'archived', reviewed_at = now()
      where report_id = record_uuid and status <> 'archived';
    get diagnostics affected = row_count;
  elsif p_module = 'attendance' then
    if exists (select 1 from public.attendance_records where id = record_uuid) then
      insert into public.attendance_archives (attendance_id, archived_by)
        values (record_uuid, actor)
        on conflict (attendance_id) do nothing;
      get diagnostics affected = row_count;
    end if;
  elsif p_module = 'leave_requests' then
    update public.leave_requests
      set is_archived = true, archived_at = now(), archived_by = actor
      where request_id = record_uuid and status <> 'pending' and not is_archived;
    get diagnostics affected = row_count;
  elsif p_module = 'profile_change_requests' then
    update public.profile_change_requests
      set is_archived = true, archived_at = now(), archived_by = actor
      where request_id = record_uuid and status <> 'pending' and not is_archived;
    get diagnostics affected = row_count;
  elsif p_module = 'mobile_users' then
    select * into profile_row from public.profiles where id = record_uuid;
    if profile_row.id is null or exists (select 1 from public.admin where admin_id = record_uuid) then
      raise exception 'Only mobile user accounts can be moved to Trash here.' using errcode = '42501';
    end if;
    update public.profiles set is_active = false where id = record_uuid and is_active;
    get diagnostics affected = row_count;
    if affected > 0 then
      perform private.archive_open(
        'mobile_users', p_record_id,
        coalesce(nullif(trim(concat_ws(' ', profile_row.first_name, profile_row.last_name)), ''), profile_row.email, 'Mobile user'),
        profile_row.email, profile_row.created_at, 'soft_deleted', actor,
        'Moved to Trash by an administrator', jsonb_build_object('is_active', true)
      );
    end if;
  elsif p_module = 'personnel_accounts' then
    select * into account_row from public.admin where admin_id = record_uuid;
    if account_row.admin_id is null or account_row.admin_id = actor then
      raise exception 'This account cannot be moved to Trash.' using errcode = '42501';
    end if;
    if (lower(trim(account_row.role)) = 'admin' or account_row.is_super_admin)
      and not private.is_super_admin() then
      raise exception 'Only a Super Admin can move Admin and Super Admin accounts to Trash.' using errcode = '42501';
    end if;
    update public.admin set status = 'Archived', updated_at = now()
      where admin_id = record_uuid and status is distinct from 'Archived';
    get diagnostics affected = row_count;
    if affected > 0 then
      perform private.archive_open(
        'personnel_accounts', p_record_id,
        coalesce(nullif(trim(concat_ws(' ', account_row.rank, account_row.first_name, account_row.last_name)), ''), account_row.email),
        concat_ws(' · ', case when account_row.is_super_admin then 'Super Admin' else initcap(account_row.role) end, account_row.email),
        account_row.created_at, 'soft_deleted', actor,
        'Moved to Trash by an administrator', jsonb_build_object('status', coalesce(account_row.status, 'Active'))
      );
    end if;
  else
    raise exception 'Archiving is not supported for this module.' using errcode = '22023';
  end if;

  if affected = 0 then
    raise exception 'The record was not found, is already archived, or is not eligible for archiving.' using errcode = 'P0002';
  end if;

  perform set_config('ignis.archive_reason', '', true);

  select item_id into result_id from public.archive_items
    where module = p_module and record_id = p_record_id and status = 'active';
  return result_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- manage_account: one validated change (role / rank / status) per call
-- ---------------------------------------------------------------------------

-- p_changes keys (all optional): role ('personnel' | 'admin' | 'super_admin'),
-- rank, status ('Active' | 'Inactive' | 'Suspended').
-- Permission failures raise; business-rule rejections return ok = false so a
-- bulk run can continue and the protected-account attempt stays audit-logged.
create or replace function public.manage_account(p_target_admin_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.admin%rowtype;
  target public.admin%rowtype;
  target_name text;
  cur_role text;
  new_role text;
  new_rank text;
  new_status text;
  next_role text;
  next_super boolean;
  next_status text;
  summary text[] := '{}';
  action_label text := 'Account Updated';
begin
  if not private.is_super_admin() then
    raise exception 'Only a Super Admin can manage accounts.' using errcode = '42501';
  end if;
  if p_target_admin_id is null or p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'A target account and changes are required.' using errcode = '22023';
  end if;

  new_role := nullif(lower(trim(coalesce(p_changes->>'role', ''))), '');
  new_rank := nullif(trim(coalesce(p_changes->>'rank', '')), '');
  new_status := nullif(trim(coalesce(p_changes->>'status', '')), '');

  if new_role is not null and new_role not in ('personnel', 'admin', 'super_admin') then
    raise exception 'Invalid role.' using errcode = '22023';
  end if;
  if new_status is not null and new_status not in ('Active', 'Inactive', 'Suspended') then
    raise exception 'Invalid account status.' using errcode = '22023';
  end if;
  if new_rank is not null and length(new_rank) > 60 then
    raise exception 'Invalid rank.' using errcode = '22023';
  end if;

  select * into actor from public.admin where admin_id = (select auth.uid());
  select * into target from public.admin where admin_id = p_target_admin_id for update;
  if not found or lower(coalesce(target.status, '')) = 'archived' then
    return jsonb_build_object('ok', false, 'message', 'Account was not found or is in Trash.');
  end if;

  target_name := coalesce(nullif(trim(concat_ws(' ', target.first_name, target.last_name)), ''), target.email, target.admin_id::text);
  cur_role := case when target.is_super_admin then 'super_admin' else lower(trim(target.role)) end;

  if private.is_protected_account(target.admin_id)
    and ((new_role is not null and new_role <> cur_role) or (new_status is not null and new_status <> 'Active')) then
    perform private.log_protected_account_attempt(
      target.admin_id,
      case when new_role is not null and new_role <> cur_role then 'change the role of' else 'deactivate' end,
      'manage_account');
    return jsonb_build_object('ok', false, 'message', 'This is the official IGNIS SAFE account. Its role and status are permanently protected.');
  end if;

  if target.admin_id = actor.admin_id
    and ((new_role is not null and new_role <> cur_role) or (new_status is not null and new_status <> 'Active')) then
    return jsonb_build_object('ok', false, 'message', 'You cannot change your own role or deactivate your own account.');
  end if;

  next_role := lower(trim(target.role));
  next_super := target.is_super_admin;
  next_status := target.status;

  if new_role is not null and new_role <> cur_role then
    if cur_role = 'personnel' and new_role = 'admin' then
      next_role := 'admin';
      action_label := 'Account Promoted';
    elsif cur_role = 'admin' and new_role = 'super_admin' then
      next_super := true;
      action_label := 'Account Promoted';
    elsif cur_role = 'super_admin' and new_role = 'admin' then
      next_super := false;
      action_label := 'Account Demoted';
    else
      return jsonb_build_object('ok', false, 'message',
        case when new_role = 'super_admin' then 'Personnel must be promoted to Admin before Super Admin.'
             else 'That role change is not allowed.' end);
    end if;
    summary := summary || ('role ' || cur_role || ' -> ' || new_role);
  end if;

  if new_status is not null and new_status is distinct from target.status then
    next_status := new_status;
    summary := summary || ('status ' || coalesce(target.status, '-') || ' -> ' || new_status);
  end if;

  if next_super and lower(coalesce(next_status, '')) <> 'active' then
    return jsonb_build_object('ok', false, 'message', 'A Super Admin account must stay Active.');
  end if;

  if new_rank is not null and new_rank is distinct from target.rank then
    summary := summary || ('rank ' || coalesce(target.rank, '-') || ' -> ' || new_rank);
  else
    new_rank := target.rank;
  end if;

  if array_length(summary, 1) is null then
    return jsonb_build_object('ok', true, 'message', 'No changes were needed.', 'changed', false);
  end if;

  perform set_config('ignis.super_admin_change', 'on', true);
  update public.admin
  set role = next_role,
      is_super_admin = next_super,
      status = next_status,
      rank = new_rank,
      updated_at = now()
  where admin_id = target.admin_id;
  perform set_config('ignis.super_admin_change', '', true);

  insert into public.admin_activity_logs (admin_id, actor_name, action, action_type, details, status, metadata)
  values (
    actor.admin_id,
    coalesce(nullif(trim(concat_ws(' ', actor.first_name, actor.last_name)), ''), actor.email, 'Super Admin'),
    action_label,
    'edit',
    'Updated ' || target_name || coalesce(' (' || target.email || ')', '') || ': ' || array_to_string(summary, '; ') || '.',
    'SUCCESS',
    jsonb_build_object('target_admin_id', target.admin_id, 'target_email', target.email,
      'target_name', target_name, 'changes', to_jsonb(summary))
  );

  return jsonb_build_object('ok', true, 'message', array_to_string(summary, '; '), 'changed', true);
end;
$$;

revoke all on function public.manage_account(uuid, jsonb) from public, anon;
grant execute on function public.manage_account(uuid, jsonb) to authenticated;

commit;
