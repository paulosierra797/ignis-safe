-- archivePersonnelAnnouncement() upserts into announcement_personnel_archives
-- with onConflict: 'announcement_id,personnel_id', which Postgres compiles to
-- INSERT ... ON CONFLICT DO UPDATE. Whenever that hits the conflict branch
-- (e.g. a duplicate archive click, a retried request, or an archive row that
-- was never restored), RLS requires an UPDATE policy for the update to be
-- authorized. Only SELECT/INSERT/DELETE policies were added in the original
-- migration, so the conflict branch was default-denied and the whole upsert
-- failed with "new row violates row-level security policy".
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
);
