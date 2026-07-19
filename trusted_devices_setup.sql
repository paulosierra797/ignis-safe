-- Trusted device setup for OTP-skip login
-- Run this in Supabase SQL Editor.
--
-- Lets a Personnel/Admin account skip the login OTP step on a device that
-- already completed OTP verification and was explicitly "remembered".
-- Personnel devices stay trusted 7-14 days, Admin (and any other role)
-- devices stay trusted 8-12 hours. Trust is revoked on logout (this device),
-- password change/reset (all devices), and account suspension (all devices).

create extension if not exists pgcrypto;

create table if not exists public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admin(admin_id) on delete cascade,
  device_id text not null,
  secret_hash text not null,
  role_at_trust text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unique (user_id, device_id)
);

create index if not exists idx_trusted_devices_user
  on public.trusted_devices (user_id);

alter table public.trusted_devices enable row level security;

-- Defense in depth: a user may read/delete only their own device rows.
-- All actual writes go through the SECURITY DEFINER RPCs below, which
-- validate auth.uid() themselves and hash the device secret server-side.
drop policy if exists "trusted_devices_select_own" on public.trusted_devices;
create policy "trusted_devices_select_own"
on public.trusted_devices
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "trusted_devices_delete_own" on public.trusted_devices;
create policy "trusted_devices_delete_own"
on public.trusted_devices
for delete
to authenticated
using (user_id = auth.uid());

-- Check whether the presented (device_id, device_secret) pair is a valid,
-- unexpired, unrevoked trusted device for the currently authenticated user.
create or replace function public.check_trusted_device(
  p_device_id text,
  p_device_secret text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.trusted_devices%rowtype;
begin
  if auth.uid() is null then
    return false;
  end if;

  if p_device_id is null or p_device_secret is null then
    return false;
  end if;

  select * into v_row
  from public.trusted_devices
  where user_id = auth.uid()
    and device_id = p_device_id;

  if not found then
    return false;
  end if;

  if v_row.revoked_at is not null or v_row.expires_at <= now() then
    return false;
  end if;

  if v_row.secret_hash <> encode(digest(p_device_secret, 'sha256'), 'hex') then
    return false;
  end if;

  update public.trusted_devices
  set last_used_at = now()
  where id = v_row.id;

  return true;
end;
$$;

-- Mark the presented device as trusted for the currently authenticated user.
-- Should only be called immediately after a successful OTP verification.
create or replace function public.trust_device(
  p_device_id text,
  p_device_secret text,
  p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_ttl interval;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_device_id is null or p_device_secret is null then
    raise exception 'device_id and device_secret are required';
  end if;

  select role into v_role from public.admin where admin_id = auth.uid();

  if lower(coalesce(v_role, '')) = 'personnel' then
    v_ttl := make_interval(days => 7 + floor(random() * 8)::int);
  else
    v_ttl := make_interval(hours => 8 + floor(random() * 5)::int);
  end if;

  insert into public.trusted_devices (
    user_id, device_id, secret_hash, role_at_trust, user_agent, expires_at
  ) values (
    auth.uid(),
    p_device_id,
    encode(digest(p_device_secret, 'sha256'), 'hex'),
    coalesce(v_role, ''),
    p_user_agent,
    now() + v_ttl
  )
  on conflict (user_id, device_id) do update
  set secret_hash = excluded.secret_hash,
      role_at_trust = excluded.role_at_trust,
      user_agent = excluded.user_agent,
      expires_at = excluded.expires_at,
      revoked_at = null,
      last_used_at = now();
end;
$$;

-- Revoke trust for a single device (used on logout).
create or replace function public.revoke_device(
  p_device_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  delete from public.trusted_devices
  where user_id = auth.uid()
    and device_id = p_device_id;
end;
$$;

-- Revoke trust for every device belonging to the current user
-- (used on password change / password reset).
create or replace function public.revoke_all_devices() returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  delete from public.trusted_devices
  where user_id = auth.uid();
end;
$$;

-- Revoke all trusted devices for an account when it is suspended/deactivated.
-- This runs as the table owner (not auth.uid()-scoped) because it's the
-- *admin* performing the status update, not the affected user.
create or replace function public.revoke_trusted_devices_on_suspend() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('Suspended', 'Inactive', 'Expired') then
    delete from public.trusted_devices where user_id = new.admin_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_revoke_devices_on_status_change on public.admin;
create trigger trg_revoke_devices_on_status_change
after update of status on public.admin
for each row execute function public.revoke_trusted_devices_on_suspend();

-- Postgres grants EXECUTE to PUBLIC by default on new functions; explicitly
-- lock these down to authenticated users only (each also self-checks
-- auth.uid() internally, but this avoids exposing them to the anon role).
revoke execute on function public.check_trusted_device(text, text) from public;
revoke execute on function public.trust_device(text, text, text) from public;
revoke execute on function public.revoke_device(text) from public;
revoke execute on function public.revoke_all_devices() from public;

grant execute on function public.check_trusted_device(text, text) to authenticated;
grant execute on function public.trust_device(text, text, text) to authenticated;
grant execute on function public.revoke_device(text) to authenticated;
grant execute on function public.revoke_all_devices() to authenticated;
