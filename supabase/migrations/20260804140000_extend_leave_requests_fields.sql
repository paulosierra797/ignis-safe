-- Extend leave_requests with leave type, contact number, reliever/shift
-- coverage, and supporting document fields, plus a storage bucket for the
-- document uploads. All new columns are nullable so existing rows (which
-- only ever populated start_date/end_date/reason/status) keep working.

alter table public.leave_requests
  add column if not exists leave_type text,
  add column if not exists other_leave_type text,
  add column if not exists contact_number text,
  add column if not exists reliever_id uuid references public.admin(admin_id) on delete set null,
  add column if not exists reliever_type text,
  add column if not exists document_path text,
  add column if not exists document_url text,
  add column if not exists document_name text,
  add column if not exists document_mime_type text,
  add column if not exists document_size_bytes integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leave_requests_leave_type_chk'
  ) then
    alter table public.leave_requests
      add constraint leave_requests_leave_type_chk
      check (
        leave_type is null
        or leave_type in (
          'Vacation Leave',
          'Sick Leave',
          'Emergency Leave',
          'Maternity Leave',
          'Paternity Leave',
          'Other'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leave_requests_reliever_type_chk'
  ) then
    alter table public.leave_requests
      add constraint leave_requests_reliever_type_chk
      check (reliever_type is null or reliever_type in ('personnel', 'admin_assign'));
  end if;
end $$;

create index if not exists idx_leave_requests_reliever on public.leave_requests (reliever_id);

-- Storage bucket for leave supporting documents (medical certificates, etc.),
-- mirroring the existing report_files bucket setup.
insert into storage.buckets (id, name, public)
values ('leave_supporting_documents', 'leave_supporting_documents', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated can read leave documents" on storage.objects;
create policy "Authenticated can read leave documents"
on storage.objects
for select
to authenticated
using (bucket_id = 'leave_supporting_documents');

drop policy if exists "Personnel can upload own leave documents" on storage.objects;
create policy "Personnel can upload own leave documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'leave_supporting_documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Owner or admin manage leave documents" on storage.objects;
create policy "Owner or admin manage leave documents"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'leave_supporting_documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.current_backoffice_role()) = 'admin'
  )
)
with check (
  bucket_id = 'leave_supporting_documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.current_backoffice_role()) = 'admin'
  )
);

drop policy if exists "Owner or admin delete leave documents" on storage.objects;
create policy "Owner or admin delete leave documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'leave_supporting_documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.current_backoffice_role()) = 'admin'
  )
);
