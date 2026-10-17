-- Backup & Recovery: resumable steps and real progress.
--
-- Edge functions get about 2 seconds of CPU per request, so one long backup
-- request was stopped part-way and its row stayed "running" with no error.
-- The backup-recovery function now works in short steps. Each step saves its
-- place in `job` (server-only) and reports what it really did in `progress`
-- or `restore_progress` (readable by Super Admins). A run whose progress has
-- not changed for 5 minutes is marked failed instead of looking busy forever.

alter table public.system_backups
  add column progress jsonb,
  add column restore_progress jsonb,
  add column job jsonb not null default '{}'::jsonb;

comment on column public.system_backups.progress is
  'Live backup progress written by the edge function: stage, activity, counts, done_bytes/total_bytes, updated_at (database time).';
comment on column public.system_backups.restore_progress is
  'Live restore progress written by the edge function, same shape as progress.';
comment on column public.system_backups.job is
  'Where the running backup or restore is up to. Server-only: never granted to signed-in users.';

grant select (progress, restore_progress) on public.system_backups to authenticated;

-- Table list for backups, now with a size estimate used only for the progress total.
create or replace function public.backup_table_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'table', c.relname,
    'est_bytes', pg_table_size(c.oid),
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

-- Saves a step only if nobody else saved it first (p_expected_step is the step
-- the caller started from; -1 for a new job). A null p_job keeps the job and
-- only refreshes progress, which also serves as the heartbeat.
create or replace function public.backup_step_save(
  p_backup_id uuid,
  p_mode text,
  p_expected_step integer,
  p_job jsonb,
  p_progress jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  stamp jsonb := jsonb_build_object('updated_at', now());
begin
  if p_mode = 'backup' then
    update public.system_backups
      set job = coalesce(p_job, job),
          progress = coalesce(p_progress, progress, '{}'::jsonb) || stamp
      where backup_id = p_backup_id and status = 'running'
        and coalesce((job->>'step')::integer, -1) = p_expected_step;
  elsif p_mode = 'restore' then
    update public.system_backups
      set job = coalesce(p_job, job),
          restore_progress = coalesce(p_progress, restore_progress, '{}'::jsonb) || stamp
      where backup_id = p_backup_id and restore_status = 'running'
        and coalesce((job->>'step')::integer, -1) = p_expected_step;
  else
    raise exception 'Unknown mode.' using errcode = '22023';
  end if;
  return found;
end;
$$;

-- Marks runs that stopped reporting as failed, so they never look busy forever.
create or replace function private.backup_expire_stalled()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.system_backups
    set status = 'failed', completed_at = now(), job = '{}'::jsonb,
        error = 'The backup stopped responding for 5 minutes, so it was stopped. Please try again.'
    where status = 'running'
      and coalesce((progress->>'updated_at')::timestamptz, started_at) < now() - interval '5 minutes';
  update public.system_backups
    set restore_status = 'failed', restore_completed_at = now(), job = '{}'::jsonb,
        restore_summary = coalesce(restore_summary, '{}'::jsonb)
          || jsonb_build_object('error', 'The restore stopped responding for 5 minutes, so it was stopped. Nothing that exists now was changed or replaced.')
    where restore_status = 'running'
      and coalesce((restore_progress->>'updated_at')::timestamptz, restore_started_at) < now() - interval '5 minutes';
end;
$$;

-- Lets the Backup page clear stopped runs when it loads (Super Admins only).
create or replace function public.backup_expire_stalled()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_super_admin()) then
    return;
  end if;
  perform private.backup_expire_stalled();
end;
$$;

create or replace function public.backup_start(p_kind text, p_actor uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform private.backup_expire_stalled();

  if exists (select 1 from public.system_backups where status = 'running' or restore_status = 'running') then
    raise exception 'A backup or restore is already running. Please wait for it to finish.' using errcode = '55006';
  end if;

  insert into public.system_backups (kind, created_by, created_by_name, note, progress)
  values (
    p_kind, private.archive_admin_ref(p_actor),
    case when p_actor is null then 'Scheduled backup' else private.archive_actor_name(p_actor) end,
    nullif(trim(coalesce(p_note, '')), ''),
    jsonb_build_object('stage', 'prepare', 'activity', 'preparing', 'done_bytes', 0, 'total_bytes', 0, 'updated_at', now())
  )
  returning backup_id into new_id;
  return new_id;
end;
$$;

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
        plain_sha256 = p_plain_sha256, contents = coalesce(p_contents, '{}'::jsonb),
        job = '{}'::jsonb,
        progress = coalesce(progress, '{}'::jsonb) || jsonb_build_object(
          'stage', 'done', 'activity', 'done', 'done_bytes', progress->'total_bytes', 'updated_at', now())
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

-- Now reports whether it failed the backup, so the caller only removes the
-- stored files of a run it really ended (never those of a completed backup).
drop function public.backup_fail(uuid, text);
create function public.backup_fail(p_backup_id uuid, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  backup public.system_backups;
begin
  update public.system_backups
    set status = 'failed', completed_at = now(), job = '{}'::jsonb,
        error = left(coalesce(p_error, 'The backup failed.'), 500)
    where backup_id = p_backup_id and status = 'running'
    returning * into backup;
  if backup.backup_id is null then
    return false;
  end if;
  perform private.archive_log(null, 'system', 'backup', 'Backup', 'backup_failed', backup.created_by,
    left(coalesce(p_error, ''), 500), jsonb_build_object('backup_id', p_backup_id, 'kind', backup.kind));
  return true;
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
  perform private.backup_expire_stalled();

  select * into backup from public.system_backups where backup_id = p_backup_id for update;
  if backup.backup_id is null or backup.status <> 'completed' or backup.verified_at is null then
    raise exception 'Only a completed, verified backup can be restored.' using errcode = '55000';
  end if;
  if exists (select 1 from public.system_backups where status = 'running' or restore_status = 'running') then
    raise exception 'A backup or restore is already running. Please wait for it to finish.' using errcode = '55006';
  end if;

  update public.system_backups
    set restore_status = 'running', restore_started_at = now(), restore_completed_at = null,
        restored_by_name = private.archive_actor_name(p_actor), restore_summary = null, job = '{}'::jsonb,
        restore_progress = jsonb_build_object('stage', 'verify', 'activity', 'verifying', 'done_bytes', 0,
          'total_bytes', 2 * coalesce(backup.plain_bytes, 0), 'updated_at', now())
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
        restore_completed_at = now(), restore_summary = p_summary, job = '{}'::jsonb
    where backup_id = p_backup_id and restore_status = 'running';
  if not found then
    return;
  end if;
  perform private.archive_log(null, 'system', 'backup', 'Backup', 'backup_restored', p_actor,
    case when p_ok then null else left(coalesce(p_summary->>'error', 'The restore failed.'), 500) end,
    jsonb_build_object('backup_id', p_backup_id, 'ok', p_ok, 'summary', p_summary));
end;
$$;

revoke all on function
  public.backup_step_save(uuid, text, integer, jsonb, jsonb),
  public.backup_fail(uuid, text),
  public.backup_expire_stalled()
from public, anon, authenticated;
revoke all on function private.backup_expire_stalled() from public, anon, authenticated;
grant execute on function
  public.backup_step_save(uuid, text, integer, jsonb, jsonb),
  public.backup_fail(uuid, text)
to service_role;
grant execute on function public.backup_expire_stalled() to authenticated, service_role;
