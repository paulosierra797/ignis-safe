-- Permanent protection for the official IGNIS SAFE Super Admin account.
--
-- The account is identified by its Supabase Auth user ID (stored once, in
-- private.protected_accounts), never by email at enforcement time. Protection
-- is independent of is_super_admin, so it holds even when more Super Admins
-- are created.
--
-- Enforced in the database (frontend restrictions are convenience only):
--   * public.admin and auth.users rows of a protected account cannot be
--     deleted by anyone: Admin, Super Admin, Personnel, RPCs, the Auth API,
--     or the scheduled Archive & Trash lifecycle.
--   * Its Admin role, Super Admin flag, official email, ID and active status
--     cannot be changed or revoked, and it cannot be banned or soft-deleted in
--     Auth. Name, contact number, rank, avatar and password changes still work.
--   * Only the account owner or an active Super Admin can edit its profile row.
--   * Attempts that arrive through an RPC (Move to Trash, permanent deletion)
--     are written to the Audit Logs. Direct trigger rejections raise an error
--     and roll back, so they cannot be audited from SQL.
--
-- No existing account record is altered or deleted.
-- Infrastructure-level Supabase administrators (postgres / service owners who
-- can disable triggers or edit the Auth dashboard) retain control outside
-- these application-level protections.
begin;

create table if not exists private.protected_accounts (
  user_id uuid primary key,
  label text not null,
  created_at timestamptz not null default now()
);

alter table private.protected_accounts enable row level security;
revoke all on table private.protected_accounts from public, anon, authenticated;

-- Register the official account by its existing, unique Auth user ID. Aborts
-- (applying nothing) unless exactly one matching Admin Super Admin exists.
do $$
declare
  official_email constant text := 'ignissafe.bfpdasmarinas@gmail.com';
  match_count integer;
  official_id uuid;
begin
  select count(*), min(auth_user.id::text)::uuid
  into match_count, official_id
  from auth.users as auth_user
  join public.admin as account on account.admin_id = auth_user.id
  where lower(trim(auth_user.email)) = official_email
    and account.is_super_admin
    and lower(trim(account.role)) = 'admin';

  if match_count <> 1 then
    raise exception 'Expected exactly one existing Super Admin account for %, found %. Nothing was protected.',
      official_email, match_count;
  end if;

  insert into private.protected_accounts (user_id, label)
  values (official_id, 'Official IGNIS SAFE system account')
  on conflict (user_id) do nothing;
end
$$;

create or replace function private.protected_accounts_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The protected account registry cannot be changed.' using errcode = '42501';
end;
$$;

drop trigger if exists protected_accounts_no_change on private.protected_accounts;
create trigger protected_accounts_no_change
  before update or delete on private.protected_accounts
  for each row execute function private.protected_accounts_immutable();

drop trigger if exists protected_accounts_no_truncate on private.protected_accounts;
create trigger protected_accounts_no_truncate
  before truncate on private.protected_accounts
  for each statement execute function private.protected_accounts_immutable();

create or replace function private.is_protected_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (select 1 from private.protected_accounts where user_id = p_user_id);
$$;

revoke all on function private.is_protected_account(uuid) from public, anon;
grant execute on function private.is_protected_account(uuid) to authenticated;

-- Lets the Admin UI mark protected accounts without hardcoding any ID.
create or replace function public.get_protected_account_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(user_id), '{}'::uuid[])
  from private.protected_accounts
  where private.current_backoffice_role() = 'admin';
$$;

revoke all on function public.get_protected_account_ids() from public, anon;
grant execute on function public.get_protected_account_ids() to authenticated;

-- Writes a rejected attempt to the existing Audit Logs. Never raises, so a
-- logging problem cannot weaken the rejection that called it.
create or replace function private.log_protected_account_attempt(
  p_target_id uuid,
  p_attempt text,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.archive_current_actor();
  actor_row public.admin%rowtype;
  target_row public.admin%rowtype;
begin
  select * into actor_row from public.admin where admin_id = actor_id;
  select * into target_row from public.admin where admin_id = p_target_id;

  insert into public.admin_activity_logs (admin_id, actor_name, action, action_type, details, status, metadata)
  values (
    actor_row.admin_id,
    coalesce(nullif(trim(concat_ws(' ', actor_row.first_name, actor_row.last_name)), ''), actor_row.email, 'System'),
    'Protected Account Deletion Blocked',
    'archive',
    'Blocked an attempt to ' || p_attempt || ' the official IGNIS SAFE system account'
      || coalesce(' (' || target_row.email || ')', '') || '. This account is permanently protected.',
    'FAILED',
    jsonb_build_object(
      'target_admin_id', p_target_id,
      'target_email', target_row.email,
      'attempt', p_attempt,
      'source', p_source,
      'actor_id', actor_id
    )
  );
exception when others then
  null;
end;
$$;

revoke all on function private.log_protected_account_attempt(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.admin guard: extends the existing Super Admin trigger function
-- ---------------------------------------------------------------------------

create or replace function private.guard_super_admin_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Set (transaction-local) only by public.set_super_admin_privilege() and
  -- the one-time designation; not settable through the REST API.
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
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.is_super_admin then
      raise exception 'The Super Admin account cannot be deleted.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if new.is_super_admin is distinct from old.is_super_admin and not privileged_change then
    raise exception 'Super Admin privileges can only be granted or revoked by a Super Admin.'
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
-- auth.users guard: the login itself cannot be deleted, banned, or re-emailed
-- ---------------------------------------------------------------------------

create or replace function private.guard_protected_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_protected_account(old.id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'This is the official IGNIS SAFE system account. It is permanently protected and cannot be deleted.'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or lower(trim(coalesce(new.email, ''))) is distinct from lower(trim(coalesce(old.email, '')))
    or new.deleted_at is not null
    or (new.banned_until is not null and new.banned_until > now()) then
    raise exception 'The official IGNIS SAFE account cannot be deleted, banned, or have its sign-in email changed.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_protected_auth_user() from public, anon, authenticated;

drop trigger if exists trg_guard_protected_auth_user on auth.users;
create trigger trg_guard_protected_auth_user
  before update or delete on auth.users
  for each row
  execute function private.guard_protected_auth_user();

-- ---------------------------------------------------------------------------
-- Archive & Trash entry points: reject and audit-log protected targets
-- ---------------------------------------------------------------------------

-- Same as the Archive & Trash definition, plus the protected-account gate.
-- A rejected attempt returns null (after logging) instead of raising so the
-- Audit Log entry is not rolled back; the client treats null as a rejection.
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
    if account_row.admin_id is null
      or lower(trim(account_row.role)) = 'admin'
      or account_row.is_super_admin
      or account_row.admin_id = actor then
      raise exception 'Administrator and Super Admin accounts cannot be moved to Trash.' using errcode = '42501';
    end if;
    update public.admin set status = 'Archived', updated_at = now()
      where admin_id = record_uuid and status is distinct from 'Archived';
    get diagnostics affected = row_count;
    if affected > 0 then
      perform private.archive_open(
        'personnel_accounts', p_record_id,
        coalesce(nullif(trim(concat_ws(' ', account_row.rank, account_row.first_name, account_row.last_name)), ''), account_row.email),
        concat_ws(' · ', initcap(account_row.role), account_row.email), account_row.created_at, 'soft_deleted', actor,
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

-- Permanent deletion step 1 (service role): reject protected accounts before
-- anything is locked or removed, and audit-log the attempt.
create or replace function public.archive_purge_prepare(p_item_id uuid, p_actor uuid, p_manual boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.archive_items;
  blocker text;
  files jsonb;
begin
  perform private.archive_require_purge_actor(p_actor, p_manual);

  select * into target from public.archive_items where item_id = p_item_id for update;
  if target.item_id is null then
    return jsonb_build_object('ok', false, 'reason', 'Item not found.');
  end if;

  if target.module in ('personnel_accounts', 'mobile_users')
    and private.is_protected_account(target.record_id::uuid) then
    perform set_config('ignis.archive_actor', coalesce(p_actor::text, ''), true);
    perform private.log_protected_account_attempt(
      target.record_id::uuid, 'permanently delete', case when p_manual then 'manual_purge' else 'automatic_purge' end);
    perform set_config('ignis.archive_actor', '', true);
    return jsonb_build_object('ok', false, 'reason', 'This is the official IGNIS SAFE system account and cannot be deleted.');
  end if;

  if target.purge_state = 'purging' and target.purge_started_at > now() - interval '15 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'Permanent deletion is already in progress for this item.');
  end if;

  blocker := private.archive_purge_blocker(target, p_manual);
  if blocker is not null then
    if p_manual then
      perform private.archive_log(target.item_id, target.module, target.record_id, target.record_label,
        'purge_blocked', p_actor, blocker, jsonb_build_object('manual', true));
    end if;
    return jsonb_build_object('ok', false, 'reason', blocker);
  end if;

  select coalesce(jsonb_agg(distinct file), '[]'::jsonb) into files
    from jsonb_array_elements(private.archive_record_files(target.module, target.record_id) || target.storage_objects) as file;

  update public.archive_items
    set purge_state = 'purging', purge_started_at = now(), storage_objects = files, updated_at = now()
    where item_id = target.item_id;

  return jsonb_build_object('ok', true, 'files', files, 'module', target.module, 'record_id', target.record_id);
end;
$$;

commit;
