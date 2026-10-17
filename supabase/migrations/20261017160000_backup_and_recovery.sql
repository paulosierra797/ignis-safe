-- Backup & Recovery for IGNIS SAFE.
--
-- A backup is an encrypted ZIP (database records + uploaded files) created by
-- the backup-recovery edge function and stored in the private `system-backups`
-- bucket. A backup counts only after the function re-reads and verifies it;
-- that is also the only thing that can confirm a backup for Archive & Trash
-- (the old manual "Confirm backup" is removed). Restores only add what is
-- missing and never overwrite existing records or files.

-- ---------------------------------------------------------------------------
-- Audit trail event types
-- ---------------------------------------------------------------------------

alter table public.archive_events drop constraint if exists archive_events_event_type_check;
alter table public.archive_events add constraint archive_events_event_type_check check (event_type in (
  'archived', 'soft_deleted', 'restored', 'purged', 'deleted',
  'purge_blocked', 'purge_failed', 'policy_updated', 'backup_confirmed',
  'backup_created', 'backup_failed', 'backup_restored', 'backup_downloaded'
));

-- ---------------------------------------------------------------------------
-- Backup registry
-- ---------------------------------------------------------------------------

create table public.system_backups (
  backup_id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('manual', 'scheduled')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  created_by uuid references public.admin(admin_id) on delete set null,
  created_by_name text,
  note text check (note is null or length(note) <= 500),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  verified_at timestamptz,
  size_bytes bigint,
  plain_bytes bigint,
  plain_sha256 text,
  contents jsonb not null default '{}'::jsonb,
  parts jsonb not null default '[]'::jsonb,
  storage_location text not null default 'Private storage · system-backups',
  error text,
  restore_status text check (restore_status in ('running', 'completed', 'failed')),
  restore_started_at timestamptz,
  restore_completed_at timestamptz,
  restored_by_name text,
  restore_summary jsonb
);

comment on table public.system_backups is
  'Backups made by the backup-recovery edge function. A row is "completed" only after the stored backup was re-read, decrypted, and checked.';

create index system_backups_created_by_idx on public.system_backups (created_by);
create index system_backups_started_idx on public.system_backups (started_at desc);
-- One backup and one restore at a time.
create unique index system_backups_one_running_backup_idx on public.system_backups ((true)) where status = 'running';
create unique index system_backups_one_running_restore_idx on public.system_backups ((true)) where restore_status = 'running';

alter table public.system_backups enable row level security;
revoke all on public.system_backups from anon, authenticated;
-- The storage paths in `parts` stay server-side.
grant select (
  backup_id, kind, status, created_by_name, note, started_at, completed_at, verified_at,
  size_bytes, plain_bytes, contents, storage_location, error,
  restore_status, restore_started_at, restore_completed_at, restored_by_name, restore_summary
) on public.system_backups to authenticated;

create policy "Super admins read backups" on public.system_backups
  for select to authenticated using ((select private.is_super_admin()));

-- Private bucket. No storage policy mentions it, so only the service role
-- (the edge function) can read or write backup files.
insert into storage.buckets (id, name, public)
values ('system-backups', 'system-backups', false)
on conflict (id) do update set public = false;

-- ---------------------------------------------------------------------------
-- Helpers used only by the edge function (service role)
-- ---------------------------------------------------------------------------

-- Short-lived or sensitive tables that are never backed up or restored.
create or replace function private.backup_excluded_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'system_backups', 'auth_otp', 'app_sessions', 'qr_sessions', 'trusted_devices',
    'visitor_chat_rate_events', 'translation_rate_limit_windows'
  ];
$$;

create or replace function public.backup_table_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'table', c.relname,
    'parents', (
      select coalesce(jsonb_agg(distinct p.relname), '[]'::jsonb)
      from pg_constraint as k
      join pg_class as p on p.oid = k.confrelid
      where k.conrelid = c.oid and k.contype = 'f'
        and k.confrelid <> c.oid and p.relnamespace = c.relnamespace
    )
  ) order by c.relname), '[]'::jsonb)
  from pg_class as c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind = 'r'
    and c.relname <> all (private.backup_excluded_tables());
$$;

create or replace function public.backup_read_table(p_table text, p_offset integer, p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  order_cols text;
  result jsonb;
begin
  if p_table = any (private.backup_excluded_tables()) or not exists (
    select 1 from pg_class
    where relnamespace = 'public'::regnamespace and relname = p_table and relkind = 'r'
  ) then
    raise exception 'Unknown table.' using errcode = '22023';
  end if;

  select string_agg(format('%I', a.attname), ', ' order by array_position(i.indkey::int2[], a.attnum))
    into order_cols
    from pg_index as i
    join pg_attribute as a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
    where i.indrelid = format('public.%I', p_table)::regclass and i.indisprimary;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from public.%I order by %s offset %s limit %s) as t',
    p_table, coalesce(order_cols, 'ctid'), greatest(coalesce(p_offset, 0), 0), least(greatest(coalesce(p_limit, 500), 1), 1000)
  ) into result;
  return result;
end;
$$;

create or replace function public.backup_file_list()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket', object.bucket_id,
    'name', object.name,
    'size', coalesce((object.metadata->>'size')::bigint, 0),
    'mimetype', object.metadata->>'mimetype'
  ) order by object.bucket_id, object.name), '[]'::jsonb)
  from storage.objects as object
  where object.bucket_id <> 'system-backups';
$$;

-- Adds rows that are missing. Existing rows are never changed.
create or replace function public.backup_restore_rows(p_table text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cols text;
  total integer := coalesce(jsonb_array_length(p_rows), 0);
  added integer := 0;
  step integer;
  failed integer := 0;
  first_error text;
  one jsonb;
  identity_col record;
  sequence_name text;
  current_max bigint;
  current_last bigint;
  insert_sql text;
begin
  if p_table = any (private.backup_excluded_tables()) or not exists (
    select 1 from pg_class
    where relnamespace = 'public'::regnamespace and relname = p_table and relkind = 'r'
  ) then
    raise exception 'Unknown table.' using errcode = '22023';
  end if;
  if total = 0 then
    return jsonb_build_object('received', 0, 'added', 0, 'already_there', 0, 'failed', 0);
  end if;

  select string_agg(format('%I', attname), ', ' order by attnum) into cols
    from pg_attribute
    where attrelid = format('public.%I', p_table)::regclass
      and attnum > 0 and not attisdropped and attgenerated = '';

  insert_sql := format(
    'insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing',
    p_table, cols, cols, p_table
  );

  -- Records are restored exactly as they were: triggers (archive tracking,
  -- auto-numbering) are paused for this table until the transaction ends.
  execute format('alter table public.%I disable trigger user', p_table);

  begin
    execute insert_sql using p_rows;
    get diagnostics added = row_count;
  exception when others then
    added := 0;
    for one in select value from jsonb_array_elements(p_rows) loop
      begin
        execute insert_sql using jsonb_build_array(one);
        get diagnostics step = row_count;
        added := added + step;
      exception when others then
        failed := failed + 1;
        first_error := coalesce(first_error, sqlerrm);
      end;
    end loop;
  end;

  execute format('alter table public.%I enable trigger user', p_table);

  -- Keep identity counters ahead of restored ids.
  for identity_col in
    select a.attname::text as name
    from pg_attribute as a
    where a.attrelid = format('public.%I', p_table)::regclass
      and a.attnum > 0 and not a.attisdropped and a.attidentity <> ''
  loop
    sequence_name := pg_get_serial_sequence(format('public.%I', p_table), identity_col.name);
    continue when sequence_name is null;
    execute format('select max(%I)::bigint from public.%I', identity_col.name, p_table) into current_max;
    select last_value into current_last from pg_sequences
      where schemaname = split_part(sequence_name, '.', 1)
        and sequencename = trim(both '"' from split_part(sequence_name, '.', 2));
    if current_max is not null and current_max > coalesce(current_last, 0) then
      perform setval(sequence_name, current_max);
    end if;
  end loop;

  return jsonb_build_object(
    'received', total, 'added', added, 'already_there', total - added - failed,
    'failed', failed, 'error', first_error
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Backup lifecycle (service role)
-- ---------------------------------------------------------------------------

create or replace function public.backup_start(p_kind text, p_actor uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  -- A crashed run must not block new ones forever.
  update public.system_backups
    set status = 'failed', error = 'The backup stopped before it finished.', completed_at = now()
    where status = 'running' and started_at < now() - interval '45 minutes';
  update public.system_backups
    set restore_status = 'failed', restore_completed_at = now(),
        restore_summary = jsonb_build_object('error', 'The restore stopped before it finished.')
    where restore_status = 'running' and restore_started_at < now() - interval '45 minutes';

  if exists (select 1 from public.system_backups where status = 'running' or restore_status = 'running') then
    raise exception 'A backup or restore is already running. Please wait for it to finish.' using errcode = '55006';
  end if;

  insert into public.system_backups (kind, created_by, created_by_name, note)
  values (
    p_kind, private.archive_admin_ref(p_actor),
    case when p_actor is null then 'Scheduled backup' else private.archive_actor_name(p_actor) end,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning backup_id into new_id;
  return new_id;
end;
$$;

-- The only place a backup becomes "completed" and confirms Archive & Trash.
-- The edge function calls it after re-reading and verifying the stored files;
-- this also checks that every part exists in Storage with the expected size.
create or replace function public.backup_complete(
  p_backup_id uuid,
  p_parts jsonb,
  p_size bigint,
  p_plain_bytes bigint,
  p_plain_sha256 text,
  p_contents jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  backup public.system_backups;
  part_count integer := coalesce(jsonb_array_length(p_parts), 0);
  found_count integer;
begin
  select * into backup from public.system_backups where backup_id = p_backup_id for update;
  if backup.backup_id is null or backup.status <> 'running' then
    raise exception 'This backup is not running.' using errcode = '55000';
  end if;
  if part_count = 0 or coalesce(p_size, 0) <= 0 then
    raise exception 'The backup is empty.' using errcode = '22023';
  end if;

  select count(*) into found_count
    from jsonb_array_elements(p_parts) as part
    join storage.objects as object
      on object.bucket_id = 'system-backups'
     and object.name = part->>'path'
     and (object.metadata->>'size')::bigint = (part->>'bytes')::bigint;
  if found_count <> part_count then
    raise exception 'The stored backup files do not match.' using errcode = '55000';
  end if;

  update public.system_backups
    set status = 'completed', completed_at = now(), verified_at = now(), error = null,
        parts = p_parts, size_bytes = p_size, plain_bytes = p_plain_bytes,
        plain_sha256 = p_plain_sha256, contents = coalesce(p_contents, '{}'::jsonb)
    where backup_id = p_backup_id;

  -- Items archived before this backup began are now safely covered.
  update public.archive_policies
    set backup_confirmed_at = greatest(coalesce(backup_confirmed_at, '-infinity'::timestamptz), backup.started_at),
        backup_confirmed_by = backup.created_by,
        updated_at = now()
    where is_archivable;

  perform private.archive_log(null, 'system', 'backup', 'Backup', 'backup_created', backup.created_by,
    nullif(backup.note, ''),
    jsonb_build_object('backup_id', p_backup_id, 'kind', backup.kind, 'size_bytes', p_size));
end;
$$;

create or replace function public.backup_fail(p_backup_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  backup public.system_backups;
begin
  update public.system_backups
    set status = 'failed', completed_at = now(), error = left(coalesce(p_error, 'The backup failed.'), 500)
    where backup_id = p_backup_id and status = 'running'
    returning * into backup;
  if backup.backup_id is not null then
    perform private.archive_log(null, 'system', 'backup', 'Backup', 'backup_failed', backup.created_by,
      left(coalesce(p_error, ''), 500), jsonb_build_object('backup_id', p_backup_id, 'kind', backup.kind));
  end if;
end;
$$;

create or replace function public.backup_restore_begin(p_backup_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  backup public.system_backups;
begin
  update public.system_backups
    set restore_status = 'failed', restore_completed_at = now(),
        restore_summary = jsonb_build_object('error', 'The restore stopped before it finished.')
    where restore_status = 'running' and restore_started_at < now() - interval '45 minutes';

  select * into backup from public.system_backups where backup_id = p_backup_id for update;
  if backup.backup_id is null or backup.status <> 'completed' or backup.verified_at is null then
    raise exception 'Only a completed, verified backup can be restored.' using errcode = '55000';
  end if;
  if exists (select 1 from public.system_backups where status = 'running' or restore_status = 'running') then
    raise exception 'A backup or restore is already running. Please wait for it to finish.' using errcode = '55006';
  end if;

  update public.system_backups
    set restore_status = 'running', restore_started_at = now(), restore_completed_at = null,
        restored_by_name = private.archive_actor_name(p_actor), restore_summary = null
    where backup_id = p_backup_id;
end;
$$;

create or replace function public.backup_restore_finish(p_backup_id uuid, p_actor uuid, p_ok boolean, p_summary jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.system_backups
    set restore_status = case when p_ok then 'completed' else 'failed' end,
        restore_completed_at = now(), restore_summary = p_summary
    where backup_id = p_backup_id and restore_status = 'running';
  perform private.archive_log(null, 'system', 'backup', 'Backup', 'backup_restored', p_actor,
    case when p_ok then null else left(coalesce(p_summary->>'error', 'The restore failed.'), 500) end,
    jsonb_build_object('backup_id', p_backup_id, 'ok', p_ok, 'summary', p_summary));
end;
$$;

create or replace function public.backup_log_download(p_backup_id uuid, p_actor uuid, p_what text)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.archive_log(null, 'system', 'backup', 'Backup', 'backup_downloaded', p_actor, null,
    jsonb_build_object('backup_id', p_backup_id, 'what', p_what));
$$;

-- Backups can no longer be "confirmed" by hand: confirmation comes only from a
-- backup that was created and verified (backup_complete above).
create or replace function public.confirm_archive_backup(p_note text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Create a backup instead. It is confirmed automatically once it has been saved and checked.'
    using errcode = '42501';
end;
$$;

-- Earlier confirmations were typed in by hand and were never verified.
update public.archive_policies
  set backup_confirmed_at = null, backup_confirmed_by = null
  where backup_confirmed_at is not null;

revoke all on function public.confirm_archive_backup(text) from public, anon, authenticated;

revoke all on function
  public.backup_table_info(),
  public.backup_read_table(text, integer, integer),
  public.backup_file_list(),
  public.backup_restore_rows(text, jsonb),
  public.backup_start(text, uuid, text),
  public.backup_complete(uuid, jsonb, bigint, bigint, text, jsonb),
  public.backup_fail(uuid, text),
  public.backup_restore_begin(uuid, uuid),
  public.backup_restore_finish(uuid, uuid, boolean, jsonb),
  public.backup_log_download(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function
  public.backup_table_info(),
  public.backup_read_table(text, integer, integer),
  public.backup_file_list(),
  public.backup_restore_rows(text, jsonb),
  public.backup_start(text, uuid, text),
  public.backup_complete(uuid, jsonb, bigint, bigint, text, jsonb),
  public.backup_fail(uuid, text),
  public.backup_restore_begin(uuid, uuid),
  public.backup_restore_finish(uuid, uuid, boolean, jsonb),
  public.backup_log_download(uuid, uuid, text)
to service_role;

-- ---------------------------------------------------------------------------
-- Monthly schedule: the 1st of each month, 18:00 UTC (2:00 AM on the 2nd, Manila)
-- ---------------------------------------------------------------------------

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in select jobid from cron.job where jobname = 'system-backup-monthly' loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'system-backup-monthly',
    '0 18 1 * *',
    $job$
    select net.http_post(
      url := 'https://mvgpeiejwstrxjmfslke.supabase.co/functions/v1/backup-recovery',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-maintenance-token', (select decrypted_secret from vault.decrypted_secrets where name = 'archive_maintenance_token')
      ),
      body := '{"action":"scheduled"}'::jsonb,
      timeout_milliseconds := 10000
    );
    $job$
  );
end;
$$;
