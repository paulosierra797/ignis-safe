-- Super Admin account creation through Add Personnel.
--
-- A new Super Admin is created like any Admin (role 'admin', invited and
-- pending activation) by the admin API, which then calls
-- public.designate_new_super_admin() to set the protected is_super_admin flag.
--
-- Enforced in the database:
--   * Only the service role (the admin API) can call the function; it is not
--     exposed to anon or authenticated clients.
--   * The actor must be an active Super Admin, re-checked here rather than
--     trusted from the API.
--   * Only a freshly invited Admin account (status 'Pending Activation') can be
--     designated, so this path cannot promote existing accounts. Promoting an
--     existing Admin still goes through public.set_super_admin_privilege().
--   * The designation is written to the audit log in the same transaction.
begin;

create or replace function public.designate_new_super_admin(
  p_actor_admin_id uuid,
  p_target_admin_id uuid
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
begin
  if p_actor_admin_id is null or p_target_admin_id is null then
    raise exception 'An actor and a target account are required.' using errcode = '22023';
  end if;

  select * into actor from public.admin where admin_id = p_actor_admin_id;
  if not found
    or not actor.is_super_admin
    or lower(trim(actor.role)) <> 'admin'
    or lower(coalesce(actor.status, '')) <> 'active' then
    raise exception 'Only a Super Admin can create a Super Admin account.'
      using errcode = '42501';
  end if;

  select * into target from public.admin where admin_id = p_target_admin_id for update;
  if not found then
    raise exception 'Account was not found.' using errcode = 'P0002';
  end if;

  if target.is_super_admin then
    raise exception 'This account is already a Super Admin.' using errcode = '22023';
  end if;
  if lower(trim(target.role)) <> 'admin' then
    raise exception 'Super Admin accounts must have the Admin role.' using errcode = '22023';
  end if;
  if coalesce(target.status, '') <> 'Pending Activation' then
    raise exception 'Only a newly created account can be designated as Super Admin here.'
      using errcode = '22023';
  end if;

  target_name := coalesce(
    nullif(trim(concat_ws(' ', target.first_name, target.last_name)), ''),
    target.email,
    target.admin_id::text
  );

  perform set_config('ignis.super_admin_change', 'on', true);
  update public.admin
  set is_super_admin = true,
      updated_at = now()
  where admin_id = target.admin_id;
  perform set_config('ignis.super_admin_change', '', true);

  insert into public.admin_activity_logs (admin_id, actor_name, action, action_type, details, status, metadata)
  values (
    actor.admin_id,
    coalesce(nullif(trim(concat_ws(' ', actor.first_name, actor.last_name)), ''), actor.email, 'Super Admin'),
    'Super Admin Granted',
    'registration',
    'Created Super Admin account for ' || target_name || coalesce(' (' || target.email || ')', '') || '.',
    'SUCCESS',
    jsonb_build_object(
      'target_admin_id', target.admin_id,
      'target_email', target.email,
      'target_name', target_name,
      'is_super_admin', true,
      'source', 'account_creation'
    )
  );

  return jsonb_build_object('admin_id', target.admin_id, 'is_super_admin', true);
end;
$$;

revoke all on function public.designate_new_super_admin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.designate_new_super_admin(uuid, uuid) to service_role;

commit;
