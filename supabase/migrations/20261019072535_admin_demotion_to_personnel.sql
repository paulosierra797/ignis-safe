-- Preserve existing promotion/protection rules and add Admin -> Personnel.
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
    perform private.log_protected_account_attempt(target.admin_id,
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
    elsif cur_role = 'admin' and new_role = 'personnel' then
      next_role := 'personnel';
      next_super := false;
      action_label := 'Account Demoted';
    else
      return jsonb_build_object('ok', false, 'message',
        case when new_role = 'super_admin' then 'Personnel must be promoted to Admin before Super Admin.'
          when cur_role = 'super_admin' and new_role = 'personnel' then 'Revoke Super Admin privileges before demoting to Personnel.'
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
  set role = next_role, is_super_admin = next_super, status = next_status,
      rank = new_rank,
      permissions = case when cur_role = 'admin' and new_role = 'personnel' then '[]'::jsonb else permissions end,
      updated_at = now()
  where admin_id = target.admin_id;
  perform set_config('ignis.super_admin_change', '', true);

  insert into public.admin_activity_logs (admin_id, actor_name, action, action_type, details, status, metadata)
  values (actor.admin_id,
    coalesce(nullif(trim(concat_ws(' ', actor.first_name, actor.last_name)), ''), actor.email, 'Super Admin'),
    action_label, 'edit',
    'Updated ' || target_name || coalesce(' (' || target.email || ')', '') || ': ' || array_to_string(summary, '; ') || '.',
    'SUCCESS', jsonb_build_object('target_admin_id', target.admin_id, 'target_email', target.email,
      'target_name', target_name, 'changes', to_jsonb(summary)));
  return jsonb_build_object('ok', true, 'message', array_to_string(summary, '; '), 'changed', true);
end;
$$;

revoke all on function public.manage_account(uuid, jsonb) from public, anon;
grant execute on function public.manage_account(uuid, jsonb) to authenticated;
