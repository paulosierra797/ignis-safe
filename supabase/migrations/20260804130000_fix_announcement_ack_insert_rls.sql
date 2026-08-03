-- announcement_ack_insert_personnel_own had two bugs blocking legitimate
-- acknowledgments:
--
-- 1. Its audience-visibility subquery wrote
--    `where an.announcement_id = announcement_id`. Because the subquery's
--    own FROM clause aliases announcements as `an` (which also has an
--    announcement_id column), Postgres resolves the unqualified
--    `announcement_id` to that inner table rather than correlating with the
--    row being inserted, compiling to the tautology
--    `an.announcement_id = an.announcement_id`. The audience check then had
--    nothing to do with the announcement actually being acknowledged, so
--    acknowledging failed whenever no *other* announcement in the table
--    happened to satisfy the audience clause (e.g. a personnel account's
--    first specific_personnel announcement).
--
-- 2. It also required admin.role to literally equal 'personnel', the same
--    bug already fixed on announcement_personnel_archives in
--    20260804110000: an admin previewing /personnel routes gets a JS-only
--    role override while admin.role stays 'admin', so the acknowledgment
--    insert raised "new row violates row-level security policy" for that
--    account even though personnel_id = auth.uid() was correct. The role
--    check adds no real security value since personnel_id = auth.uid() and
--    the announcement-visibility check already restrict inserts to the
--    caller's own row for announcements they can see.
--
-- This mirrors the already-correct announcement_personnel_archive_insert_own
-- policy: correlate the subquery with the table name (not the alias) to
-- avoid the shadowing bug, and drop the redundant role gate.
drop policy if exists "announcement_ack_insert_personnel_own" on public.announcement_acknowledgments;
create policy "announcement_ack_insert_personnel_own"
on public.announcement_acknowledgments
for insert
to authenticated
with check (
  personnel_id = auth.uid()
  and exists (
    select 1
    from public.announcements an
    where an.announcement_id = announcement_acknowledgments.announcement_id
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
