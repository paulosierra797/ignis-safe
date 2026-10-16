-- Global Archive & Trash lifecycle for IGNIS SAFE.
--
-- One registry (archive_items) tracks every archived or soft-deleted record
-- across modules, and one append-only trail (archive_events) records every
-- archive, restore, block, and deletion. Modules keep their existing flags
-- (is_archived, reports.status = 'archived', attendance_archives) so normal
-- queries stay unchanged; per-table triggers mirror those flags into the
-- registry, so every archive path (RPC, edge function, legacy client code)
-- is captured the same way.
--
-- Permanent deletion is never implicit. A record is purged only when:
--   * its 30-day recovery window has ended (or a Super Admin purges it early),
--   * its module's purge is approved (or an Admin explicitly deleted a
--     non-protected record),
--   * the approved retention period for protected records has elapsed,
--   * a Super Admin confirmed a backup taken after the record was archived,
--   * no protected dependent history (attendance, leave, reports,
--     assessments) would be lost, and
--   * every associated Storage file has been verified as removed.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Retention policies
-- ---------------------------------------------------------------------------

create table public.archive_policies (
  module text primary key,
  label text not null,
  description text not null default '',
  is_archivable boolean not null default true,
  is_protected boolean not null default false,
  recovery_days integer not null default 30 check (recovery_days between 1 and 365),
  retention_days integer check (retention_days is null or retention_days between 1 and 36500),
  purge_enabled boolean not null default false,
  inactivity_days integer check (inactivity_days is null or inactivity_days between 7 and 3650),
  inactivity_tracking_since timestamptz,
  backup_confirmed_at timestamptz,
  backup_confirmed_by uuid references public.admin(admin_id) on delete set null,
  updated_by uuid references public.admin(admin_id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.archive_policies is
  'Per-module recovery, retention, and permanent-deletion approval used by the global Archive & Trash lifecycle.';
comment on column public.archive_policies.backup_confirmed_at is
  'Latest Super Admin confirmation that a database/storage backup exists. Only items archived before this time can be purged.';
comment on column public.archive_policies.inactivity_tracking_since is
  'Inactivity is measured from this date at the earliest, so accounts are never removed for inactivity that predates the policy.';

insert into public.archive_policies
  (module, label, description, is_archivable, is_protected, purge_enabled, inactivity_days, inactivity_tracking_since)
values
  ('announcements', 'Announcements', 'Announcements and their attachments.', true, false, false, null, null),
  ('reports', 'Administrative Reports', 'After Fire, Spot, and Final Investigation reports. Legally required BFP records.', true, true, false, null, null),
  ('attendance', 'Attendance Records', 'Personnel attendance logs and verification photos. Legally required records.', true, true, false, null, null),
  ('leave_requests', 'Leave Requests', 'Personnel leave requests and supporting documents.', true, true, false, null, null),
  ('profile_change_requests', 'Profile Change Requests', 'Personnel profile change requests.', true, false, false, null, null),
  ('visitor_conversations', 'Visitor Messages', 'Website visitor conversations. Admin deletion requests count as approval.', true, false, false, null, null),
  ('mobile_users', 'Mobile User Accounts', 'Mobile learner accounts. Inactive accounts move to Trash automatically.', true, false, true, 30, now()),
  ('personnel_accounts', 'Back-office Accounts', 'Personnel accounts. Never removed for inactivity.', true, true, false, null, null),
  ('assessment_history', 'Assessment History', 'Learner assessment attempts and scores. Blocks account purges until retention is satisfied.', false, true, false, null, null),
  ('shift_assignments', 'Shift Assignments', 'Shift schedule assignments. Removals are recorded in deletion history.', false, false, false, null, null);

-- ---------------------------------------------------------------------------
-- Registry and audit trail
-- ---------------------------------------------------------------------------

create table public.archive_items (
  item_id uuid primary key default gen_random_uuid(),
  module text not null references public.archive_policies(module),
  record_id text not null,
  record_label text not null,
  record_context text,
  record_created_at timestamptz,
  disposition text not null check (disposition in ('archived', 'soft_deleted')),
  reason text,
  actor_type text not null check (actor_type in ('admin', 'user', 'system')),
  archived_by uuid references public.admin(admin_id) on delete set null,
  archived_by_name text,
  archived_at timestamptz not null default now(),
  purge_after timestamptz not null,
  status text not null default 'active' check (status in ('active', 'restored', 'purged')),
  prior_state jsonb not null default '{}'::jsonb,
  storage_objects jsonb not null default '[]'::jsonb,
  purge_state text check (purge_state in ('blocked', 'awaiting_files', 'purging')),
  purge_block_reason text,
  purge_started_at timestamptz,
  last_evaluated_at timestamptz,
  restored_at timestamptz,
  restored_by uuid references public.admin(admin_id) on delete set null,
  restored_by_name text,
  purged_at timestamptz,
  purged_by uuid references public.admin(admin_id) on delete set null,
  purged_by_name text,
  purge_reason text,
  updated_at timestamptz not null default now()
);

comment on table public.archive_items is
  'Global Archive & Trash registry. One active row per archived or soft-deleted record; closed rows keep the history after restore or purge.';

create unique index archive_items_one_active_idx
  on public.archive_items (module, record_id) where status = 'active';
create index archive_items_status_purge_idx on public.archive_items (status, purge_after);
create index archive_items_archived_at_idx on public.archive_items (archived_at desc);
create index archive_items_archived_by_idx on public.archive_items (archived_by);
create index archive_items_restored_by_idx on public.archive_items (restored_by);
create index archive_items_purged_by_idx on public.archive_items (purged_by);
create index archive_policies_backup_by_idx on public.archive_policies (backup_confirmed_by);
create index archive_policies_updated_by_idx on public.archive_policies (updated_by);

-- No foreign key to archive_items or the source tables: the trail must outlive
-- both, so deleted records keep their deletion metadata.
create table public.archive_events (
  event_id bigint generated always as identity primary key,
  item_id uuid,
  module text not null,
  record_id text not null,
  record_label text,
  event_type text not null check (event_type in (
    'archived', 'soft_deleted', 'restored', 'purged', 'deleted',
    'purge_blocked', 'purge_failed', 'policy_updated', 'backup_confirmed'
  )),
  actor_type text not null check (actor_type in ('admin', 'user', 'system')),
  actor_id uuid,
  actor_name text,
  reason text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

comment on table public.archive_events is
  'Append-only archive, restore, and deletion audit trail. Retained indefinitely, including after the original record is permanently deleted.';

create index archive_events_occurred_idx on public.archive_events (occurred_at desc);
create index archive_events_item_idx on public.archive_events (item_id);
create index archive_events_module_idx on public.archive_events (module, occurred_at desc);

create table public.storage_usage_snapshots (
  snapshot_date date primary key,
  database_bytes bigint not null,
  storage_bytes bigint not null,
  storage_objects integer not null,
  buckets jsonb not null default '[]'::jsonb,
  active_archive_items integer not null default 0,
  captured_at timestamptz not null default now()
);

comment on table public.storage_usage_snapshots is
  'Daily database and file storage usage, captured by the archive lifecycle job for growth trends.';

create or replace function private.archive_events_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Archive audit events are append-only.' using errcode = '42501';
end;
$$;

create trigger archive_events_no_update
  before update or delete on public.archive_events
  for each row execute function private.archive_events_immutable();
create trigger archive_events_no_truncate
  before truncate on public.archive_events
  for each statement execute function private.archive_events_immutable();

alter table public.archive_policies enable row level security;
alter table public.archive_items enable row level security;
alter table public.archive_events enable row level security;
alter table public.storage_usage_snapshots enable row level security;

revoke all on public.archive_policies, public.archive_items, public.archive_events,
  public.storage_usage_snapshots from anon, authenticated;
grant select on public.archive_policies, public.archive_items, public.archive_events,
  public.storage_usage_snapshots to authenticated;

-- All writes go through the security-definer functions below.
create policy "Admins read archive policies" on public.archive_policies
  for select to authenticated using ((select private.current_backoffice_role()) = 'admin');
create policy "Admins read archive items" on public.archive_items
  for select to authenticated using ((select private.current_backoffice_role()) = 'admin');
create policy "Admins read archive events" on public.archive_events
  for select to authenticated using ((select private.current_backoffice_role()) = 'admin');
create policy "Admins read storage snapshots" on public.storage_usage_snapshots
  for select to authenticated using ((select private.current_backoffice_role()) = 'admin');

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

-- Signed-in caller first; otherwise the actor a trusted function recorded for
-- this transaction (edge functions run as service_role without auth.uid()).
create or replace function private.archive_current_actor()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  configured text := nullif(current_setting('ignis.archive_actor', true), '');
begin
  if (select auth.uid()) is not null then
    return (select auth.uid());
  end if;
  return configured::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function private.archive_actor_name(p_admin_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select coalesce(nullif(trim(concat_ws(' ', account.rank, account.first_name, account.last_name)), ''), account.email)
      from public.admin as account
      where account.admin_id = p_admin_id
    ),
    (
      select coalesce(nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''), profile.email)
      from public.profiles as profile
      where profile.id = p_admin_id
    )
  );
$$;

-- Actor ids are stored in admin-referencing columns only when they belong to
-- a back-office account; the audit trail keeps the raw id either way.
create or replace function private.archive_admin_ref(p_actor uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select account.admin_id from public.admin as account where account.admin_id = p_actor;
$$;

create or replace function private.archive_actor_type(p_actor uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_actor is null then 'system'
    when exists (
      select 1 from public.admin as account
      where account.admin_id = p_actor and lower(trim(account.role)) = 'admin'
    ) then 'admin'
    else 'user'
  end;
$$;

create or replace function private.archive_log(
  p_item_id uuid,
  p_module text,
  p_record_id text,
  p_record_label text,
  p_event_type text,
  p_actor uuid,
  p_reason text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.archive_events
    (item_id, module, record_id, record_label, event_type, actor_type, actor_id, actor_name, reason, details)
  values (
    p_item_id, p_module, p_record_id, p_record_label, p_event_type,
    private.archive_actor_type(p_actor),
    p_actor,
    coalesce(private.archive_actor_name(p_actor), case when p_actor is null then 'System' else 'Deleted account' end),
    nullif(trim(coalesce(p_reason, '')), ''),
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

-- Storage objects that belong to a record and must be removed (and verified
-- removed) before the record itself is purged.
create or replace function private.archive_record_files(p_module text, p_record_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  files jsonb := '[]'::jsonb;
begin
  if p_module = 'announcements' then
    select coalesce(jsonb_agg(distinct jsonb_build_object('bucket', 'announcement_attachments', 'path', attachment->>'file_path')), '[]'::jsonb)
      into files
      from public.announcements as announcement
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(announcement.attachments) = 'array' then announcement.attachments else '[]'::jsonb end
      ) as attachment
      where announcement.announcement_id::text = p_record_id
        and coalesce(attachment->>'file_path', '') <> '';
  elsif p_module = 'reports' then
    select coalesce(jsonb_agg(distinct jsonb_build_object('bucket', 'report_files', 'path', paths.file_path)), '[]'::jsonb)
      into files
      from (
        select regexp_replace(split_part(report.pdf_url, '/report_files/', 2), '\?.*$', '') as file_path
          from public.reports as report
          where report.report_id::text = p_record_id
            and report.pdf_url like '%/report_files/%'
        union
        select coalesce(nullif(attachment->>'file_path', ''), attachment->>'path')
          from public.reports as report
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(report.report_payload->'attachments') = 'array'
              then report.report_payload->'attachments' else '[]'::jsonb end
          ) as attachment
          where report.report_id::text = p_record_id
      ) as paths
      where coalesce(paths.file_path, '') <> '';
  elsif p_module = 'leave_requests' then
    select coalesce(jsonb_agg(distinct jsonb_build_object('bucket', 'leave_supporting_documents', 'path', paths.file_path)), '[]'::jsonb)
      into files
      from (
        select document.document_path as file_path
          from public.leave_request_documents as document
          where document.request_id::text = p_record_id
        union
        select request.document_path
          from public.leave_requests as request
          where request.request_id::text = p_record_id
      ) as paths
      where coalesce(paths.file_path, '') <> '';
  elsif p_module = 'attendance' then
    select coalesce(jsonb_agg(jsonb_build_object('bucket', 'attendance_verifications', 'path', record.verification_photo_path)), '[]'::jsonb)
      into files
      from public.attendance_records as record
      where record.id::text = p_record_id
        and coalesce(record.verification_photo_path, '') <> '';
  elsif p_module in ('mobile_users', 'personnel_accounts') then
    -- Avatars live in a folder named after the account id.
    select coalesce(jsonb_agg(jsonb_build_object('bucket', object.bucket_id, 'path', object.name)), '[]'::jsonb)
      into files
      from storage.objects as object
      where object.bucket_id = 'profile_pic'
        and object.name like p_record_id || '/%';
  end if;

  return files;
end;
$$;

create or replace function private.archive_open(
  p_module text,
  p_record_id text,
  p_label text,
  p_context text,
  p_record_created_at timestamptz,
  p_disposition text,
  p_actor uuid,
  p_default_reason text,
  p_prior_state jsonb default '{}'::jsonb,
  p_purge_after timestamptz default null,
  p_archived_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_id uuid;
  new_id uuid;
  recovery integer;
  final_reason text;
  final_purge_after timestamptz;
begin
  select item_id into existing_id
    from public.archive_items
    where module = p_module and record_id = p_record_id and status = 'active';
  if existing_id is not null then
    return existing_id;
  end if;

  select recovery_days into recovery from public.archive_policies where module = p_module;
  final_reason := coalesce(
    nullif(trim(current_setting('ignis.archive_reason', true)), ''),
    p_default_reason
  );
  -- Every (re-)archive starts a fresh countdown from now.
  final_purge_after := coalesce(p_purge_after, now() + make_interval(days => coalesce(recovery, 30)));

  insert into public.archive_items (
    module, record_id, record_label, record_context, record_created_at, disposition,
    reason, actor_type, archived_by, archived_by_name, archived_at, purge_after, prior_state, storage_objects
  ) values (
    p_module, p_record_id, coalesce(nullif(trim(p_label), ''), 'Untitled record'), p_context,
    p_record_created_at, p_disposition, final_reason,
    private.archive_actor_type(p_actor),
    private.archive_admin_ref(p_actor),
    coalesce(private.archive_actor_name(p_actor), case when p_actor is null then 'System' else null end),
    coalesce(p_archived_at, now()),
    final_purge_after,
    coalesce(p_prior_state, '{}'::jsonb),
    private.archive_record_files(p_module, p_record_id)
  )
  returning item_id into new_id;

  perform private.archive_log(
    new_id, p_module, p_record_id, p_label, p_disposition, p_actor, final_reason,
    jsonb_build_object('purge_after', final_purge_after)
  );
  return new_id;
end;
$$;

create or replace function private.archive_close_restored(
  p_module text,
  p_record_id text,
  p_actor uuid,
  p_default_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed public.archive_items;
  note text := coalesce(nullif(trim(current_setting('ignis.restore_note', true)), ''), p_default_note);
begin
  update public.archive_items
    set status = 'restored',
        restored_at = now(),
        restored_by = private.archive_admin_ref(p_actor),
        restored_by_name = coalesce(private.archive_actor_name(p_actor), case when p_actor is null then 'System' else null end),
        purge_state = null,
        purge_block_reason = null,
        purge_started_at = null,
        updated_at = now()
    where module = p_module and record_id = p_record_id and status = 'active'
    returning * into closed;

  if closed.item_id is not null then
    perform private.archive_log(
      closed.item_id, p_module, p_record_id, closed.record_label, 'restored', p_actor, note,
      jsonb_build_object('cancelled_purge_after', closed.purge_after)
    );
  end if;
end;
$$;

-- Called from AFTER DELETE triggers so deletions through any path are audited.
create or replace function private.archive_close_purged(
  p_module text,
  p_record_id text,
  p_label text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed public.archive_items;
  actor uuid := private.archive_current_actor();
  is_lifecycle_purge boolean := coalesce(current_setting('ignis.archive_purge', true), '') = 'on';
  v_reason text := nullif(trim(current_setting('ignis.purge_reason', true)), '');
  v_details jsonb;
begin
  begin
    v_details := coalesce(nullif(current_setting('ignis.purge_details', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_details := '{}'::jsonb;
  end;

  update public.archive_items
    set status = 'purged',
        purged_at = now(),
        purged_by = private.archive_admin_ref(actor),
        purged_by_name = coalesce(private.archive_actor_name(actor), case when actor is null then 'System' else null end),
        purge_reason = coalesce(v_reason, 'Deleted outside the Archive & Trash lifecycle'),
        purge_state = null,
        purge_block_reason = null,
        updated_at = now()
    where module = p_module and record_id = p_record_id and status = 'active'
    returning * into closed;

  if closed.item_id is not null then
    perform private.archive_log(
      closed.item_id, p_module, p_record_id, closed.record_label, 'purged', actor,
      coalesce(v_reason, 'Deleted outside the Archive & Trash lifecycle'),
      v_details || jsonb_build_object('irreversible', true, 'via_lifecycle', is_lifecycle_purge)
    );
  else
    perform private.archive_log(
      null, p_module, p_record_id, p_label, 'deleted', actor,
      coalesce(v_reason, 'Record deleted directly'),
      jsonb_build_object('irreversible', true, 'via_lifecycle', is_lifecycle_purge)
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Module triggers: mirror existing archive flags into the registry
-- ---------------------------------------------------------------------------

create or replace function private.archive_track_announcements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.archive_close_purged('announcements', old.announcement_id::text, old.title);
    return old;
  end if;

  if new.is_archived and (tg_op = 'INSERT' or not old.is_archived) then
    perform private.archive_open(
      'announcements', new.announcement_id::text, new.title,
      initcap(replace(coalesce(new.audience_type, 'public'), '_', ' ')) || ' announcement',
      new.created_at, 'archived', coalesce(new.archived_by, private.archive_current_actor()),
      'Archived from Announcements'
    );
  elsif tg_op = 'UPDATE' and old.is_archived and not new.is_archived then
    perform private.archive_close_restored('announcements', new.announcement_id::text, private.archive_current_actor());
  end if;
  return new;
end;
$$;

create trigger archive_track_announcements
  after insert or update of is_archived or delete on public.announcements
  for each row execute function private.archive_track_announcements();

create or replace function private.archive_track_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  type_label text;
begin
  if tg_op = 'DELETE' then
    perform private.archive_close_purged('reports', old.report_id::text, concat_ws(' · ', old.report_no, old.title));
    return old;
  end if;

  if new.status = 'archived' and (tg_op = 'INSERT' or old.status is distinct from 'archived') then
    type_label := case new.report_type
      when 'fireOperations' then 'After Fire Operations Report'
      when 'spotInvestigation' then 'Spot Investigation Report'
      when 'finalInvestigation' then 'Final Investigation Report'
      else 'Report'
    end;
    perform private.archive_open(
      'reports', new.report_id::text, concat_ws(' · ', new.report_no, new.title),
      concat_ws(' · ', type_label, nullif(new.created_by_name, '')),
      new.created_at, 'archived', private.archive_current_actor(),
      'Archived from Reports',
      -- Restoring returns the report to the status it had before archiving.
      jsonb_build_object('status', case when tg_op = 'UPDATE' then old.status else 'submitted' end)
    );
  elsif tg_op = 'UPDATE' and old.status = 'archived' and new.status <> 'archived' then
    perform private.archive_close_restored('reports', new.report_id::text, private.archive_current_actor());
  end if;
  return new;
end;
$$;

create trigger archive_track_reports
  after insert or update of status or delete on public.reports
  for each row execute function private.archive_track_reports();

create or replace function private.archive_leave_label(p_leave public.leave_requests)
returns text
language sql
stable
set search_path = ''
as $$
  select concat_ws(' · ',
    coalesce(nullif(p_leave.other_leave_type, ''), nullif(p_leave.leave_type, ''), 'Leave request'),
    p_leave.start_date::text || ' to ' || p_leave.end_date::text);
$$;

create or replace function private.archive_track_leave_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.archive_close_purged('leave_requests', old.request_id::text, private.archive_leave_label(old));
    return old;
  end if;

  if new.is_archived and (tg_op = 'INSERT' or not old.is_archived) then
    perform private.archive_open(
      'leave_requests', new.request_id::text, private.archive_leave_label(new),
      coalesce(private.archive_actor_name(new.personnel_id), 'Personnel') || ' · ' || initcap(coalesce(new.status, '')),
      new.created_at, 'archived', coalesce(new.archived_by, private.archive_current_actor()),
      'Archived from Leave Requests'
    );
  elsif tg_op = 'UPDATE' and old.is_archived and not new.is_archived then
    perform private.archive_close_restored('leave_requests', new.request_id::text, private.archive_current_actor());
  end if;
  return new;
end;
$$;

create trigger archive_track_leave_requests
  after insert or update of is_archived or delete on public.leave_requests
  for each row execute function private.archive_track_leave_requests();

create or replace function private.archive_track_profile_change_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.archive_close_purged('profile_change_requests', old.request_id::text,
      'Profile change · ' || coalesce(private.archive_actor_name(old.personnel_id), 'Personnel'));
    return old;
  end if;

  if new.is_archived and (tg_op = 'INSERT' or not old.is_archived) then
    perform private.archive_open(
      'profile_change_requests', new.request_id::text,
      'Profile change · ' || coalesce(private.archive_actor_name(new.personnel_id), 'Personnel'),
      initcap(coalesce(new.status, '')),
      new.requested_at, 'archived', coalesce(new.archived_by, private.archive_current_actor()),
      'Archived from Profile Change Requests'
    );
  elsif tg_op = 'UPDATE' and old.is_archived and not new.is_archived then
    perform private.archive_close_restored('profile_change_requests', new.request_id::text, private.archive_current_actor());
  end if;
  return new;
end;
$$;

create trigger archive_track_profile_change_requests
  after insert or update of is_archived or delete on public.profile_change_requests
  for each row execute function private.archive_track_profile_change_requests();

create or replace function private.archive_track_visitor_conversations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  label text;
  actor uuid;
begin
  if tg_op = 'DELETE' then
    perform private.archive_close_purged('visitor_conversations', old.id::text,
      coalesce(nullif(old.visitor_name, ''), old.visitor_label, 'Visitor conversation'));
    return old;
  end if;

  label := coalesce(nullif(new.visitor_name, ''), new.visitor_label, 'Visitor conversation');

  if new.is_archived and (tg_op = 'INSERT' or not old.is_archived) then
    actor := coalesce(new.deletion_requested_by, new.archived_by, private.archive_current_actor());
    perform private.archive_open(
      'visitor_conversations', new.id::text, label, initcap(coalesce(new.status, 'open')) || ' conversation',
      new.created_at,
      case when new.delete_after is not null then 'soft_deleted' else 'archived' end,
      actor,
      case
        when new.delete_after is not null then 'Admin requested deletion'
        when new.status = 'resolved' then 'Resolved conversations are archived automatically'
        else 'Archived from Visitor Messages'
      end,
      '{}'::jsonb, new.delete_after
    );
  elsif tg_op = 'UPDATE' and old.is_archived and not new.is_archived then
    actor := private.archive_current_actor();
    perform private.archive_close_restored(
      'visitor_conversations', new.id::text, actor,
      case when actor is null and new.last_message_at is distinct from old.last_message_at
        then 'Reopened by visitor activity' end
    );
  elsif tg_op = 'UPDATE' and new.is_archived and old.delete_after is null and new.delete_after is not null then
    -- An archived conversation escalated to an explicit deletion request.
    actor := coalesce(new.deletion_requested_by, private.archive_current_actor());
    update public.archive_items
      set disposition = 'soft_deleted',
          purge_after = new.delete_after,
          actor_type = case when actor is null then actor_type else 'admin' end,
          reason = 'Admin requested deletion',
          purge_state = null,
          purge_block_reason = null,
          updated_at = now()
      where module = 'visitor_conversations' and record_id = new.id::text and status = 'active';
    perform private.archive_log(
      (select item_id from public.archive_items where module = 'visitor_conversations' and record_id = new.id::text and status = 'active'),
      'visitor_conversations', new.id::text, label, 'soft_deleted', actor, 'Admin requested deletion',
      jsonb_build_object('purge_after', new.delete_after)
    );
  end if;
  return new;
end;
$$;

create trigger archive_track_visitor_conversations
  after insert or update of is_archived, delete_after or delete on public.visitor_conversations
  for each row execute function private.archive_track_visitor_conversations();

create or replace function private.archive_track_attendance_archives()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  record_row public.attendance_records;
begin
  if tg_op = 'INSERT' then
    select * into record_row from public.attendance_records where id = new.attendance_id;
    perform private.archive_open(
      'attendance', new.attendance_id::text,
      coalesce(nullif(record_row.name, ''), 'Personnel') || ' · ' || coalesce(record_row.attendance_date::text, ''),
      concat_ws(' · ', nullif(record_row.rank, ''), nullif(record_row.station_name, ''), 'Shift ' || nullif(record_row.shift_id, '')),
      record_row.created_at, 'archived', coalesce(new.archived_by, private.archive_current_actor()),
      'Archived from Attendance', '{}'::jsonb, null, new.archived_at
    );
    return new;
  end if;

  -- A cascade from deleting the attendance record itself is a purge, which the
  -- attendance_records trigger records; only a standalone delete is a restore.
  if exists (select 1 from public.attendance_records where id = old.attendance_id) then
    perform private.archive_close_restored('attendance', old.attendance_id::text, private.archive_current_actor());
  end if;
  return old;
end;
$$;

create trigger archive_track_attendance_archives
  after insert or delete on public.attendance_archives
  for each row execute function private.archive_track_attendance_archives();

create or replace function private.archive_track_attendance_deletes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.archive_close_purged('attendance', old.id::text,
    coalesce(nullif(old.name, ''), 'Personnel') || ' · ' || coalesce(old.attendance_date::text, ''));
  return old;
end;
$$;

create trigger archive_track_attendance_deletes
  after delete on public.attendance_records
  for each row execute function private.archive_track_attendance_deletes();

create or replace function private.archive_track_account_deletes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'profiles' then
    perform private.archive_close_purged('mobile_users', old.id::text,
      coalesce(nullif(trim(concat_ws(' ', old.first_name, old.last_name)), ''), old.email, 'Mobile user'));
  else
    perform private.archive_close_purged('personnel_accounts', old.admin_id::text,
      coalesce(nullif(trim(concat_ws(' ', old.rank, old.first_name, old.last_name)), ''), old.email, 'Account'));
  end if;
  return old;
end;
$$;

create trigger archive_track_profile_deletes
  after delete on public.profiles
  for each row execute function private.archive_track_account_deletes();
create trigger archive_track_admin_deletes
  after delete on public.admin
  for each row execute function private.archive_track_account_deletes();

create or replace function private.archive_track_shift_deletes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.archive_close_purged('shift_assignments', old.assignment_id::text,
    'Shift ' || old.shift_type || ' · ' || coalesce(private.archive_actor_name(old.personnel_id), 'Personnel')
      || ' · ' || old.start_date::text || coalesce(' to ' || old.end_date::text, ''));
  return old;
end;
$$;

create trigger archive_track_shift_deletes
  after delete on public.personnel_shift_assignments
  for each row execute function private.archive_track_shift_deletes();

-- ---------------------------------------------------------------------------
-- Delete guards: protected records are only removed by the lifecycle purge
-- ---------------------------------------------------------------------------

create or replace function private.guard_protected_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('ignis.archive_purge', true), '') = 'on' then
    return old;
  end if;

  -- Personnel may still withdraw their own pending leave request. (Nested so
  -- leave-only columns are never read for other tables.)
  if tg_table_name = 'leave_requests' then
    if old.status = 'pending' and not old.is_archived then
      return old;
    end if;
  end if;

  raise exception 'This record can only be permanently deleted through Archive & Trash after its recovery, retention, and backup checks.'
    using errcode = '42501';
end;
$$;

create trigger guard_reports_delete before delete on public.reports
  for each row execute function private.guard_protected_delete();
create trigger guard_announcements_delete before delete on public.announcements
  for each row execute function private.guard_protected_delete();
create trigger guard_attendance_delete before delete on public.attendance_records
  for each row execute function private.guard_protected_delete();
create trigger guard_leave_requests_delete before delete on public.leave_requests
  for each row execute function private.guard_protected_delete();

-- ---------------------------------------------------------------------------
-- Trashed back-office accounts
-- ---------------------------------------------------------------------------

alter table public.admin drop constraint admin_status_check;
alter table public.admin add constraint admin_status_check check (
  (status)::text = any ((array[
    'Active', 'Inactive', 'Suspended', 'On Leave', 'Pending Activation', 'Expired', 'Archived'
  ])::text[])
);

create or replace function public.revoke_trusted_devices_on_suspend()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and lower(btrim(coalesce(new.status, ''))) in ('suspended', 'inactive', 'expired', 'archived') then
    update public.trusted_devices
    set trusted = false,
        revoked_at = now()
    where user_id = new.admin_id
      and trusted = true;
  end if;
  return new;
end;
$$;

-- Mobile accounts in Trash (profiles.is_active = false) lose write access to
-- their learning data immediately, not only at their next sign-in.
create or replace function private.mobile_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      not exists (
        select 1 from public.admin a where a.admin_id = (select auth.uid())
      )
      or exists (
        select 1 from public.admin a
        where a.admin_id = (select auth.uid())
          and lower(trim(coalesce(a.status, ''))) = 'active'
      )
    )
    and not exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_active = false
    );
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs: archive and restore (any active Admin)
-- ---------------------------------------------------------------------------

create or replace function private.require_archive_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.current_backoffice_role() is distinct from 'admin' then
    raise exception 'Only active administrators can manage archived records.' using errcode = '42501';
  end if;
  return (select auth.uid());
end;
$$;

create or replace function public.archive_record(p_module text, p_record_id text, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_archive_admin();
  record_uuid uuid;
  affected integer := 0;
  profile_row public.profiles;
  account_row public.admin;
  result_id uuid;
begin
  begin
    record_uuid := p_record_id::uuid;
  exception when invalid_text_representation then
    raise exception 'Invalid record id.' using errcode = '22023';
  end;

  if length(coalesce(p_reason, '')) > 500 then
    raise exception 'The reason must be 500 characters or fewer.' using errcode = '22023';
  end if;
  perform set_config('ignis.archive_reason', coalesce(trim(p_reason), ''), true);

  if p_module = 'announcements' then
    update public.announcements
      set is_archived = true, archived_at = now(), archived_by = actor
      where announcement_id = record_uuid and not is_archived;
    get diagnostics affected = row_count;
  elsif p_module = 'reports' then
    update public.reports
      set status = 'archived', reviewed_at = now()
      where report_id = record_uuid and status <> 'archived';
    get diagnostics affected = row_count;
  elsif p_module = 'attendance' then
    if exists (select 1 from public.attendance_records where id = record_uuid) then
      insert into public.attendance_archives (attendance_id, archived_by)
        values (record_uuid, actor)
        on conflict (attendance_id) do nothing;
      get diagnostics affected = row_count;
    end if;
  elsif p_module = 'leave_requests' then
    update public.leave_requests
      set is_archived = true, archived_at = now(), archived_by = actor
      where request_id = record_uuid and status <> 'pending' and not is_archived;
    get diagnostics affected = row_count;
  elsif p_module = 'profile_change_requests' then
    update public.profile_change_requests
      set is_archived = true, archived_at = now(), archived_by = actor
      where request_id = record_uuid and status <> 'pending' and not is_archived;
    get diagnostics affected = row_count;
  elsif p_module = 'mobile_users' then
    select * into profile_row from public.profiles where id = record_uuid;
    if profile_row.id is null or exists (select 1 from public.admin where admin_id = record_uuid) then
      raise exception 'Only mobile user accounts can be moved to Trash here.' using errcode = '42501';
    end if;
    update public.profiles set is_active = false where id = record_uuid and is_active;
    get diagnostics affected = row_count;
    if affected > 0 then
      perform private.archive_open(
        'mobile_users', p_record_id,
        coalesce(nullif(trim(concat_ws(' ', profile_row.first_name, profile_row.last_name)), ''), profile_row.email, 'Mobile user'),
        profile_row.email, profile_row.created_at, 'soft_deleted', actor,
        'Moved to Trash by an administrator', jsonb_build_object('is_active', true)
      );
    end if;
  elsif p_module = 'personnel_accounts' then
    select * into account_row from public.admin where admin_id = record_uuid;
    if account_row.admin_id is null
      or lower(trim(account_row.role)) = 'admin'
      or account_row.is_super_admin
      or account_row.admin_id = actor then
      raise exception 'Administrator and Super Admin accounts cannot be moved to Trash.' using errcode = '42501';
    end if;
    update public.admin set status = 'Archived', updated_at = now()
      where admin_id = record_uuid and status is distinct from 'Archived';
    get diagnostics affected = row_count;
    if affected > 0 then
      perform private.archive_open(
        'personnel_accounts', p_record_id,
        coalesce(nullif(trim(concat_ws(' ', account_row.rank, account_row.first_name, account_row.last_name)), ''), account_row.email),
        concat_ws(' · ', initcap(account_row.role), account_row.email), account_row.created_at, 'soft_deleted', actor,
        'Moved to Trash by an administrator', jsonb_build_object('status', coalesce(account_row.status, 'Active'))
      );
    end if;
  else
    raise exception 'Archiving is not supported for this module.' using errcode = '22023';
  end if;

  if affected = 0 then
    raise exception 'The record was not found, is already archived, or is not eligible for archiving.' using errcode = 'P0002';
  end if;

  perform set_config('ignis.archive_reason', '', true);

  select item_id into result_id from public.archive_items
    where module = p_module and record_id = p_record_id and status = 'active';
  return result_id;
end;
$$;

create or replace function public.restore_archive_item(p_item_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_archive_admin();
  target public.archive_items;
  record_uuid uuid;
  affected integer := 0;
begin
  select * into target from public.archive_items where item_id = p_item_id for update;
  if target.item_id is null or target.status <> 'active' then
    raise exception 'This item is no longer in Archive & Trash.' using errcode = 'P0002';
  end if;
  if target.purge_state = 'purging' and target.purge_started_at > now() - interval '15 minutes' then
    raise exception 'Permanent deletion is already in progress for this item.' using errcode = '55006';
  end if;

  record_uuid := target.record_id::uuid;
  perform set_config('ignis.restore_note', coalesce(trim(p_note), ''), true);

  if target.module = 'announcements' then
    update public.announcements set is_archived = false, archived_at = null, archived_by = null
      where announcement_id = record_uuid;
  elsif target.module = 'reports' then
    update public.reports
      set status = coalesce(nullif(target.prior_state->>'status', 'archived'), 'submitted')
      where report_id = record_uuid;
  elsif target.module = 'attendance' then
    delete from public.attendance_archives where attendance_id = record_uuid;
  elsif target.module = 'leave_requests' then
    update public.leave_requests set is_archived = false, archived_at = null, archived_by = null
      where request_id = record_uuid;
  elsif target.module = 'profile_change_requests' then
    update public.profile_change_requests set is_archived = false, archived_at = null, archived_by = null
      where request_id = record_uuid;
  elsif target.module = 'visitor_conversations' then
    update public.visitor_conversations
      set is_archived = false, archived_at = null, archived_by = null,
          deletion_requested_at = null, deletion_requested_by = null, delete_after = null,
          admin_last_read_at = now(), updated_at = now()
      where id = record_uuid;
  elsif target.module = 'mobile_users' then
    update public.profiles set is_active = coalesce((target.prior_state->>'is_active')::boolean, true)
      where id = record_uuid;
  elsif target.module = 'personnel_accounts' then
    update public.admin
      set status = coalesce(nullif(target.prior_state->>'status', 'Archived'), 'Active'), updated_at = now()
      where admin_id = record_uuid;
  end if;
  get diagnostics affected = row_count;

  if affected = 0 then
    raise exception 'The original record could not be found.' using errcode = 'P0002';
  end if;

  -- Module triggers close the entry; accounts (and any missed path) close here.
  perform private.archive_close_restored(target.module, target.record_id, actor);
  perform set_config('ignis.restore_note', '', true);
end;
$$;

-- Used by the admin-visitor-chat edge function (service role) so restores
-- from Visitor Messages are attributed to the acting administrator.
create or replace function public.admin_unarchive_visitor_conversation(
  p_conversation_id uuid,
  p_admin_id uuid,
  p_reopen boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('ignis.archive_actor', coalesce(p_admin_id::text, ''), true);

  update public.visitor_conversations
    set is_archived = false,
        archived_at = null,
        archived_by = null,
        deletion_requested_at = null,
        deletion_requested_by = null,
        delete_after = null,
        status = case when p_reopen then 'open' else status end,
        resolved_at = case when p_reopen then null else resolved_at end,
        resolved_by = case when p_reopen then null else resolved_by end,
        admin_last_read_at = now(),
        updated_at = now()
    where id = p_conversation_id;

  if not found then
    raise exception 'Conversation not found.' using errcode = 'P0002';
  end if;

  perform set_config('ignis.archive_actor', '', true);
end;
$$;

revoke all on function public.admin_unarchive_visitor_conversation(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_unarchive_visitor_conversation(uuid, uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Permanent deletion
-- ---------------------------------------------------------------------------

-- Returns null when the item may be purged, otherwise the reason it may not.
create or replace function private.archive_purge_blocker(p_item public.archive_items, p_manual boolean)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  module_policy public.archive_policies;
  history_policy public.archive_policies;
  record_uuid uuid := p_item.record_id::uuid;
  retention_until timestamptz;
begin
  if p_item.status <> 'active' then
    return 'This item is no longer in Archive & Trash.';
  end if;
  select * into module_policy from public.archive_policies where module = p_item.module;

  if not p_manual and p_item.purge_after > now() then
    return 'The recovery period has not ended.';
  end if;

  -- An Admin's explicit deletion of a non-protected record is itself the
  -- approval; everything else needs the module's purge approval.
  if not module_policy.purge_enabled
    and not (not module_policy.is_protected and p_item.disposition = 'soft_deleted' and p_item.actor_type = 'admin') then
    return 'Permanent deletion has not been approved for ' || module_policy.label || '.';
  end if;

  if module_policy.is_protected and module_policy.retention_days is null then
    return 'The retention period for ' || module_policy.label || ' has not been approved.';
  end if;
  if module_policy.retention_days is not null then
    retention_until := coalesce(p_item.record_created_at, p_item.archived_at) + make_interval(days => module_policy.retention_days);
    if retention_until > now() then
      return 'Retention requirement runs until ' || to_char(retention_until at time zone 'Asia/Manila', 'Mon DD, YYYY') || '.';
    end if;
  end if;

  if module_policy.backup_confirmed_at is null or module_policy.backup_confirmed_at < p_item.archived_at then
    return 'No backup has been confirmed since this item was archived.';
  end if;

  if p_item.module = 'mobile_users' and (
    exists (select 1 from public.assessment_attempts where user_id = record_uuid)
    or exists (select 1 from public.module_progress where user_id = record_uuid)
  ) then
    select * into history_policy from public.archive_policies where module = 'assessment_history';
    if not history_policy.purge_enabled
      or history_policy.retention_days is null
      or exists (
        select 1 from public.assessment_attempts
        where user_id = record_uuid
          and created_at + make_interval(days => history_policy.retention_days) > now()
      )
      or exists (
        select 1 from public.module_progress
        where user_id = record_uuid
          and coalesce(updated_at, created_at) + make_interval(days => history_policy.retention_days) > now()
      ) then
      return 'Assessment history for this account must still be retained.';
    end if;
  end if;

  if p_item.module = 'personnel_accounts' and (
    exists (select 1 from public.attendance_records where personnel_user_id = record_uuid)
    or exists (select 1 from public.leave_requests where personnel_id = record_uuid)
    or exists (select 1 from public.reports where created_by = record_uuid)
  ) then
    return 'Linked attendance, leave, or report records must be retained.';
  end if;

  return null;
end;
$$;

create or replace function private.archive_files_remaining(p_files jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(file), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) as file
  where exists (
    select 1 from storage.objects as object
    where object.bucket_id = file->>'bucket' and object.name = file->>'path'
  );
$$;

-- Deletes the database record. Callers must have removed Storage files first.
create or replace function private.archive_purge_execute(p_item public.archive_items, p_actor uuid, p_reason text, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  record_uuid uuid := p_item.record_id::uuid;
begin
  perform set_config('ignis.archive_purge', 'on', true);
  perform set_config('ignis.archive_actor', coalesce(p_actor::text, ''), true);
  perform set_config('ignis.purge_reason', coalesce(p_reason, ''), true);
  perform set_config('ignis.purge_details', coalesce(p_details, '{}'::jsonb)::text, true);

  if p_item.module = 'announcements' then
    delete from public.announcements where announcement_id = record_uuid;
  elsif p_item.module = 'reports' then
    delete from public.reports where report_id = record_uuid;
  elsif p_item.module = 'attendance' then
    delete from public.attendance_records where id = record_uuid;
  elsif p_item.module = 'leave_requests' then
    delete from public.leave_requests where request_id = record_uuid;
  elsif p_item.module = 'profile_change_requests' then
    delete from public.profile_change_requests where request_id = record_uuid;
  elsif p_item.module = 'visitor_conversations' then
    delete from public.visitor_conversations where id = record_uuid;
  elsif p_item.module = 'mobile_users' then
    -- Removes the login; the profile and learner rows cascade.
    delete from auth.users where id = record_uuid;
    delete from public.profiles where id = record_uuid;
  elsif p_item.module = 'personnel_accounts' then
    delete from public.admin where admin_id = record_uuid;
    delete from auth.users where id = record_uuid;
  end if;

  -- The source row was already gone: close the entry explicitly.
  if exists (select 1 from public.archive_items where item_id = p_item.item_id and status = 'active') then
    update public.archive_items
      set status = 'purged', purged_at = now(), purged_by = private.archive_admin_ref(p_actor),
          purged_by_name = coalesce(private.archive_actor_name(p_actor), case when p_actor is null then 'System' else null end),
          purge_reason = p_reason, purge_state = null, purge_block_reason = null, updated_at = now()
      where item_id = p_item.item_id;
    perform private.archive_log(p_item.item_id, p_item.module, p_item.record_id, p_item.record_label,
      'purged', p_actor, p_reason,
      coalesce(p_details, '{}'::jsonb) || jsonb_build_object('irreversible', true, 'record_already_missing', true));
  end if;

  perform set_config('ignis.archive_purge', '', true);
  perform set_config('ignis.archive_actor', '', true);
  perform set_config('ignis.purge_reason', '', true);
  perform set_config('ignis.purge_details', '', true);
end;
$$;

create or replace function private.archive_require_purge_actor(p_actor uuid, p_manual boolean)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_manual and not exists (
    select 1 from public.admin
    where admin_id = p_actor and is_super_admin and lower(trim(role)) = 'admin' and lower(coalesce(status, '')) = 'active'
  ) then
    raise exception 'Only an active Super Admin can permanently delete records.' using errcode = '42501';
  end if;
end;
$$;

-- Service-role step 1: validate and lock the item, return files to remove.
create or replace function public.archive_purge_prepare(p_item_id uuid, p_actor uuid, p_manual boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.archive_items;
  blocker text;
  files jsonb;
begin
  perform private.archive_require_purge_actor(p_actor, p_manual);

  select * into target from public.archive_items where item_id = p_item_id for update;
  if target.item_id is null then
    return jsonb_build_object('ok', false, 'reason', 'Item not found.');
  end if;
  if target.purge_state = 'purging' and target.purge_started_at > now() - interval '15 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'Permanent deletion is already in progress for this item.');
  end if;

  blocker := private.archive_purge_blocker(target, p_manual);
  if blocker is not null then
    if p_manual then
      perform private.archive_log(target.item_id, target.module, target.record_id, target.record_label,
        'purge_blocked', p_actor, blocker, jsonb_build_object('manual', true));
    end if;
    return jsonb_build_object('ok', false, 'reason', blocker);
  end if;

  select coalesce(jsonb_agg(distinct file), '[]'::jsonb) into files
    from jsonb_array_elements(private.archive_record_files(target.module, target.record_id) || target.storage_objects) as file;

  update public.archive_items
    set purge_state = 'purging', purge_started_at = now(), storage_objects = files, updated_at = now()
    where item_id = target.item_id;

  return jsonb_build_object('ok', true, 'files', files, 'module', target.module, 'record_id', target.record_id);
end;
$$;

-- Service-role step 2: verify every file is gone, then delete the record.
create or replace function public.archive_purge_finalize(p_item_id uuid, p_actor uuid, p_manual boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.archive_items;
  blocker text;
  remaining jsonb;
  final_reason text;
begin
  perform private.archive_require_purge_actor(p_actor, p_manual);

  select * into target from public.archive_items where item_id = p_item_id for update;
  if target.item_id is null or target.status <> 'active' or target.purge_state is distinct from 'purging' then
    return jsonb_build_object('ok', false, 'reason', 'This item is not prepared for permanent deletion.');
  end if;

  blocker := private.archive_purge_blocker(target, p_manual);
  remaining := private.archive_files_remaining(target.storage_objects);

  if blocker is null and jsonb_array_length(remaining) > 0 then
    blocker := 'Associated files could not be verified as removed from Storage.';
  end if;

  if blocker is not null then
    update public.archive_items
      set purge_state = 'blocked', purge_block_reason = blocker, purge_started_at = null, updated_at = now()
      where item_id = target.item_id;
    perform private.archive_log(target.item_id, target.module, target.record_id, target.record_label,
      'purge_failed', p_actor, blocker, jsonb_build_object('remaining_files', remaining, 'manual', p_manual));
    return jsonb_build_object('ok', false, 'reason', blocker);
  end if;

  final_reason := coalesce(
    nullif(trim(p_reason), ''),
    case when p_manual then 'Permanently deleted by a Super Admin'
      else 'Automatic cleanup after the ' || (select recovery_days from public.archive_policies where module = target.module) || '-day recovery period' end
  );

  perform private.archive_purge_execute(
    target, p_actor, final_reason,
    jsonb_build_object('files_removed', target.storage_objects, 'manual', p_manual)
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.archive_purge_queue(p_limit integer default 25)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select item_id from public.archive_items
  where status = 'active'
    and (purge_state = 'awaiting_files'
      or (purge_state = 'purging' and purge_started_at < now() - interval '15 minutes'))
  order by purge_after
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

create or replace function public.archive_verify_maintenance_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_token, '') <> ''
    and exists (
      select 1 from vault.decrypted_secrets
      where name = 'archive_maintenance_token' and decrypted_secret = p_token
    );
$$;

revoke all on function public.archive_purge_prepare(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.archive_purge_finalize(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.archive_purge_queue(integer) from public, anon, authenticated;
revoke all on function public.archive_verify_maintenance_token(text) from public, anon, authenticated;
grant execute on function public.archive_purge_prepare(uuid, uuid, boolean) to service_role;
grant execute on function public.archive_purge_finalize(uuid, uuid, boolean, text) to service_role;
grant execute on function public.archive_purge_queue(integer) to service_role;
grant execute on function public.archive_verify_maintenance_token(text) to service_role;

-- ---------------------------------------------------------------------------
-- Policy management (Super Admin)
-- ---------------------------------------------------------------------------

create or replace function public.update_archive_policy(p_module text, p_purge_enabled boolean, p_retention_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  previous public.archive_policies;
begin
  if not private.is_super_admin() then
    raise exception 'Only a Super Admin can change retention policies.' using errcode = '42501';
  end if;

  select * into previous from public.archive_policies where module = p_module for update;
  if previous.module is null then
    raise exception 'Unknown module.' using errcode = 'P0002';
  end if;
  if p_retention_days is not null and p_retention_days not between 1 and 36500 then
    raise exception 'Retention must be between 1 and 36500 days.' using errcode = '22023';
  end if;
  if coalesce(p_purge_enabled, false) and previous.is_protected and p_retention_days is null then
    raise exception 'Set the approved retention period before enabling permanent deletion for protected records.'
      using errcode = '22023';
  end if;

  update public.archive_policies
    set purge_enabled = coalesce(p_purge_enabled, false),
        retention_days = p_retention_days,
        updated_by = actor,
        updated_at = now()
    where module = p_module;

  perform private.archive_log(null, p_module, p_module, previous.label, 'policy_updated', actor, null,
    jsonb_build_object(
      'purge_enabled', jsonb_build_object('from', previous.purge_enabled, 'to', coalesce(p_purge_enabled, false)),
      'retention_days', jsonb_build_object('from', previous.retention_days, 'to', p_retention_days)
    ));
end;
$$;

create or replace function public.confirm_archive_backup(p_note text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  confirmed timestamptz := now();
begin
  if not private.is_super_admin() then
    raise exception 'Only a Super Admin can confirm backups.' using errcode = '42501';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'The note must be 500 characters or fewer.' using errcode = '22023';
  end if;

  update public.archive_policies
    set backup_confirmed_at = confirmed, backup_confirmed_by = actor, updated_at = confirmed
    where is_archivable;

  perform private.archive_log(null, 'system', 'backup', 'Backup confirmation', 'backup_confirmed', actor,
    nullif(trim(coalesce(p_note, '')), ''), jsonb_build_object('confirmed_at', confirmed));
  return confirmed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled lifecycle
-- ---------------------------------------------------------------------------

create or replace function private.archive_soft_delete_inactive_mobile_users()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  mobile_policy public.archive_policies;
  candidate record;
  processed integer := 0;
begin
  select * into mobile_policy from public.archive_policies where module = 'mobile_users';
  if mobile_policy.inactivity_days is null then
    return 0;
  end if;

  for candidate in
    select profile.id, profile.first_name, profile.last_name, profile.email, profile.created_at, activity.last_activity
    from public.profiles as profile
    join auth.users as account on account.id = profile.id
    cross join lateral (
      -- Verified activity: sign-ins, token refreshes, learning progress,
      -- assessments, simulations, feedback, consents, and Admin restores.
      select greatest(
        account.created_at,
        account.last_sign_in_at,
        profile.updated_at,
        mobile_policy.inactivity_tracking_since,
        (select max(greatest(session.updated_at, session.refreshed_at at time zone 'UTC')) from auth.sessions as session where session.user_id = profile.id),
        (select max(greatest(progress.updated_at, progress.created_at)) from public.module_progress as progress where progress.user_id = profile.id),
        (select max(coalesce(attempt.submitted_at, attempt.started_at, attempt.created_at)) from public.assessment_attempts as attempt where attempt.user_id = profile.id),
        (select max(coalesce(simulation.submitted_at, simulation.started_at, simulation.created_at)) from public.simulation_attempts as simulation where simulation.user_id = profile.id),
        (select max(feedback.created_at) from public.user_feedback as feedback where feedback.user_id = profile.id),
        (select max(consent.created_at) from public.user_consents as consent where consent.user_id = profile.id),
        (select max(entry.restored_at) from public.archive_items as entry where entry.module = 'mobile_users' and entry.record_id = profile.id::text)
      ) as last_activity
    ) as activity
    where profile.is_active
      -- Admin, Super Admin, and Personnel accounts are never removed for inactivity.
      and not exists (select 1 from public.admin as backoffice where backoffice.admin_id = profile.id)
      and not exists (
        select 1 from public.archive_items as entry
        where entry.module = 'mobile_users' and entry.record_id = profile.id::text and entry.status = 'active'
      )
      and activity.last_activity < now() - make_interval(days => mobile_policy.inactivity_days)
  loop
    update public.profiles set is_active = false where id = candidate.id and is_active;
    if found then
      perform private.archive_open(
        'mobile_users', candidate.id::text,
        coalesce(nullif(trim(concat_ws(' ', candidate.first_name, candidate.last_name)), ''), candidate.email, 'Mobile user'),
        candidate.email, candidate.created_at, 'soft_deleted', null,
        'Automatic: no verified activity for ' || mobile_policy.inactivity_days || ' consecutive days (last activity '
          || to_char(candidate.last_activity at time zone 'Asia/Manila', 'Mon DD, YYYY') || ')',
        jsonb_build_object('is_active', true, 'last_activity_at', candidate.last_activity)
      );
      processed := processed + 1;
    end if;
  end loop;

  return processed;
end;
$$;

create or replace function private.capture_storage_snapshot()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.storage_usage_snapshots
    (snapshot_date, database_bytes, storage_bytes, storage_objects, buckets, active_archive_items, captured_at)
  select
    (now() at time zone 'Asia/Manila')::date,
    pg_database_size(current_database()),
    coalesce(sum(totals.bytes), 0),
    coalesce(sum(totals.objects), 0),
    coalesce(jsonb_agg(jsonb_build_object('bucket', totals.bucket_id, 'bytes', totals.bytes, 'objects', totals.objects)), '[]'::jsonb),
    (select count(*) from public.archive_items where status = 'active'),
    now()
  from (
    select object.bucket_id, sum(coalesce((object.metadata->>'size')::bigint, 0)) as bytes, count(*) as objects
    from storage.objects as object
    group by object.bucket_id
  ) as totals
  on conflict (snapshot_date) do update
    set database_bytes = excluded.database_bytes,
        storage_bytes = excluded.storage_bytes,
        storage_objects = excluded.storage_objects,
        buckets = excluded.buckets,
        active_archive_items = excluded.active_archive_items,
        captured_at = excluded.captured_at;
end;
$$;

create or replace function private.run_archive_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.archive_items;
  blocker text;
  inactive_count integer := 0;
  purged_count integer := 0;
  queued_count integer := 0;
  blocked_count integer := 0;
  failed_count integer := 0;
begin
  inactive_count := private.archive_soft_delete_inactive_mobile_users();

  for target in
    select * from public.archive_items
    where status = 'active' and purge_after <= now()
      and purge_state is distinct from 'purging'
    order by purge_after
    limit 500
  loop
    begin
      blocker := private.archive_purge_blocker(target, false);

      if blocker is not null then
        if target.purge_block_reason is distinct from blocker then
          perform private.archive_log(target.item_id, target.module, target.record_id, target.record_label,
            'purge_blocked', null, blocker, '{}'::jsonb);
        end if;
        update public.archive_items
          set purge_state = 'blocked', purge_block_reason = blocker, last_evaluated_at = now(), updated_at = now()
          where item_id = target.item_id;
        blocked_count := blocked_count + 1;
      elsif jsonb_array_length(
        private.archive_files_remaining(private.archive_record_files(target.module, target.record_id) || target.storage_objects)
      ) > 0 then
        -- Files must be removed through the Storage API by the maintenance function.
        update public.archive_items
          set purge_state = 'awaiting_files', purge_block_reason = null, last_evaluated_at = now(), updated_at = now()
          where item_id = target.item_id;
        queued_count := queued_count + 1;
      else
        perform private.archive_purge_execute(
          target, null,
          'Automatic cleanup after the ' || (select recovery_days from public.archive_policies where module = target.module) || '-day recovery period',
          jsonb_build_object('files_removed', '[]'::jsonb, 'manual', false)
        );
        purged_count := purged_count + 1;
      end if;
    exception when others then
      failed_count := failed_count + 1;
      perform private.archive_log(target.item_id, target.module, target.record_id, target.record_label,
        'purge_failed', null, 'Automatic cleanup failed: ' || sqlerrm, jsonb_build_object('sqlstate', sqlstate));
      update public.archive_items
        set purge_state = 'blocked', purge_block_reason = 'Automatic cleanup failed: ' || sqlerrm,
            last_evaluated_at = now(), updated_at = now()
        where item_id = target.item_id;
    end;
  end loop;

  perform private.capture_storage_snapshot();

  return jsonb_build_object(
    'inactive_accounts_soft_deleted', inactive_count,
    'purged', purged_count,
    'awaiting_file_cleanup', queued_count,
    'blocked', blocked_count,
    'failed', failed_count
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage monitoring
-- ---------------------------------------------------------------------------

create or replace function public.get_storage_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_archive_admin();

  return jsonb_build_object(
    'captured_at', now(),
    'database_bytes', pg_database_size(current_database()),
    'tables', (
      select coalesce(jsonb_agg(jsonb_build_object('table', top_tables.relname, 'bytes', top_tables.bytes) order by top_tables.bytes desc), '[]'::jsonb)
      from (
        select class.relname, pg_total_relation_size(class.oid) as bytes
        from pg_class as class
        join pg_namespace as namespace on namespace.oid = class.relnamespace
        where namespace.nspname = 'public' and class.relkind = 'r'
        order by bytes desc
        limit 8
      ) as top_tables
    ),
    'buckets', (
      select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket.id, 'objects', coalesce(totals.objects, 0), 'bytes', coalesce(totals.bytes, 0)) order by coalesce(totals.bytes, 0) desc), '[]'::jsonb)
      from storage.buckets as bucket
      left join (
        select object.bucket_id, count(*) as objects, sum(coalesce((object.metadata->>'size')::bigint, 0)) as bytes
        from storage.objects as object
        group by object.bucket_id
      ) as totals on totals.bucket_id = bucket.id
    ),
    -- Cumulative file storage by month, rebuilt from object upload dates.
    'file_growth', (
      select coalesce(jsonb_agg(jsonb_build_object('month', cumulative.month, 'bytes', cumulative.running_bytes) order by cumulative.month), '[]'::jsonb)
      from (
        select monthly.month, sum(monthly.month_bytes) over (order by monthly.month) as running_bytes
        from (
          select to_char(date_trunc('month', object.created_at at time zone 'Asia/Manila'), 'YYYY-MM') as month,
                 sum(coalesce((object.metadata->>'size')::bigint, 0)) as month_bytes
          from storage.objects as object
          group by 1
        ) as monthly
      ) as cumulative
      where cumulative.month >= to_char(date_trunc('month', now() at time zone 'Asia/Manila') - interval '11 months', 'YYYY-MM')
    ),
    'snapshots', (
      select coalesce(jsonb_agg(jsonb_build_object('date', snapshot_date, 'database_bytes', database_bytes, 'storage_bytes', storage_bytes) order by snapshot_date), '[]'::jsonb)
      from public.storage_usage_snapshots
      where snapshot_date >= (now() at time zone 'Asia/Manila')::date - 90
    ),
    'event_trend', (
      select coalesce(jsonb_agg(jsonb_build_object('date', daily.day, 'archived', daily.archived, 'restored', daily.restored, 'deleted', daily.deleted) order by daily.day), '[]'::jsonb)
      from (
        select (occurred_at at time zone 'Asia/Manila')::date as day,
          count(*) filter (where event_type in ('archived', 'soft_deleted')) as archived,
          count(*) filter (where event_type = 'restored') as restored,
          count(*) filter (where event_type in ('purged', 'deleted')) as deleted
        from public.archive_events
        where occurred_at >= now() - interval '30 days'
        group by 1
      ) as daily
    )
  );
end;
$$;

revoke all on function public.archive_record(text, text, text) from public, anon;
revoke all on function public.restore_archive_item(uuid, text) from public, anon;
revoke all on function public.update_archive_policy(text, boolean, integer) from public, anon;
revoke all on function public.confirm_archive_backup(text) from public, anon;
revoke all on function public.get_storage_overview() from public, anon;
grant execute on function public.archive_record(text, text, text) to authenticated;
grant execute on function public.restore_archive_item(uuid, text) to authenticated;
grant execute on function public.update_archive_policy(text, boolean, integer) to authenticated;
grant execute on function public.confirm_archive_backup(text) to authenticated;
grant execute on function public.get_storage_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill records that were archived before this migration. Their original
-- archive date is kept; the 30-day countdown starts today.
-- ---------------------------------------------------------------------------

do $$
declare
  row_data record;
begin
  perform set_config('ignis.archive_reason', 'Archived before Archive & Trash was enabled', true);

  for row_data in select * from public.announcements where is_archived loop
    perform private.archive_open('announcements', row_data.announcement_id::text, row_data.title,
      initcap(replace(coalesce(row_data.audience_type, 'public'), '_', ' ')) || ' announcement',
      row_data.created_at, 'archived', row_data.archived_by, null, '{}'::jsonb, null, row_data.archived_at);
  end loop;

  for row_data in select * from public.reports where status = 'archived' loop
    perform private.archive_open('reports', row_data.report_id::text, concat_ws(' · ', row_data.report_no, row_data.title),
      nullif(row_data.created_by_name, ''), row_data.created_at, 'archived', null, null,
      jsonb_build_object('status', 'submitted'), null, row_data.updated_at);
  end loop;

  for row_data in select * from public.leave_requests where is_archived loop
    perform private.archive_open('leave_requests', row_data.request_id::text,
      concat_ws(' · ', coalesce(nullif(row_data.other_leave_type, ''), nullif(row_data.leave_type, ''), 'Leave request'),
        row_data.start_date::text || ' to ' || row_data.end_date::text),
      coalesce(private.archive_actor_name(row_data.personnel_id), 'Personnel') || ' · ' || initcap(coalesce(row_data.status, '')),
      row_data.created_at, 'archived', row_data.archived_by, null, '{}'::jsonb, null, row_data.archived_at);
  end loop;

  for row_data in select * from public.profile_change_requests where is_archived loop
    perform private.archive_open('profile_change_requests', row_data.request_id::text,
      'Profile change · ' || coalesce(private.archive_actor_name(row_data.personnel_id), 'Personnel'),
      initcap(coalesce(row_data.status, '')), row_data.requested_at, 'archived', row_data.archived_by, null,
      '{}'::jsonb, null, row_data.archived_at);
  end loop;

  for row_data in select * from public.visitor_conversations where is_archived loop
    perform private.archive_open('visitor_conversations', row_data.id::text,
      coalesce(nullif(row_data.visitor_name, ''), row_data.visitor_label, 'Visitor conversation'),
      initcap(coalesce(row_data.status, 'open')) || ' conversation', row_data.created_at,
      case when row_data.delete_after is not null then 'soft_deleted' else 'archived' end,
      coalesce(row_data.deletion_requested_by, row_data.archived_by), null, '{}'::jsonb,
      greatest(row_data.delete_after, now() + interval '30 days'), row_data.archived_at);
  end loop;

  for row_data in
    select archive.attendance_id, archive.archived_by, archive.archived_at, record.name, record.rank,
           record.attendance_date, record.station_name, record.shift_id, record.created_at
    from public.attendance_archives as archive
    join public.attendance_records as record on record.id = archive.attendance_id
  loop
    perform private.archive_open('attendance', row_data.attendance_id::text,
      coalesce(nullif(row_data.name, ''), 'Personnel') || ' · ' || coalesce(row_data.attendance_date::text, ''),
      concat_ws(' · ', nullif(row_data.rank, ''), nullif(row_data.station_name, ''), 'Shift ' || nullif(row_data.shift_id, '')),
      row_data.created_at, 'archived', row_data.archived_by, null, '{}'::jsonb, null, row_data.archived_at);
  end loop;

  perform set_config('ignis.archive_reason', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled jobs
-- ---------------------------------------------------------------------------

-- Visitor conversation deletion now goes through the shared lifecycle (with
-- backup verification). The legacy job keeps only its rate-limit cleanup.
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
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.purge_deleted_visitor_conversations() is
  'Removes expired visitor chat rate-limit buckets. Conversation deletion is handled by private.run_archive_lifecycle().';

do $$
declare
  existing_job_id bigint;
begin
  if not exists (select 1 from vault.secrets where name = 'archive_maintenance_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'archive_maintenance_token',
      'Shared secret for the scheduled archive-maintenance edge function.'
    );
  end if;

  for existing_job_id in
    select jobid from cron.job where jobname in ('archive-lifecycle-daily', 'archive-file-cleanup-daily')
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  -- 02:30 Asia/Manila (18:30 UTC): inactivity checks, expiry evaluation, DB-only purges, usage snapshot.
  perform cron.schedule(
    'archive-lifecycle-daily',
    '30 18 * * *',
    'select private.run_archive_lifecycle();'
  );

  -- 02:45 Asia/Manila: remove Storage files for approved purges, then finalize them.
  perform cron.schedule(
    'archive-file-cleanup-daily',
    '45 18 * * *',
    $job$
    select net.http_post(
      url := 'https://mvgpeiejwstrxjmfslke.supabase.co/functions/v1/archive-maintenance',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-maintenance-token', (select decrypted_secret from vault.decrypted_secrets where name = 'archive_maintenance_token')
      ),
      body := '{"action":"process_queue"}'::jsonb,
      timeout_milliseconds := 60000
    );
    $job$
  );
end;
$$;
