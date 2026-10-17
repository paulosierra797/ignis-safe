-- Mobile registration will save birth_date as YYYY-MM-DD in Auth user metadata.
-- Only a calculated age is returned to authorized back-office users.
create or replace function private.mobile_registration_age(p_metadata jsonb, p_today date)
returns integer
language plpgsql immutable
set search_path = ''
as $$
declare
  birth_text text := nullif(btrim(p_metadata->>'birth_date'), '');
  age_text text := nullif(btrim(p_metadata->>'age'), '');
  birthday date;
  years integer;
begin
  if p_today is null then return null; end if;
  if birth_text is not null then
    if birth_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or not pg_catalog.pg_input_is_valid(birth_text, 'date') then
      return null;
    end if;
    birthday := birth_text::date;
    if birthday > p_today then return null; end if;
    years := extract(year from pg_catalog.age(p_today, birthday))::integer;
  elsif age_text ~ '^[0-9]{1,3}$' then
    -- An age-only registration remains the user's reported age, not a guessed DOB.
    years := age_text::integer;
  else
    return null;
  end if;
  return case when years between 0 and 130 then years else null end;
end;
$$;

create or replace function private.mobile_registration_ages()
returns table(user_id uuid, age integer)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin a
    where a.admin_id = auth.uid()
      and lower(coalesce(a.role, '')) = 'admin'
      and lower(coalesce(a.status, '')) = 'active'
      and (a.is_super_admin or coalesce(a.permissions, '[]'::jsonb) ?| array['manage_users', 'view_progress'])
  ) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
  select p.id, private.mobile_registration_age(
    u.raw_user_meta_data, (current_timestamp at time zone 'Asia/Manila')::date
  )
  from public.profiles p
  join auth.users u on u.id = p.id
  where not exists (select 1 from public.admin a where a.admin_id = p.id);
end;
$$;

create or replace function public.get_mobile_registration_ages()
returns table(user_id uuid, age integer)
language sql stable
set search_path = ''
as $$
  select * from private.mobile_registration_ages();
$$;

revoke all on function private.mobile_registration_age(jsonb, date) from public, anon, authenticated;
revoke all on function private.mobile_registration_ages() from public, anon, authenticated;
revoke all on function public.get_mobile_registration_ages() from public, anon, authenticated;
grant execute on function private.mobile_registration_ages() to authenticated;
grant execute on function public.get_mobile_registration_ages() to authenticated;
