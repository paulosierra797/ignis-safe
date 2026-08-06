-- public.admin only allows UPDATE when the caller's backoffice role is
-- 'admin' (see admin_update_admin_only in 20260728124948_secure_roles_qr_and_admin_access.sql).
-- That intentionally blocks personnel from self-editing name/role/status/etc,
-- but it also silently blocks personnel from saving their own avatar_url:
-- the update matches zero rows under RLS, which is not an error, so the
-- client sees success while nothing is persisted.
--
-- Give any authenticated account a narrow, security-definer path to update
-- only their own avatar_url, without loosening admin_update_admin_only.
begin;

create or replace function public.update_own_avatar(p_avatar_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_url text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  update public.admin
  set avatar_url = p_avatar_url,
      updated_at = now()
  where admin_id = (select auth.uid())
  returning avatar_url into updated_url;

  if not found then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;

  return updated_url;
end;
$$;

revoke all on function public.update_own_avatar(text) from public, anon;
grant execute on function public.update_own_avatar(text) to authenticated;

commit;
