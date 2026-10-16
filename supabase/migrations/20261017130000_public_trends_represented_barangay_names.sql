-- Public Trends: also return the names of the official barangays that have at
-- least one registered learner, so the landing page can list them on hover.
-- Only barangay names are added (never per-learner rows); every other value is
-- unchanged from 20261014130000_add_public_trends_aggregates.sql.

create or replace function public.get_public_trends()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with
  settings as (
    select
      5 as min_group_size,
      date_trunc('month', now() at time zone 'Asia/Manila')::date as current_month
  ),
  learners as (
    select p.id, p.barangay, p.created_at
    from public.profiles as p
    where p.registration_status = 'completed'
      and p.is_active is not false
      and not exists (select 1 from public.admin as a where a.admin_id = p.id)
  ),
  tracked_modules as (
    select m.id, m.module_no, m.title
    from public.modules as m
    where m.module_no between 1 and 5
  ),
  progress as (
    select
      mp.user_id,
      tm.module_no,
      pre_attempt.score as pre_score,
      post_attempt.score as post_score,
      (
        mp.pre_test_completed_at is not null
        and mp.pre_test_score is not null
        and pre_attempt.id is not null
      ) as valid_pre,
      (
        mp.learning_material_completed_at is not null
        and mp.learning_material_read_status is true
      ) as valid_learning,
      (
        mp.post_test_completed_at is not null
        and mp.post_test_score is not null
        and post_attempt.id is not null
      ) as valid_post
    from public.module_progress as mp
    join learners as l on l.id = mp.user_id
    join tracked_modules as tm on tm.id = mp.module_id
    left join public.assessments as pre_assessment
      on pre_assessment.module_id = tm.id
     and pre_assessment.type::text = 'pre'
    left join public.assessments as post_assessment
      on post_assessment.module_id = tm.id
     and post_assessment.type::text = 'post'
    left join public.assessment_attempts as pre_attempt
      on pre_attempt.id = mp.pre_test_attempt_id
     and pre_attempt.user_id = mp.user_id
     and pre_attempt.assessment_id = pre_assessment.id
     and pre_attempt.status = 'submitted'
     and pre_attempt.submitted_at is not null
     and pre_attempt.score is not null
    left join public.assessment_attempts as post_attempt
      on post_attempt.id = mp.post_test_attempt_id
     and post_attempt.user_id = mp.user_id
     and post_attempt.assessment_id = post_assessment.id
     and post_attempt.status = 'submitted'
     and post_attempt.submitted_at is not null
     and post_attempt.score is not null
  ),
  comparable as (
    select module_no, pre_score, post_score
    from progress
    where valid_pre and valid_post
  ),
  -- Every valid learning action, one row each, used for Participation Over Time.
  activities as (
    select aa.user_id, aa.submitted_at as occurred_at
    from public.assessment_attempts as aa
    join learners as l on l.id = aa.user_id
    join public.assessments as a on a.id = aa.assessment_id
    join tracked_modules as tm on tm.id = a.module_id
    where aa.status = 'submitted'
      and aa.submitted_at is not null
      and aa.score is not null
    union all
    select mp.user_id, mp.learning_material_completed_at
    from public.module_progress as mp
    join learners as l on l.id = mp.user_id
    join tracked_modules as tm on tm.id = mp.module_id
    where mp.learning_material_read_status is true
      and mp.learning_material_completed_at is not null
    union all
    select sa.user_id, sa.submitted_at
    from public.simulation_attempts as sa
    join learners as l on l.id = sa.user_id
    join tracked_modules as tm on tm.id = sa.module_id
    where sa.status = 'done'
      and sa.submitted_at is not null
  ),
  dated_activities as (
    select
      user_id,
      date_trunc('month', occurred_at at time zone 'Asia/Manila')::date as month
    from activities
    where occurred_at <= now()
  ),
  official_barangays as (
    select
      b.name,
      row_number() over (order by b.display_order nulls last, b.name) as position
    from public.dasmarinas_barangays as b
    where b.is_active is true
      and nullif(btrim(b.name), '') is not null
  ),
  barangay_aliases as (
    select ob.name, ob.position, alias.value as alias, alias.ordinality as alias_position
    from official_barangays as ob
    cross join lateral unnest(
      case
        when ob.name ~ '^[^(]+?\s*\([^)]+\)\s*$' then array[
          ob.name,
          btrim(substring(ob.name from '^([^(]+?)\s*\(')),
          btrim(substring(ob.name from '\(([^)]+)\)'))
        ]
        else array[ob.name]
      end
    ) with ordinality as alias(value, ordinality)
  ),
  barangay_keys as (
    -- Exact keys are claimed before compact (space-free) keys, and the first
    -- claim wins, exactly like buildBarangayLookup() on the admin web.
    select distinct on (key) key, name
    from (
      select private.public_trends_barangay_key(alias) as key, name, 1 as kind, position, alias_position
      from barangay_aliases
      union all
      select replace(private.public_trends_barangay_key(alias), ' ', ''), name, 2, position, alias_position
      from barangay_aliases
    ) as candidates
    where key <> ''
    order by key, kind, position, alias_position
  ),
  learner_barangays as (
    select
      l.created_at,
      coalesce(exact_match.name, compact_match.name) as barangay
    from learners as l
    left join barangay_keys as exact_match
      on exact_match.key = private.public_trends_barangay_key(l.barangay)
    left join barangay_keys as compact_match
      on compact_match.key = replace(private.public_trends_barangay_key(l.barangay), ' ', '')
    where private.public_trends_barangay_key(l.barangay) <> ''
  ),
  barangay_first_seen as (
    select
      barangay,
      date_trunc('month', min(created_at) at time zone 'Asia/Manila')::date as month
    from learner_barangays
    where barangay is not null
    group by barangay
  ),
  -- Chart window: at least the last 6 months, at most the last 12, starting
  -- earlier only as far back as the first real record.
  first_record as (
    select least(
      (select min(date_trunc('month', created_at at time zone 'Asia/Manila')::date) from learners),
      (select min(month) from dated_activities)
    ) as month
  ),
  months as (
    select generate_series(
      greatest(
        least(coalesce(fr.month, s.current_month), (s.current_month - interval '5 months')::date),
        (s.current_month - interval '11 months')::date
      ),
      s.current_month,
      interval '1 month'
    )::date as month
    from settings as s
    cross join first_record as fr
  )
  select jsonb_build_object(
    'generated_at', now(),
    'min_group_size', (select min_group_size from settings),
    'registered_learners', (select count(*) from learners),
    'registrations_by_month', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', to_char(mo.month, 'YYYY-MM'),
        'total', (
          select count(*) from learners as l
          where date_trunc('month', l.created_at at time zone 'Asia/Manila')::date <= mo.month
        )
      ) order by mo.month)
      from months as mo
    ), '[]'::jsonb),
    'barangays', jsonb_build_object(
      'represented', (select count(*) from barangay_first_seen),
      'represented_names', coalesce((
        select jsonb_agg(bfs.barangay order by bfs.barangay) from barangay_first_seen as bfs
      ), '[]'::jsonb),
      'official_total', (select count(*) from official_barangays),
      'by_month', coalesce((
        select jsonb_agg(jsonb_build_object(
          'month', to_char(mo.month, 'YYYY-MM'),
          'total', (select count(*) from barangay_first_seen as bfs where bfs.month <= mo.month)
        ) order by mo.month)
        from months as mo
      ), '[]'::jsonb)
    ),
    'completed_modules', (
      select count(*) from progress where valid_pre and valid_learning and valid_post
    ),
    'participation_by_month', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', to_char(mo.month, 'YYYY-MM'),
        'activities', (select count(*) from dated_activities as da where da.month = mo.month),
        'active_learners', (select count(distinct da.user_id) from dated_activities as da where da.month = mo.month)
      ) order by mo.month)
      from months as mo
    ), '[]'::jsonb),
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'module_no', tm.module_no,
        'title', tm.title,
        'started', (select count(*) from progress as p where p.module_no = tm.module_no and p.valid_pre),
        'completed', (
          select count(*) from progress as p
          where p.module_no = tm.module_no and p.valid_pre and p.valid_learning and p.valid_post
        )
      ) order by tm.module_no)
      from tracked_modules as tm
    ), '[]'::jsonb),
    'assessment', (
      select jsonb_build_object(
        'comparable_records', count(c.pre_score),
        'average_pre', case when count(c.pre_score) >= s.min_group_size then round(avg(c.pre_score), 1) end,
        'average_post', case when count(c.pre_score) >= s.min_group_size then round(avg(c.post_score), 1) end,
        'average_difference', case
          when count(c.pre_score) >= s.min_group_size then round(avg(c.post_score) - avg(c.pre_score), 1)
        end
      )
      from settings as s
      left join comparable as c on true
      group by s.min_group_size
    ),
    'assessment_by_module', coalesce((
      select jsonb_agg(jsonb_build_object(
        'module_no', grouped.module_no,
        'comparable_records', grouped.records,
        'average_pre', grouped.average_pre,
        'average_post', grouped.average_post
      ) order by grouped.module_no)
      from (
        select
          c.module_no,
          count(*) as records,
          round(avg(c.pre_score), 1) as average_pre,
          round(avg(c.post_score), 1) as average_post
        from comparable as c
        group by c.module_no
        having count(*) >= (select min_group_size from settings)
      ) as grouped
    ), '[]'::jsonb)
  );
$$;

comment on function public.get_public_trends() is
  'Aggregate-only public statistics for the landing page Trends section. Returns no per-user records; score averages are suppressed below min_group_size comparable records.';

revoke all on function private.public_trends_barangay_key(text) from public, anon, authenticated;
revoke all on function public.get_public_trends() from public;
grant execute on function public.get_public_trends() to anon, authenticated;
