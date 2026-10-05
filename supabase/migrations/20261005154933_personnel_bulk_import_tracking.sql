-- Durable, backend-only progress for confirmed imports. Existing account RLS is unchanged.
create table public.personnel_import_records (
  row_id uuid primary key,
  actor_id uuid not null,
  email text not null unique check (email = lower(btrim(email))),
  auth_user_id uuid,
  state text not null default 'failed' check (state in ('processing', 'failed', 'created')),
  stage text not null default 'auth',
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.personnel_import_records enable row level security;
revoke all on public.personnel_import_records from public, anon, authenticated;
grant select, insert, update on public.personnel_import_records to service_role;

-- Auth-only and orphaned profile emails must also block a fresh import.
create function public.personnel_import_email_lookup(p_email text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'auth_user_id', (select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1),
    'import_row_id', (select raw_app_meta_data->>'personnel_import_row_id' from auth.users where lower(email) = lower(btrim(p_email)) limit 1),
    'import_role', (select raw_app_meta_data->>'personnel_import_role' from auth.users where lower(email) = lower(btrim(p_email)) limit 1),
    'email_confirmed', (select email_confirmed_at is not null from auth.users where lower(email) = lower(btrim(p_email)) limit 1),
    'admin_id', (select admin_id from public.admin where lower(email) = lower(btrim(p_email)) limit 1),
    'profile_id', (select id from public.profiles where lower(email) = lower(btrim(p_email)) limit 1),
    'reserved_row_id', (select row_id from public.personnel_import_records where email = lower(btrim(p_email))),
    'reserved_actor_id', (select actor_id from public.personnel_import_records where email = lower(btrim(p_email)))
  );
$$;

create function public.personnel_import_email_lookup_batch(p_emails text[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(email, public.personnel_import_email_lookup(email)), '{}'::jsonb)
  from (select distinct unnest(p_emails) as email) emails;
$$;

create function public.claim_personnel_import(p_row_id uuid, p_actor_id uuid, p_email text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  record public.personnel_import_records;
  owned_auth_id uuid;
begin
  select id into owned_auth_id from auth.users
    where raw_app_meta_data->>'personnel_import_row_id' = p_row_id::text limit 1;
  select * into record from public.personnel_import_records where row_id = p_row_id for update;
  if found then
    if record.actor_id <> p_actor_id then return jsonb_build_object('claim', 'denied'); end if;
    if record.state = 'created' then return jsonb_build_object('claim', 'created', 'auth_user_id', record.auth_user_id); end if;
    if record.state = 'processing' and record.lease_until > now() then return jsonb_build_object('claim', 'processing'); end if;
    if record.email <> p_email and (record.auth_user_id is not null or owned_auth_id is not null) then
      return jsonb_build_object('claim', 'email_locked', 'auth_user_id', coalesce(record.auth_user_id, owned_auth_id));
    end if;
    update public.personnel_import_records set email=p_email, state='processing',
      auth_user_id=coalesce(auth_user_id, owned_auth_id), lease_token=p_token,
      lease_until=now() + interval '3 minutes', updated_at=now() where row_id=p_row_id;
  else
    insert into public.personnel_import_records(row_id,actor_id,email,state,lease_token,lease_until)
      values(p_row_id,p_actor_id,p_email,'processing',p_token,now() + interval '3 minutes');
  end if;
  return jsonb_build_object('claim', 'claimed', 'auth_user_id', coalesce(record.auth_user_id, owned_auth_id));
exception when unique_violation then
  return jsonb_build_object('claim', 'reserved');
end;
$$;

-- Completion and directory history are committed together; retries cannot duplicate history.
create function public.finish_personnel_import(p_row_id uuid, p_token uuid, p_state text, p_stage text, p_auth_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare record public.personnel_import_records; account public.admin;
begin
  if p_state not in ('failed', 'created') then return false; end if;
  update public.personnel_import_records set state=p_state,stage=p_stage,
    auth_user_id=coalesce(p_auth_id,auth_user_id),lease_until=null,updated_at=now()
    where row_id=p_row_id and lease_token=p_token and state='processing' returning * into record;
  if not found then return false; end if;
  if p_state='created' then
    select * into account from public.admin where admin_id=p_auth_id;
    insert into public.admin_activity_logs(admin_id,actor_name,action,action_type,details,metadata)
    values(record.actor_id,
      (select coalesce(nullif(concat_ws(' ',first_name,last_name),''),email) from public.admin where admin_id=record.actor_id),
      'Account Created','add','Created account ' || record.email || ' through personnel import.',
      jsonb_build_object('created_admin_id',p_auth_id,'created_name',concat_ws(' ',account.first_name,account.last_name),
        'created_email',record.email,'created_role',account.role,'import_row_id',p_row_id));
  end if;
  return true;
end;
$$;

revoke all on function public.personnel_import_email_lookup(text) from public, anon, authenticated;
revoke all on function public.personnel_import_email_lookup_batch(text[]) from public, anon, authenticated;
revoke all on function public.claim_personnel_import(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.finish_personnel_import(uuid,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.personnel_import_email_lookup(text) to service_role;
grant execute on function public.personnel_import_email_lookup_batch(text[]) to service_role;
grant execute on function public.claim_personnel_import(uuid,uuid,text,uuid) to service_role;
grant execute on function public.finish_personnel_import(uuid,uuid,text,text,uuid) to service_role;
