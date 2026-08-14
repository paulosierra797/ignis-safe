-- Face ID was permanently locked after first registration: PersonnelProfile.jsx
-- blocked any further registration client-side once a public.admin_face row
-- existed, with no way to ever update it, and no server-side check at all
-- (registerFace() upserted straight into admin_face, gated only by the
-- admin_id = auth.uid() RLS policies, which have no time restriction).
--
-- Replace the permanent block with a 7-day cooldown, enforced here in the
-- database so it can't be bypassed by calling Supabase directly. Personnel
-- can re-register their Face ID once 7 days have passed since their last
-- successful registration/update; attempting sooner raises an exception
-- carrying the next-eligible timestamp so the UI can show
-- "You can update your Face ID again on [date]."

begin;

create or replace function public.register_face(p_face_descriptor jsonb)
returns public.admin_face
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_uid uuid := (select auth.uid());
  cooldown_days constant int := 7;
  existing_row public.admin_face%rowtype;
  next_eligible_at timestamptz;
  result_row public.admin_face%rowtype;
begin
  if actor_uid is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into existing_row
  from public.admin_face
  where admin_id = actor_uid
  limit 1;

  if found then
    next_eligible_at := existing_row.updated_at + make_interval(days => cooldown_days);

    if now() < next_eligible_at then
      raise exception 'FACE_ID_COOLDOWN_ACTIVE:%', next_eligible_at::text
        using errcode = 'P0001';
    end if;

    update public.admin_face
    set face_descriptor = p_face_descriptor,
        updated_at = now()
    where admin_id = actor_uid
    returning * into result_row;
  else
    insert into public.admin_face (admin_id, face_descriptor, created_at, updated_at)
    values (actor_uid, p_face_descriptor, now(), now())
    returning * into result_row;
  end if;

  return result_row;
end;
$$;

revoke all on function public.register_face(jsonb) from public, anon;
grant execute on function public.register_face(jsonb) to authenticated;

-- Defense in depth: the admin_face_update_own RLS policy still lets a
-- caller UPDATE their own row directly (e.g. supabase.from('admin_face')
-- .update(...) from the browser console), bypassing register_face()
-- entirely. A row-level trigger closes that gap so the cooldown holds no
-- matter which path is used to write to this table.
create or replace function public.enforce_face_registration_cooldown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cooldown_days constant int := 7;
  next_eligible_at timestamptz := old.updated_at + make_interval(days => cooldown_days);
begin
  if now() < next_eligible_at then
    raise exception 'FACE_ID_COOLDOWN_ACTIVE:%', next_eligible_at::text
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_face_registration_cooldown on public.admin_face;

create trigger trg_enforce_face_registration_cooldown
before update on public.admin_face
for each row
execute function public.enforce_face_registration_cooldown();

commit;
