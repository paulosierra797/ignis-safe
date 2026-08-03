-- The insert policy added in 20260803170000 required the archiving account's
-- admin.role column to literally equal 'personnel'. That blocks the
-- Personnel Workspace preview (UserContext.jsx: an admin account browsing
-- /personnel routes gets a JS-only `role: 'personnel'` override while the
-- underlying admin.role row stays 'admin'), so clicking Archive there still
-- raised "new row violates row-level security policy for table
-- announcement_personnel_archives" even though personnel_id = auth.uid() was
-- correct.
--
-- The role check added no real security value: personnel_id = auth.uid()
-- already restricts inserts to the caller's own row, and the announcement
-- existence check already restricts to announcements the caller can see.
-- Dropping the role gate fixes archiving for every account that legitimately
-- owns the row being inserted.
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
);
