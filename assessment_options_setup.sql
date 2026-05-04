-- Assessment options access setup
-- Run this in Supabase SQL Editor.

-- Child table for multiple-choice assessment questions.
create table if not exists public.assessment_options (
  id uuid not null default gen_random_uuid(),
  question_id uuid not null,
  option_key text not null,
  option_text text not null,
  is_correct boolean not null default false,
  created_at timestamp with time zone not null default now(),
  display_order integer null,
  option_text_tl text null,
  constraint assessment_options_pkey primary key (id),
  constraint assessment_options_question_id_option_key_key unique (question_id, option_key),
  constraint assessment_options_question_id_fkey foreign key (question_id) references public.assessment_questions (id) on delete cascade
);

create index if not exists idx_assessment_options_question_display
  on public.assessment_options using btree (question_id, display_order);

create index if not exists assessment_options_question_display_idx
  on public.assessment_options using btree (question_id, display_order);

-- Optional: keep this if you want the same explicit name used by some clients.
-- The unique constraint above already guarantees the same rule.
create unique index if not exists assessment_options_question_option_key_uidx
  on public.assessment_options using btree (question_id, option_key);

-- Enable RLS so permissions are controlled by policies.
alter table public.assessment_options enable row level security;

-- Optional grants (RLS still controls row access).
grant select, insert, update, delete on table public.assessment_options to authenticated;

-- Allow all authenticated users to read options.
drop policy if exists "assessment_options_select_authenticated" on public.assessment_options;
create policy "assessment_options_select_authenticated"
on public.assessment_options
for select
to authenticated
using (auth.uid() is not null);

-- Allow only admins to insert options.
drop policy if exists "assessment_options_insert_admin" on public.assessment_options;
create policy "assessment_options_insert_admin"
on public.assessment_options
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
);

-- Allow only admins to update options.
drop policy if exists "assessment_options_update_admin" on public.assessment_options;
create policy "assessment_options_update_admin"
on public.assessment_options
for update
to authenticated
using (
  exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
);

-- Allow only admins to delete options.
drop policy if exists "assessment_options_delete_admin" on public.assessment_options;
create policy "assessment_options_delete_admin"
on public.assessment_options
for delete
to authenticated
using (
  exists (
    select 1
    from public.admin actor
    where actor.admin_id = auth.uid()
      and lower(actor.role) = 'admin'
  )
);