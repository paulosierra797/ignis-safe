-- Optional acknowledgement deadline for personnel-targeted announcements, plus
-- an automatic daily "nudge" for recipients who have not acknowledged in time.
--
-- - announcements.acknowledgement_deadline: when set (only allowed for the
--   all_personnel / specific_personnel audiences, never for public), every
--   recipient who has not acknowledged by this instant is reminded once per
--   day until they do.
-- - private.generate_announcement_ack_nudges(): inserts one
--   'announcement_acknowledgement_nudge' row into personnel_activity_logs per
--   still-pending recipient per past-deadline announcement, at most once every
--   ~20 hours. It reuses the existing nudge activity_type, so the personnel
--   feed badge, the sidebar reminder popup and the admin tracking view all
--   pick these up with no further wiring. Manual admin nudges
--   (nudgeAnnouncementPersonnel) keep working and are tagged metadata.auto =
--   false; automatic ones are tagged metadata.auto = true.
-- - pg_cron runs the generator every day at 00:00 UTC (08:00 Asia/Manila),
--   matching the "Nudge #1 - Sep 3, 8:00 AM / #2 - Sep 4, 8:00 AM" cadence.

begin;

alter table public.announcements
  add column if not exists acknowledgement_deadline timestamptz null;

alter table public.announcements
  drop constraint if exists announcements_ack_deadline_audience_ck;
alter table public.announcements
  add constraint announcements_ack_deadline_audience_ck
  check (
    acknowledgement_deadline is null
    or audience_type in ('all_personnel', 'specific_personnel')
  );

create index if not exists idx_announcements_ack_deadline
  on public.announcements (acknowledgement_deadline)
  where acknowledgement_deadline is not null;

-- One pass of the automatic reminder generator. Returns the number of nudge
-- rows it created (handy for manual runs / debugging).
create or replace function private.generate_announcement_ack_nudges()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
begin
  with pending_recipients as (
    select distinct
      an.announcement_id,
      an.title,
      an.acknowledgement_deadline,
      recip.personnel_id
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
    where an.is_archived = false
      and an.acknowledgement_deadline is not null
      and an.acknowledgement_deadline <= now()
      and not exists (
        select 1
        from public.announcement_acknowledgments ack
        where ack.announcement_id = an.announcement_id
          and ack.personnel_id = recip.personnel_id
      )
      and not exists (
        select 1
        from public.personnel_activity_logs pal
        where pal.announcement_id = an.announcement_id
          and pal.personnel_id = recip.personnel_id
          and pal.activity_type = 'announcement_acknowledgement_nudge'
          and pal.performed_at > now() - interval '20 hours'
      )
  )
  insert into public.personnel_activity_logs (
    personnel_id, activity_type, action, details, status, metadata, announcement_id
  )
  select
    pr.personnel_id,
    'announcement_acknowledgement_nudge',
    'Automatic Acknowledgement Reminder',
    'Automatic reminder: please review and acknowledge "'
      || left(coalesce(pr.title, 'this announcement'), 120) || '".',
    'NOTICE',
    jsonb_build_object(
      'announcement_id', pr.announcement_id,
      'announcement_title', left(coalesce(pr.title, ''), 120),
      'auto', true,
      'deadline', pr.acknowledgement_deadline
    ),
    pr.announcement_id
  from pending_recipients pr;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function private.generate_announcement_ack_nudges()
  from public, anon, authenticated;

-- (Re)schedule the daily generator. Idempotent so the migration can be re-run.
do $$
begin
  perform cron.unschedule('announcement-ack-nudges');
exception
  when others then null;
end $$;

select cron.schedule(
  'announcement-ack-nudges',
  '0 0 * * *',
  $$select private.generate_announcement_ack_nudges();$$
);

commit;
