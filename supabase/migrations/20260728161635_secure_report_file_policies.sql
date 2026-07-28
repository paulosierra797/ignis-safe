-- Keep report attachments scoped to their owner or an active administrator.
drop policy if exists "Authenticated can read report files" on storage.objects;
drop policy if exists "Intel can manage report files" on storage.objects;
drop policy if exists "Owner or intel delete report files" on storage.objects;
drop policy if exists "Personnel can upload own report files" on storage.objects;

create policy report_files_select_owner_or_admin
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'report_files'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.current_backoffice_role()) = 'admin'
    )
  );

create policy report_files_insert_owner
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'report_files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy report_files_update_admin
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'report_files'
    and (select private.current_backoffice_role()) = 'admin'
  )
  with check (
    bucket_id = 'report_files'
    and (select private.current_backoffice_role()) = 'admin'
  );

create policy report_files_delete_owner_or_admin
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'report_files'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.current_backoffice_role()) = 'admin'
    )
  );
