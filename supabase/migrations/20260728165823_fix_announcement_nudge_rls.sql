drop policy if exists personnel_activity_logs_select_admin_nudges
on public.personnel_activity_logs;

create policy personnel_activity_logs_select_admin_nudges
on public.personnel_activity_logs
for select
to authenticated
using (
  activity_type = 'announcement_acknowledgement_nudge'
  and exists (
    select 1
    from public.admin actor
    where actor.admin_id = (select auth.uid())
      and lower(actor.role::text) = 'admin'
  )
);

drop policy if exists personnel_activity_logs_insert_admin_nudges
on public.personnel_activity_logs;

create policy personnel_activity_logs_insert_admin_nudges
on public.personnel_activity_logs
for insert
to authenticated
with check (
  activity_type = 'announcement_acknowledgement_nudge'
  and exists (
    select 1
    from public.admin actor
    where actor.admin_id = (select auth.uid())
      and lower(actor.role::text) = 'admin'
  )
  and (
    exists (
      select 1
      from public.admin recipient
      where recipient.admin_id = personnel_activity_logs.personnel_id
        and lower(recipient.role::text) = 'personnel'
    )
    or exists (
      select 1
      from public.personnel_workspace_profiles workspace_profile
      where workspace_profile.admin_id = personnel_activity_logs.personnel_id
    )
  )
  and exists (
    select 1
    from public.announcements announcement
    where announcement.announcement_id = personnel_activity_logs.announcement_id
      and announcement.is_archived = false
      and (
        announcement.audience_type = 'all_personnel'
        or (
          announcement.audience_type = 'specific_personnel'
          and (
            announcement.target_personnel_id = personnel_activity_logs.personnel_id
            or exists (
              select 1
              from public.announcement_recipients recipient_link
              where recipient_link.announcement_id = announcement.announcement_id
                and recipient_link.personnel_id = personnel_activity_logs.personnel_id
            )
          )
        )
      )
  )
);
