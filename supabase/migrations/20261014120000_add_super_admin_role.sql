-- Chief / Super Admin designation.
--
-- The Super Admin is an existing Admin account (role stays 'admin', so every
-- existing Admin policy, RPC, edge function, and API check keeps working) with
-- a protected `is_super_admin` flag layered on top. Existing Admin, Personnel,
-- and Mobile User access is unchanged.
--
-- Enforced in the database:
--   * Only an active Super Admin can grant or revoke Super Admin privileges,
--     and only through public.set_super_admin_privilege(), which also writes
--     the audit log entry. Direct table writes to the flag are rejected.
--   * The last active Super Admin cannot be revoked.
--   * A Super Admin account cannot be deleted, demoted from the Admin role, or
--     have its status changed by a regular Admin.
begin;

alter table public.admin
  add column if not exists is_super_admin boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_super_admin_requires_admin_role'
      and conrelid = 'public.admin'::regclass
  ) then
    alter table public.admin
      add constraint admin_super_admin_requires_admin_role
      check (not is_super_admin or lower(trim(role)) = 'admin');
  end if;
end
$$;

create or replace function private.is_super_admin()
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
      and account.is_super_admin
      and lower(trim(account.role)) = 'admin'
      and lower(coalesce(account.status, '')) = 'active'
  );
$$;

revoke all on function private.is_super_admin() from public, anon;
grant execute on function private.is_super_admin() to authenticated;

create or replace function private.guard_super_admin_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Set (transaction-local) only by public.set_super_admin_privilege() and
  -- the one-time designation below; not settable through the REST API.
  privileged_change boolean :=
    coalesce(current_setting('ignis.super_admin_change', true), '') = 'on';
begin
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

drop trigger if exists trg_guard_super_admin_changes on public.admin;
create trigger trg_guard_super_admin_changes
  before insert or update or delete on public.admin
  for each row
  execute function private.guard_super_admin_changes();

create or replace function public.set_super_admin_privilege(
  p_target_admin_id uuid,
  p_grant boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.admin%rowtype;
  target public.admin%rowtype;
  target_name text;
  remaining_super_admins integer;
begin
  if p_target_admin_id is null or p_grant is null then
    raise exception 'A target account and action are required.' using errcode = '22023';
  end if;

  if not private.is_super_admin() then
    raise exception 'Only the Super Admin can grant or revoke Super Admin privileges.'
      using errcode = '42501';
  end if;

  -- Serialize concurrent grant/revoke calls so two Super Admins cannot revoke
  -- each other at the same time and leave the system without one.
  perform 1 from public.admin where is_super_admin for update;

  select * into actor from public.admin where admin_id = (select auth.uid());

  select * into target from public.admin where admin_id = p_target_admin_id for update;
  if not found then
    raise exception 'Account was not found.' using errcode = 'P0002';
  end if;

  target_name := coalesce(
    nullif(trim(concat_ws(' ', target.first_name, target.last_name)), ''),
    target.email,
    target.admin_id::text
  );

  if p_grant then
    if target.is_super_admin then
      raise exception 'This account is already a Super Admin.' using errcode = '22023';
    end if;
    if lower(trim(target.role)) <> 'admin' then
      raise exception 'Super Admin privileges can only be granted to an Admin account.'
        using errcode = '22023';
    end if;
    if lower(coalesce(target.status, '')) <> 'active' then
      raise exception 'Super Admin privileges can only be granted to an active account.'
        using errcode = '22023';
    end if;
  else
    if not target.is_super_admin then
      raise exception 'This account is not a Super Admin.' using errcode = '22023';
    end if;

    select count(*) into remaining_super_admins
    from public.admin
    where is_super_admin
      and admin_id <> target.admin_id
      and lower(trim(role)) = 'admin'
      and lower(coalesce(status, '')) = 'active';

    if remaining_super_admins = 0 then
      raise exception 'The last active Super Admin cannot be revoked.' using errcode = '42501';
    end if;
  end if;

  perform set_config('ignis.super_admin_change', 'on', true);
  update public.admin
  set is_super_admin = p_grant,
      updated_at = now()
  where admin_id = target.admin_id;
  perform set_config('ignis.super_admin_change', '', true);

  insert into public.admin_activity_logs (admin_id, actor_name, action, action_type, details, status, metadata)
  values (
    actor.admin_id,
    coalesce(nullif(trim(concat_ws(' ', actor.first_name, actor.last_name)), ''), actor.email, 'Super Admin'),
    case when p_grant then 'Super Admin Granted' else 'Super Admin Revoked' end,
    'edit',
    case
      when p_grant then 'Granted Super Admin privileges to ' || target_name || coalesce(' (' || target.email || ')', '') || '.'
      else 'Revoked Super Admin privileges from ' || target_name || coalesce(' (' || target.email || ')', '') || '.'
    end,
    'SUCCESS',
    jsonb_build_object(
      'target_admin_id', target.admin_id,
      'target_email', target.email,
      'target_name', target_name,
      'is_super_admin', p_grant
    )
  );

  return jsonb_build_object('admin_id', target.admin_id, 'is_super_admin', p_grant);
end;
$$;

revoke all on function public.set_super_admin_privilege(uuid, boolean) from public, anon;
grant execute on function public.set_super_admin_privilege(uuid, boolean) to authenticated;

-- Designate the existing official BFP Dasmariñas account. No account is
-- created; the migration aborts (and nothing is applied) unless exactly one
-- existing Admin account matches.
do $$
declare
  official_email constant text := 'ignissafe.bfpdasmarinas@gmail.com';
  match_count integer;
  official public.admin%rowtype;
begin
  select count(*) into match_count
  from public.admin as account
  left join auth.users as auth_user on auth_user.id = account.admin_id
  where lower(trim(account.email)) = official_email
     or lower(trim(auth_user.email)) = official_email;

  if match_count <> 1 then
    raise exception 'Expected exactly one existing account for %, found %. Super Admin was not designated.',
      official_email, match_count;
  end if;

  select account.* into official
  from public.admin as account
  left join auth.users as auth_user on auth_user.id = account.admin_id
  where lower(trim(account.email)) = official_email
     or lower(trim(auth_user.email)) = official_email;

  if lower(trim(official.role)) <> 'admin' then
    raise exception 'The official account % is not an Admin account. Super Admin was not designated.',
      official_email;
  end if;

  if official.is_super_admin then
    return;
  end if;

  perform set_config('ignis.super_admin_change', 'on', true);
  update public.admin
  set is_super_admin = true,
      updated_at = now()
  where admin_id = official.admin_id;
  perform set_config('ignis.super_admin_change', '', true);

  insert into public.admin_activity_logs (admin_id, actor_name, action, action_type, details, status, metadata)
  values (
    official.admin_id,
    'System',
    'Super Admin Granted',
    'edit',
    'Designated the official BFP Dasmariñas account (' || official_email || ') as Super Admin.',
    'SUCCESS',
    jsonb_build_object(
      'target_admin_id', official.admin_id,
      'target_email', official.email,
      'is_super_admin', true,
      'source', 'initial_designation'
    )
  );
end
$$;

commit;
