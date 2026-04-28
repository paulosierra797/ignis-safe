-- Assessment questions access setup
-- Run this in Supabase SQL Editor.

-- Keep the table definition in sync with your existing schema.
create table if not exists public.assessment_questions (
  id uuid not null default gen_random_uuid(),
  assessment_id uuid not null,
  question_no integer not null,
  prompt text not null,
  explanation text null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  question_type text not null default 'multiple_choice'::text,
  prompt_tl text null,
  explanation_tl text null,
  constraint assessment_questions_pkey primary key (id),
  constraint assessment_questions_assessment_id_question_no_key unique (assessment_id, question_no),
  constraint assessment_questions_assessment_id_fkey foreign key (assessment_id) references public.assessments (id) on delete cascade,
  constraint assessment_questions_question_type_check check (
    question_type = any (array['multiple_choice'::text, 'essay'::text])
  )
);

create unique index if not exists assessment_questions_assessment_question_no_uidx
  on public.assessment_questions using btree (assessment_id, question_no);

create index if not exists assessment_questions_assessment_active_idx
  on public.assessment_questions using btree (assessment_id, is_active, question_no);

-- Enable RLS so permissions are controlled by policies.
alter table public.assessment_questions enable row level security;

-- Optional grants (RLS still controls row access).
grant select, insert, update, delete on table public.assessment_questions to authenticated;

-- Allow all authenticated users to read questions.
drop policy if exists "assessment_questions_select_authenticated" on public.assessment_questions;
create policy "assessment_questions_select_authenticated"
on public.assessment_questions
for select
to authenticated
using (auth.uid() is not null);

-- Allow only admins to insert questions.
drop policy if exists "assessment_questions_insert_admin" on public.assessment_questions;
create policy "assessment_questions_insert_admin"
on public.assessment_questions
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

-- Allow only admins to update questions.
drop policy if exists "assessment_questions_update_admin" on public.assessment_questions;
create policy "assessment_questions_update_admin"
on public.assessment_questions
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

-- Allow only admins to delete questions.
drop policy if exists "assessment_questions_delete_admin" on public.assessment_questions;
create policy "assessment_questions_delete_admin"
on public.assessment_questions
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
