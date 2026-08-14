insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'landing_banner_photos',
  'landing_banner_photos',
  true,
  5242880,
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "landing_banner_photos_select_public" on storage.objects;
create policy "landing_banner_photos_select_public"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'landing_banner_photos');

drop policy if exists "landing_banner_photos_insert_admin" on storage.objects;
create policy "landing_banner_photos_insert_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'landing_banner_photos'
  and exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
);

drop policy if exists "landing_banner_photos_update_admin" on storage.objects;
create policy "landing_banner_photos_update_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'landing_banner_photos'
  and exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
)
with check (
  bucket_id = 'landing_banner_photos'
  and exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
);

drop policy if exists "landing_banner_photos_delete_admin" on storage.objects;
create policy "landing_banner_photos_delete_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'landing_banner_photos'
  and exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
);
