-- Barangay-based assessment history and Phase 2 reassessment rounds.
--
-- What this adds:
--   * assessment_attempts.round_no      - which assessment round an attempt
--     belongs to (every existing attempt is Round 1).
--   * assessment_attempts.barangay_snapshot - the learner's self-declared
--     profiles.barangay when the attempt was created. It is NOT verified
--     residency or attendance; it only lets history be grouped by the barangay
--     the learner declared at the time.
--   * public.assessment_reassessments   - append-only record of every Admin
--     reset. Each row opens the next round for one learner + module.
--   * public.open_assessment_reassessment() - the only way to open a round.
--     Admin-only, writes the audit log row for every reset.
--   * public.assessment_round_history   - one row per learner + module + round
--     with pre/post scores and timestamps (RLS of the caller applies).
--
-- Previous results are never deleted or overwritten: attempt rows (and their
-- answers) stay exactly as submitted. Before module_progress is cleared for
-- the new round, its full previous state is copied into
-- assessment_reassessments.previous_progress.
--
-- One attempt per assessment is still enforced, now per round:
-- the unique index moves from (user_id, assessment_id) to
-- (user_id, assessment_id, round_no).
--
-- The mobile app is not changed. It decides whether a pre/post-test is locked
-- by reading the learner's own attempts and module_progress row. Learners can
-- therefore only read and update attempts in their CURRENT round; earlier
-- rounds stay visible to Admins only. Learners with no reset are always in
-- Round 1, so nothing changes for them.
begin;

-- 1) Round number and barangay snapshot on attempts --------------------------

alter table public.assessment_attempts
  add column if not exists round_no integer not null default 1,
  add column if not exists barangay_snapshot text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assessment_attempts_round_no_positive'
      and conrelid = 'public.assessment_attempts'::regclass
  ) then
    alter table public.assessment_attempts
      add constraint assessment_attempts_round_no_positive check (round_no >= 1);
  end if;
end
$$;

comment on column public.assessment_attempts.round_no is
  'Assessment round (1 = original attempt; 2+ = opened by an Admin reassessment).';
comment on column public.assessment_attempts.barangay_snapshot is
  'Self-declared profiles.barangay at the time the attempt was created. Not verified residency or attendance.';

-- Existing attempts: the best available value is the learner's current
-- self-declared barangay. Done before the trigger below exists, because that
-- trigger keeps the snapshot fixed on UPDATE.
update public.assessment_attempts as attempt
set barangay_snapshot = profile.barangay
from public.profiles as profile
where profile.id = attempt.user_id
  and attempt.barangay_snapshot is null
  and profile.barangay is not null;

-- 2) Reassessment log (one row per opened round) ------------------------------

create table if not exists public.assessment_reassessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  round_no integer not null check (round_no >= 2),
  previous_round_no integer not null check (previous_round_no >= 1),
  barangay_snapshot text,
  reason text check (reason is null or char_length(reason) <= 500),
  previous_progress jsonb not null default '{}'::jsonb,
  reset_by uuid references public.admin(admin_id) on delete set null,
  reset_by_name text,
  created_at timestamptz not null default now(),
  constraint assessment_reassessments_round_sequence check (round_no = previous_round_no + 1),
  constraint assessment_reassessments_user_module_round_key unique (user_id, module_id, round_no)
);

comment on table public.assessment_reassessments is
  'Append-only log of Admin reassessment resets. Each row opens the next assessment round for one learner and module. Written only by open_assessment_reassessment().';

create index if not exists assessment_reassessments_created_at_idx
  on public.assessment_reassessments (created_at desc);
create index if not exists assessment_reassessments_module_idx
  on public.assessment_reassessments (module_id);
create index if not exists assessment_reassessments_reset_by_idx
  on public.assessment_reassessments (reset_by);

alter table public.assessment_reassessments enable row level security;

drop policy if exists assessment_reassessments_admin_select on public.assessment_reassessments;
create policy assessment_reassessments_admin_select
  on public.assessment_reassessments
  for select
  to authenticated
  using ((select private.current_backoffice_role()) = 'admin');

revoke all on public.assessment_reassessments from anon;
revoke insert, update, delete, truncate on public.assessment_reassessments from authenticated;
grant select on public.assessment_reassessments to authenticated;

-- 3) Current round lookup ------------------------------------------------------

create or replace function private.current_assessment_round(p_user_id uuid, p_module_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(reassessment.round_no), 1)
  from public.assessment_reassessments as reassessment
  where reassessment.user_id = p_user_id
    and reassessment.module_id = p_module_id;
$$;

revoke all on function private.current_assessment_round(uuid, uuid) from public, anon;
grant execute on function private.current_assessment_round(uuid, uuid) to authenticated;

-- 4) Assign round + snapshot on insert; keep them fixed afterwards ------------

create or replace function private.assign_assessment_attempt_round()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_module_id uuid;
begin
  if tg_op = 'UPDATE' then
    new.round_no := old.round_no;
    new.barangay_snapshot := old.barangay_snapshot;
    return new;
  end if;

  select assessment.module_id
    into attempt_module_id
  from public.assessments as assessment
  where assessment.id = new.assessment_id;

  new.round_no := private.current_assessment_round(new.user_id, attempt_module_id);
  new.barangay_snapshot := (
    select profile.barangay from public.profiles as profile where profile.id = new.user_id
  );
  return new;
end;
$$;

revoke all on function private.assign_assessment_attempt_round() from public, anon, authenticated;

drop trigger if exists trg_assign_assessment_attempt_round on public.assessment_attempts;
create trigger trg_assign_assessment_attempt_round
  before insert or update on public.assessment_attempts
  for each row
  execute function private.assign_assessment_attempt_round();

-- 5) One attempt per assessment, per round ------------------------------------

create unique index if not exists ux_assessment_attempts_user_assessment_round
  on public.assessment_attempts (user_id, assessment_id, round_no);

drop index if exists public.ux_assessment_attempts_user_assessment;

create index if not exists idx_attempts_module_round
  on public.assessment_attempts (module_id, round_no);

-- 6) Learners only see and update attempts in their current round -------------
--    (Admin read access is the separate assessment_attempts_admin_select policy.)

drop policy if exists assessment_attempts_select_own on public.assessment_attempts;
create policy assessment_attempts_select_own
  on public.assessment_attempts
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and round_no = private.current_assessment_round(user_id, module_id)
  );

drop policy if exists assessment_attempts_update_own on public.assessment_attempts;
create policy assessment_attempts_update_own
  on public.assessment_attempts
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and round_no = private.current_assessment_round(user_id, module_id)
  )
  with check (
    user_id = (select auth.uid())
    and (select private.mobile_access_allowed())
    and round_no = private.current_assessment_round(user_id, module_id)
  );

-- 7) Admin reassessment ---------------------------------------------------------

create or replace function public.open_assessment_reassessment(
  p_user_ids uuid[],
  p_module_ids uuid[],
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.admin%rowtype;
  actor_name text;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  requested_user_ids uuid[];
  requested_module_ids uuid[];
  target_user_id uuid;
  target_profile public.profiles%rowtype;
  learner_name text;
  target_module record;
  current_round integer;
  has_submitted_result boolean;
  progress_snapshot jsonb;
  reassessment_id uuid;
  opened jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
begin
  if (select private.current_backoffice_role()) is distinct from 'admin' then
    raise exception 'Only an active Admin can open a reassessment round.' using errcode = '42501';
  end if;

  select * into actor from public.admin where admin_id = (select auth.uid());
  actor_name := coalesce(
    nullif(trim(concat_ws(' ', actor.first_name, actor.last_name)), ''),
    actor.email,
    'Admin User'
  );

  select coalesce(array_agg(distinct id), '{}') into requested_user_ids
  from unnest(coalesce(p_user_ids, '{}')) as id
  where id is not null;

  select coalesce(array_agg(distinct id), '{}') into requested_module_ids
  from unnest(coalesce(p_module_ids, '{}')) as id
  where id is not null;

  if cardinality(requested_user_ids) = 0 then
    raise exception 'Select at least one learner.' using errcode = '22023';
  end if;
  if cardinality(requested_user_ids) > 200 then
    raise exception 'Select at most 200 learners per reassessment.' using errcode = '22023';
  end if;
  if cardinality(requested_module_ids) = 0 then
    raise exception 'Select at least one module.' using errcode = '22023';
  end if;
  if (select count(*) from public.modules where id = any(requested_module_ids))
     <> cardinality(requested_module_ids) then
    raise exception 'One or more selected modules were not found.' using errcode = '22023';
  end if;
  if clean_reason is not null and char_length(clean_reason) > 500 then
    raise exception 'The reason must be 500 characters or fewer.' using errcode = '22023';
  end if;

  foreach target_user_id in array requested_user_ids loop
    select * into target_profile from public.profiles where id = target_user_id;

    -- Only mobile learners: back-office accounts are never reassessed here.
    if not found or exists (select 1 from public.admin where admin_id = target_user_id) then
      skipped := skipped || jsonb_build_object(
        'user_id', target_user_id,
        'reason', 'not_a_learner'
      );
      continue;
    end if;

    learner_name := coalesce(
      nullif(trim(concat_ws(' ', target_profile.first_name, target_profile.last_name)), ''),
      target_profile.username,
      target_profile.email,
      'Learner'
    );

    for target_module in
      select m.id, m.module_no, m.title
      from public.modules as m
      where m.id = any(requested_module_ids)
      order by m.module_no
    loop
      -- Serialize resets for the same learner + module.
      perform pg_advisory_xact_lock(
        hashtextextended('assessment_round:' || target_user_id::text || ':' || target_module.id::text, 0)
      );

      current_round := private.current_assessment_round(target_user_id, target_module.id);

      select exists (
        select 1
        from public.assessment_attempts as attempt
        where attempt.user_id = target_user_id
          and attempt.module_id = target_module.id
          and attempt.round_no = current_round
          and attempt.status = 'submitted'
          and attempt.submitted_at is not null
      ) into has_submitted_result;

      -- Nothing was taken in the current round, so there is nothing to reset.
      if not has_submitted_result then
        skipped := skipped || jsonb_build_object(
          'user_id', target_user_id,
          'learner_name', learner_name,
          'module_id', target_module.id,
          'module_no', target_module.module_no,
          'round_no', current_round,
          'reason', 'no_submitted_assessment_in_current_round'
        );
        continue;
      end if;

      progress_snapshot := null;
      select to_jsonb(progress) into progress_snapshot
      from public.module_progress as progress
      where progress.user_id = target_user_id
        and progress.module_id = target_module.id
      for update;

      insert into public.assessment_reassessments (
        user_id, module_id, round_no, previous_round_no, barangay_snapshot,
        reason, previous_progress, reset_by, reset_by_name
      )
      values (
        target_user_id, target_module.id, current_round + 1, current_round, target_profile.barangay,
        clean_reason, coalesce(progress_snapshot, '{}'::jsonb), actor.admin_id, actor_name
      )
      returning id into reassessment_id;

      -- Unlock the pre/post-assessment for the new round. Learning material,
      -- simulation progress and earned medals are left untouched; the previous
      -- values are preserved in previous_progress above and in the attempts.
      update public.module_progress
      set pre_test_completed_at = null,
          pre_test_attempt_id = null,
          pre_test_score = null,
          pre_test_correct_count = null,
          pre_test_total_questions = null,
          post_test_completed_at = null,
          post_test_attempt_id = null,
          post_test_score = null,
          post_test_correct_count = null,
          post_test_total_questions = null,
          improvement_score = null,
          has_improved = null,
          updated_at = now()
      where user_id = target_user_id
        and module_id = target_module.id;

      insert into public.admin_activity_logs (admin_id, actor_name, action, action_type, details, status, metadata)
      values (
        actor.admin_id,
        actor_name,
        'Reassessment Round Opened',
        'edit',
        'Opened Round ' || (current_round + 1) || ' of Module ' || target_module.module_no
          || ' (' || target_module.title || ') for ' || learner_name
          || coalesce(' (' || target_profile.email || ')', '')
          || '. Round ' || current_round || ' results were preserved.'
          || coalesce(' Reason: ' || clean_reason, ''),
        'SUCCESS',
        jsonb_build_object(
          'reassessment_id', reassessment_id,
          'target_user_id', target_user_id,
          'target_name', learner_name,
          'target_email', target_profile.email,
          'module_id', target_module.id,
          'module_no', target_module.module_no,
          'previous_round_no', current_round,
          'round_no', current_round + 1,
          'barangay_snapshot', target_profile.barangay,
          'reason', clean_reason
        )
      );

      opened := opened || jsonb_build_object(
        'reassessment_id', reassessment_id,
        'user_id', target_user_id,
        'learner_name', learner_name,
        'module_id', target_module.id,
        'module_no', target_module.module_no,
        'previous_round_no', current_round,
        'round_no', current_round + 1
      );
    end loop;
  end loop;

  return jsonb_build_object('opened', opened, 'skipped', skipped);
end;
$$;

revoke all on function public.open_assessment_reassessment(uuid[], uuid[], text) from public, anon;
grant execute on function public.open_assessment_reassessment(uuid[], uuid[], text) to authenticated;

-- 8) Round history (one row per learner + module + round) ----------------------
--    security_invoker: Admins see every learner; a learner sees only their own
--    current round (the attempt RLS above applies).

create or replace view public.assessment_round_history
with (security_invoker = true)
as
with rounds as (
  select attempt.user_id, attempt.module_id, attempt.round_no
  from public.assessment_attempts as attempt
  union
  select reassessment.user_id, reassessment.module_id, reassessment.round_no
  from public.assessment_reassessments as reassessment
),
submitted as (
  select
    attempt.user_id,
    attempt.module_id,
    attempt.round_no,
    assessment.type::text as assessment_type,
    attempt.id,
    attempt.score,
    attempt.correct_count,
    attempt.total_questions,
    attempt.started_at,
    attempt.submitted_at,
    attempt.barangay_snapshot
  from public.assessment_attempts as attempt
  join public.assessments as assessment on assessment.id = attempt.assessment_id
  where attempt.status = 'submitted'
    and attempt.submitted_at is not null
)
select
  r.user_id,
  r.module_id,
  m.module_no,
  m.title as module_title,
  r.round_no,
  coalesce(pre.barangay_snapshot, post.barangay_snapshot, opened.barangay_snapshot) as barangay_snapshot,
  pre.id as pre_attempt_id,
  pre.score as pre_score,
  pre.correct_count as pre_correct_count,
  pre.total_questions as pre_total_questions,
  pre.started_at as pre_started_at,
  pre.submitted_at as pre_submitted_at,
  post.id as post_attempt_id,
  post.score as post_score,
  post.correct_count as post_correct_count,
  post.total_questions as post_total_questions,
  post.started_at as post_started_at,
  post.submitted_at as post_submitted_at,
  case when pre.score is not null and post.score is not null then post.score - pre.score end as score_difference,
  opened.created_at as round_opened_at,
  opened.reset_by as round_opened_by,
  opened.reset_by_name as round_opened_by_name,
  opened.reason as round_reason
from rounds as r
join public.modules as m on m.id = r.module_id
left join submitted as pre
  on pre.user_id = r.user_id and pre.module_id = r.module_id
 and pre.round_no = r.round_no and pre.assessment_type = 'pre'
left join submitted as post
  on post.user_id = r.user_id and post.module_id = r.module_id
 and post.round_no = r.round_no and post.assessment_type = 'post'
left join public.assessment_reassessments as opened
  on opened.user_id = r.user_id and opened.module_id = r.module_id
 and opened.round_no = r.round_no;

comment on view public.assessment_round_history is
  'One row per learner, module and assessment round with submitted pre/post scores and timestamps. barangay_snapshot is self-declared, not verified residency or attendance.';

revoke all on public.assessment_round_history from anon;
grant select on public.assessment_round_history to authenticated;

commit;
