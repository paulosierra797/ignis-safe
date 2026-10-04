-- The mobile app keeps the declared location in Auth metadata. Return only
-- that field to active admins, without exposing Auth records to the web client.
create or replace function private.mobile_registration_locations()
returns table (user_id uuid, location text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin a
    where a.admin_id = auth.uid()
      and lower(coalesce(a.role, '')) = 'admin'
      and lower(coalesce(a.status, '')) = 'active'
  ) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
  select p.id,
    case u.raw_user_meta_data->>'location'
      when 'Outside Dasmariñas City' then 'Outside Dasmariñas City'
      when 'Dasmariñas City, Cavite' then 'Dasmariñas City, Cavite'
      else null
    end
  from public.profiles p
  join auth.users u on u.id = p.id
  where not exists (select 1 from public.admin a where a.admin_id = p.id);
end;
$$;

create or replace function public.get_mobile_registration_locations()
returns table (user_id uuid, location text)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.mobile_registration_locations();
$$;

revoke all on function private.mobile_registration_locations() from public, anon;
revoke all on function public.get_mobile_registration_locations() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.mobile_registration_locations() to authenticated;
grant execute on function public.get_mobile_registration_locations() to authenticated;
