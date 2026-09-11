-- Archiving organizes the admin list without changing attendance evidence.
create table public.attendance_archives (
  attendance_id uuid primary key references public.attendance_records(id) on delete cascade,
  archived_at timestamptz not null default now(),
  archived_by uuid default auth.uid() references public.admin(admin_id) on delete set null
);

alter table public.attendance_archives enable row level security;
revoke all on public.attendance_archives from anon, authenticated;
grant select, insert, delete on public.attendance_archives to authenticated;

create policy "Admins read attendance archives" on public.attendance_archives
  for select to authenticated
  using ((select private.current_backoffice_role()) = 'admin');
create policy "Admins archive attendance" on public.attendance_archives
  for insert to authenticated
  with check ((select private.current_backoffice_role()) = 'admin' and archived_by = (select auth.uid()));
create policy "Admins restore attendance" on public.attendance_archives
  for delete to authenticated
  using ((select private.current_backoffice_role()) = 'admin');

create index attendance_archives_actor_idx on public.attendance_archives(archived_by);
