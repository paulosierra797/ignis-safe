-- Personnel could archive an announcement from their own feed
-- (announcement_personnel_archives) while it was still "Pending
-- acknowledgment". The frontend now disables the Archive button until the
-- announcement is acknowledged, but that is bypassable client-side, so this
-- adds the same requirement at the RLS layer: a row may only be inserted (or
-- updated, which the upsert conflict path can hit — see
-- 20260804090000_fix_personnel_announcement_archive_upsert_rls.sql) when the
-- acknowledging personnel already has a matching
-- announcement_acknowledgments row for that announcement.
drop policy if exists "announcement_personnel_archive_insert_own" on public.announcement_personnel_archives;
create policy "announcement_personnel_archive_insert_own"
on public.announcement_personnel_archives
for insert
to authenticated
with check (
  personnel_id = auth.uid()
  and exists (
    select 1
    from public.announcements an
    where an.announcement_id = announcement_personnel_archives.announcement_id
      and an.is_archived = false
      and (
        an.audience_type = 'all_personnel'
        or (
          an.audience_type = 'specific_personnel'
          and (
            an.target_personnel_id = auth.uid()
            or exists (
              select 1
              from public.announcement_recipients ar
              where ar.announcement_id = an.announcement_id
                and ar.personnel_id = auth.uid()
            )
          )
        )
      )
  )
  and exists (
    select 1
    from public.announcement_acknowledgments ack
    where ack.announcement_id = announcement_personnel_archives.announcement_id
      and ack.personnel_id = auth.uid()
  )
);

drop policy if exists "announcement_personnel_archive_update_own" on public.announcement_personnel_archives;
create policy "announcement_personnel_archive_update_own"
on public.announcement_personnel_archives
for update
to authenticated
using (
  personnel_id = auth.uid()
)
with check (
  personnel_id = auth.uid()
  and exists (
    select 1
    from public.announcement_acknowledgments ack
    where ack.announcement_id = announcement_personnel_archives.announcement_id
      and ack.personnel_id = auth.uid()
  )
);
