-- Run the automatic acknowledgement nudge due-check every minute.
--
-- The minute-level pg_cron schedule is only a precision check. It must not
-- create a nudge every minute: the function sends the first nudge on the first
-- pass after the Asia/Manila deadline, then waits 30 minutes after the most
-- recent nudge before sending the next one. The most recent nudge includes a
-- manual admin nudge, so every acknowledgement reminder is part of the same
-- cadence.
--
-- Every nudge is one 'announcement_acknowledgement_nudge' row in
-- personnel_activity_logs. Its performed_at value is explicitly captured at
-- insert time and reused as metadata.nudged_at, so Nudge Count and Nudge
-- History remain derived from the exact recorded send timestamp.
--
-- An advisory transaction lock prevents overlapping due-checks from creating
-- duplicate rows. The acknowledgement check remains in the same transaction,
-- so the next due-check stops immediately after an acknowledgement exists.

begin;

create or replace function private.generate_announcement_ack_nudges()
returns integer
language plpgsql
security definer
set search_path = ''
set timezone = 'Asia/Manila'
as $$
declare
  inserted_count integer := 0;
begin
  -- pg_cron should never have two copies of this generator making decisions
  -- at the same time. A try-lock lets an overlapping minute pass exit cleanly
  -- instead of waiting and then replaying a stale due-check.
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('announcement-ack-nudges', 0)
  ) then
    return 0;
  end if;

  with pending_recipients as (
    select distinct
      an.announcement_id,
      an.title,
      an.acknowledgement_deadline,
      recip.personnel_id,
      last_nudge.last_nudged_at,
      last_nudge.nudge_count
    from public.announcements an
    join lateral (
      select p.admin_id as personnel_id
      from public.admin p
      where an.audience_type = 'all_personnel'
        and lower(p.role::text) = 'personnel'
        and p.status = 'Active'
      union
      select ar.personnel_id
      from public.announcement_recipients ar
      where an.audience_type = 'specific_personnel'
        and ar.announcement_id = an.announcement_id
      union
      select an.target_personnel_id
      where an.audience_type = 'specific_personnel'
        and an.target_personnel_id is not null
    ) recip on true
    left join lateral (
      select
        max(pal.performed_at) as last_nudged_at,
        count(*)::integer as nudge_count
      from public.personnel_activity_logs pal
      where pal.announcement_id = an.announcement_id
        and pal.personnel_id = recip.personnel_id
        and pal.activity_type = 'announcement_acknowledgement_nudge'
    ) last_nudge on true
    where an.is_archived = false
      and an.acknowledgement_deadline is not null
      -- deadline has passed
      and an.acknowledgement_deadline <= current_timestamp
      -- recipient has NOT acknowledged yet
      and not exists (
        select 1
        from public.announcement_acknowledgments ack
        where ack.announcement_id = an.announcement_id
          and ack.personnel_id = recip.personnel_id
      )
      -- Nudge #1 is due immediately after the deadline. Every later nudge is
      -- due exactly 30 minutes after the previous nudge.
      and (
        last_nudge.last_nudged_at is null
        or last_nudge.last_nudged_at <= current_timestamp - interval '30 minutes'
      )
  ),
  nudge_rows as materialized (
    select
      pr.*,
      pg_catalog.clock_timestamp() as nudged_at
    from pending_recipients pr
  )
  insert into public.personnel_activity_logs (
    personnel_id,
    activity_type,
    action,
    details,
    status,
    metadata,
    announcement_id,
    performed_at
  )
  select
    nr.personnel_id,
    'announcement_acknowledgement_nudge',
    'Automatic Acknowledgement Reminder',
    'Automatic reminder: please review and acknowledge "'
      || pg_catalog.left(coalesce(nr.title, 'this announcement'), 120) || '".',
    'NOTICE',
    jsonb_build_object(
      'announcement_id', nr.announcement_id,
      'announcement_title', pg_catalog.left(coalesce(nr.title, ''), 120),
      'auto', true,
      'deadline', nr.acknowledgement_deadline,
      'nudged_at', nr.nudged_at,
      'nudge_number', nr.nudge_count + 1
    ),
    nr.announcement_id,
    nr.nudged_at
  from nudge_rows nr;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function private.generate_announcement_ack_nudges()
  from public, anon, authenticated;

-- (Re)schedule the due-check to run every minute. Idempotent so the migration
-- can be re-run. The function above, not this schedule, enforces the 30-minute
-- interval between nudges.
do $$
begin
  perform cron.unschedule('announcement-ack-nudges');
exception
  when others then null;
end $$;

select cron.schedule(
  'announcement-ack-nudges',
  '* * * * *',
  $$select private.generate_announcement_ack_nudges();$$
);

commit;
