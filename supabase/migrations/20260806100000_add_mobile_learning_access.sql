-- Add a mobile learning access flag for Admin/Personnel accounts and enforce
-- it via RLS on the mobile-learning tables (in addition to the app-level
-- login gate), so a backoffice account without the flag can't write learning
-- activity by calling Supabase directly. Mobile-only accounts (no row in
-- public.admin) are unaffected.
begin;

alter table public.admin
  add column if not exists mobile_access_enabled boolean not null default false;

create or replace function private.mobile_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not exists (
      select 1 from public.admin a where a.admin_id = (select auth.uid())
    )
    or exists (
      select 1 from public.admin a
      where a.admin_id = (select auth.uid())
        and a.mobile_access_enabled = true
        and lower(coalesce(a.status, '')) = 'active'
    );
$$;

revoke all on function private.mobile_access_allowed() from public, anon;
grant execute on function private.mobile_access_allowed() to authenticated;

-- profiles, module_progress and assessment_attempts each accumulated
-- duplicate own-row policies from earlier setup scripts. Drop everything on
-- these three tables and recreate one clean policy per command, adding the
-- mobile_access_allowed() check to INSERT/UPDATE.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'module_progress', 'assessment_attempts')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

-- profiles
create policy profiles_select_own_or_admin
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select private.current_backoffice_role()) = 'admin'
  );

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (
    id = (select auth.uid())
    and (select private.mobile_access_allowed())
  );

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and (select private.mobile_access_allowed())
  );

-- module_progress
create policy module_progress_select_own
  on public.module_progress
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy module_progress_admin_select
  on public.module_progress
  for select
  to authenticated
  using (public.is_admin_user());

create policy module_progress_insert_own
  on public.module_progress
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.mobile_access_allowed())
  );

create policy module_progress_update_own
  on public.module_progress
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (select private.mobile_access_allowed())
  );

-- assessment_attempts
create policy assessment_attempts_select_own
  on public.assessment_attempts
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy assessment_attempts_admin_select
  on public.assessment_attempts
  for select
  to authenticated
  using (public.is_admin_user());

create policy assessment_attempts_insert_own
  on public.assessment_attempts
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.mobile_access_allowed())
  );

create policy assessment_attempts_update_own
  on public.assessment_attempts
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (select private.mobile_access_allowed())
  );

commit;
