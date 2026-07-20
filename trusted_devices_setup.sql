-- Trusted-device setup for password + email OTP login.
--
-- A remembered device never creates a Supabase session by itself. The user
-- must first complete password authentication, after which the device marker
-- can only be checked for that authenticated user. New trust can only be
-- created from a session whose most recent Supabase auth method is email OTP.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admin(admin_id) on delete cascade,
  device_id text not null,
  secret_hash text not null,
  role_at_trust text not null,
  user_agent text,
  trusted boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unique (user_id, device_id)
);

alter table public.trusted_devices
  add column if not exists trusted boolean not null default true;

create index if not exists idx_trusted_devices_user
  on public.trusted_devices (user_id);

alter table public.trusted_devices enable row level security;

-- Browser clients only need to read their own trust record. All writes use
-- the narrowly-scoped RPCs below, which validate auth.uid() and never expose
-- the raw device secret.
revoke all on table public.trusted_devices from anon;
revoke all on table public.trusted_devices from authenticated;
grant select on table public.trusted_devices to authenticated;

drop policy if exists "trusted_devices_select_own" on public.trusted_devices;
create policy "trusted_devices_select_own"
on public.trusted_devices
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "trusted_devices_insert_own" on public.trusted_devices;
drop policy if exists "trusted_devices_update_own" on public.trusted_devices;
drop policy if exists "trusted_devices_delete_own" on public.trusted_devices;

-- A password-authenticated user may check only their own browser marker.
-- Expiry, role/status changes, and a secret mismatch all invalidate trust.
create or replace function public.check_trusted_device(
  p_device_id text,
  p_device_secret text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.trusted_devices%rowtype;
  v_current_role text;
  v_status text;
begin
  if v_uid is null or nullif(btrim(p_device_id), '') is null
     or nullif(btrim(p_device_secret), '') is null then
    return false;
  end if;

  select * into v_row
  from public.trusted_devices
  where user_id = v_uid
    and device_id = p_device_id;

  if not found then
    return false;
  end if;

  select lower(btrim(coalesce(role, ''))), lower(btrim(coalesce(status, '')))
  into v_current_role, v_status
  from public.admin
  where admin_id = v_uid;

  if not found
     or v_status in ('suspended', 'inactive', 'expired')
     or v_current_role <> lower(btrim(v_row.role_at_trust))
     or not v_row.trusted
     or v_row.revoked_at is not null
     or v_row.expires_at <= now() then
    update public.trusted_devices
    set trusted = false,
        revoked_at = coalesce(revoked_at, now())
    where id = v_row.id;
    return false;
  end if;

  if v_row.secret_hash <> encode(extensions.digest(p_device_secret, 'sha256'), 'hex') then
    -- Treat a marker/secret mismatch as suspicious and require OTP again.
    update public.trusted_devices
    set trusted = false,
        revoked_at = now()
    where id = v_row.id;
    return false;
  end if;

  update public.trusted_devices
  set last_used_at = now()
  where id = v_row.id;

  return true;
end;
$$;

-- Mark this browser as trusted immediately after successful email OTP login.
-- Personnel: exactly 14 days. Admin: exactly 12 hours.
drop function if exists public.trust_device(text, text, text);
create function public.trust_device(
  p_device_id text,
  p_device_secret text,
  p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_auth_method text := coalesce(((select auth.jwt())->'amr'->0->>'method'), '');
  v_role text;
  v_status text;
  v_ttl interval;
  v_row public.trusted_devices%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_auth_method <> 'otp' then
    raise exception 'Recent email OTP verification is required';
  end if;

  if p_device_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or p_device_secret !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid device credentials';
  end if;

  select lower(btrim(coalesce(role, ''))), lower(btrim(coalesce(status, '')))
  into v_role, v_status
  from public.admin
  where admin_id = v_uid;

  if not found then
    raise exception 'Account profile not found';
  end if;

  if v_status in ('suspended', 'inactive', 'expired') then
    raise exception 'Account is not eligible for trusted-device login';
  end if;

  if v_role = 'personnel' then
    v_ttl := interval '14 days';
  else
    v_ttl := interval '12 hours';
  end if;

  insert into public.trusted_devices (
    user_id,
    device_id,
    secret_hash,
    role_at_trust,
    user_agent,
    trusted,
    created_at,
    last_used_at,
    expires_at,
    revoked_at
  ) values (
    v_uid,
    p_device_id,
    encode(extensions.digest(p_device_secret, 'sha256'), 'hex'),
    v_role,
    left(p_user_agent, 500),
    true,
    now(),
    now(),
    now() + v_ttl,
    null
  )
  on conflict (user_id, device_id) do update
  set secret_hash = excluded.secret_hash,
      role_at_trust = excluded.role_at_trust,
      user_agent = excluded.user_agent,
      trusted = true,
      created_at = now(),
      last_used_at = now(),
      expires_at = excluded.expires_at,
      revoked_at = null
  returning * into v_row;

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'device_id', v_row.device_id,
    'role_at_trust', v_row.role_at_trust,
    'expires_at', v_row.expires_at,
    'trusted', v_row.trusted
  );
end;
$$;

-- Manual "Forget this device" action. Normal logout does not call this.
create or replace function public.revoke_device(
  p_device_id text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;

  update public.trusted_devices
  set trusted = false,
      revoked_at = now()
  where user_id = (select auth.uid())
    and device_id = p_device_id;
end;
$$;

-- Password change/reset and suspicious-login handlers can revoke every
-- remembered browser for the current account.
create or replace function public.revoke_all_devices() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;

  update public.trusted_devices
  set trusted = false,
      revoked_at = now()
  where user_id = (select auth.uid())
    and trusted = true;
end;
$$;

-- Used when an administrator explicitly revokes a user's application session.
create or replace function public.admin_revoke_trusted_devices(
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.admin
    where admin_id = (select auth.uid())
      and lower(btrim(coalesce(role, ''))) = 'admin'
      and lower(btrim(coalesce(status, ''))) not in ('suspended', 'inactive', 'expired')
  ) then
    raise exception 'Administrator permission required';
  end if;

  update public.trusted_devices
  set trusted = false,
      revoked_at = now()
  where user_id = p_user_id
    and trusted = true;
end;
$$;

-- Suspension/deactivation revokes all remembered browsers for that account.
create or replace function public.revoke_trusted_devices_on_suspend() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and lower(btrim(coalesce(new.status, ''))) in ('suspended', 'inactive', 'expired') then
    update public.trusted_devices
    set trusted = false,
        revoked_at = now()
    where user_id = new.admin_id
      and trusted = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_revoke_devices_on_status_change on public.admin;
create trigger trg_revoke_devices_on_status_change
after update of status on public.admin
for each row execute function public.revoke_trusted_devices_on_suspend();

-- SECURITY DEFINER functions are public RPC endpoints only when explicitly
-- granted. Keep the trigger helper unreachable from browser roles.
revoke execute on function public.check_trusted_device(text, text) from public, anon;
revoke execute on function public.trust_device(text, text, text) from public, anon;
revoke execute on function public.revoke_device(text) from public, anon;
revoke execute on function public.revoke_all_devices() from public, anon;
revoke execute on function public.admin_revoke_trusted_devices(uuid) from public, anon;
revoke execute on function public.revoke_trusted_devices_on_suspend() from public, anon, authenticated;

grant execute on function public.check_trusted_device(text, text) to authenticated;
grant execute on function public.trust_device(text, text, text) to authenticated;
grant execute on function public.revoke_device(text) to authenticated;
grant execute on function public.revoke_all_devices() to authenticated;
grant execute on function public.admin_revoke_trusted_devices(uuid) to authenticated;

comment on column public.trusted_devices.trusted is
  'True only while this browser is allowed to skip the application email OTP step.';
