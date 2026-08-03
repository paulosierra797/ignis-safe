-- Personnel-scoped announcement archive.
--
-- The existing `announcements.is_archived` flag is a single global column
-- that only admins can set (see announcements_update_admin policy) and hides
-- an announcement from every recipient at once. Personnel need to archive
-- (hide) an announcement from just their own feed without affecting other
-- personnel or the admin view, so this introduces a separate per-personnel
-- table instead of reusing that column, mirroring the
-- announcement_acknowledgments own-row pattern.
create table if not exists public.announcement_personnel_archives (
  archive_id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(announcement_id) on delete cascade,
  personnel_id uuid not null references public.admin(admin_id) on delete cascade,
  archived_at timestamptz not null default now(),
  unique (announcement_id, personnel_id)
);

create index if not exists idx_announcement_personnel_archives_announcement
  on public.announcement_personnel_archives (announcement_id);

create index if not exists idx_announcement_personnel_archives_personnel
  on public.announcement_personnel_archives (personnel_id);

alter table public.announcement_personnel_archives enable row level security;

drop policy if exists "announcement_personnel_archive_select_own" on public.announcement_personnel_archives;
create policy "announcement_personnel_archive_select_own"
on public.announcement_personnel_archives
for select
to authenticated
using (
  personnel_id = auth.uid()
);

drop policy if exists "announcement_personnel_archive_insert_own" on public.announcement_personnel_archives;
create policy "announcement_personnel_archive_insert_own"
on public.announcement_personnel_archives
for insert
to authenticated
with check (
  personnel_id = auth.uid()
  and exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'personnel'
  )
  and exists (
    select 1
    from public.announcements an
    where an.announcement_id = announcement_personnel_archives.announcement_id
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

drop policy if exists "announcement_personnel_archive_delete_own" on public.announcement_personnel_archives;
create policy "announcement_personnel_archive_delete_own"
on public.announcement_personnel_archives
for delete
to authenticated
using (
  personnel_id = auth.uid()
);
