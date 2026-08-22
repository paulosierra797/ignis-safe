alter table public.visitor_conversations
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.admin(admin_id) on delete set null,
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_requested_by uuid references public.admin(admin_id) on delete set null,
  add column if not exists delete_after timestamptz;

alter table public.visitor_conversations
  drop constraint if exists visitor_conversations_deletion_requires_archive;

alter table public.visitor_conversations
  add constraint visitor_conversations_deletion_requires_archive check (
    delete_after is null
    or (is_archived = true and deletion_requested_at is not null)
  );

create index if not exists visitor_conversations_archive_message_idx
  on public.visitor_conversations (is_archived, last_message_at desc);

create index if not exists visitor_conversations_delete_after_idx
  on public.visitor_conversations (delete_after)
  where delete_after is not null;

create or replace function public.consume_visitor_chat_rate_limits(
  p_key_hashes text[],
  p_action text,
  p_window_seconds integer[],
  p_limits integer[]
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item_count integer;
  item_index integer;
  recent_count bigint;
begin
  item_count := cardinality(p_key_hashes);
  if item_count is null
    or item_count = 0
    or item_count <> cardinality(p_window_seconds)
    or item_count <> cardinality(p_limits)
    or p_action not in ('start', 'restore', 'message') then
    return false;
  end if;

  for item_index in 1..item_count loop
    if p_key_hashes[item_index] is null
      or p_window_seconds[item_index] not between 1 and 172800
      or p_limits[item_index] not between 1 and 100 then
      return false;
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(p_action || ':' || p_key_hashes[item_index], 0)
    );
  end loop;

  for item_index in 1..item_count loop
    select count(*)
      into recent_count
      from public.visitor_chat_rate_events
      where key_hash = p_key_hashes[item_index]
        and action = p_action
        and occurred_at >= now() - make_interval(secs => p_window_seconds[item_index]);

    if recent_count >= p_limits[item_index] then
      return false;
    end if;
  end loop;

  for item_index in 1..item_count loop
    insert into public.visitor_chat_rate_events (key_hash, action)
    values (p_key_hashes[item_index], p_action);
  end loop;

  return true;
end;
$$;

revoke all on function public.consume_visitor_chat_rate_limits(text[], text, integer[], integer[])
  from public, anon, authenticated;
grant execute on function public.consume_visitor_chat_rate_limits(text[], text, integer[], integer[])
  to service_role;

create or replace function public.purge_deleted_visitor_conversations()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.visitor_chat_rate_events
  where occurred_at < now() - interval '2 days';

  with deleted as (
    delete from public.visitor_conversations
    where delete_after is not null
      and delete_after <= now()
    returning id
  )
  select count(*) into deleted_count from deleted;

  return deleted_count;
end;
$$;

revoke all on function public.purge_deleted_visitor_conversations()
  from public, anon, authenticated;
grant execute on function public.purge_deleted_visitor_conversations()
  to service_role;

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
    from cron.job
    where jobname = 'purge-deleted-visitor-conversations'
    limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'purge-deleted-visitor-conversations',
    '15 3 * * *',
    'select public.purge_deleted_visitor_conversations();'
  );
end;
$$;

comment on column public.visitor_conversations.delete_after is
  'Permanent deletion deadline, set to 30 days after an administrator requests deletion.';
