-- Server-side metering for the Azure Translator F0 integration. These tables
-- are intentionally unavailable through the public Data API; only the Edge
-- Function service-role client can reserve and finalize usage.
create table public.translation_usage_monthly (
  month_start date primary key,
  reserved_characters bigint not null default 0 check (reserved_characters >= 0),
  translated_characters bigint not null default 0 check (translated_characters >= 0),
  request_count bigint not null default 0 check (request_count >= 0),
  failed_request_count bigint not null default 0 check (failed_request_count >= 0),
  updated_at timestamptz not null default now()
);

create table public.translation_usage_events (
  request_id uuid primary key,
  admin_id uuid not null references public.admin(admin_id) on delete restrict,
  month_start date not null references public.translation_usage_monthly(month_start) on delete restrict,
  section text not null check (section in ('learning_materials', 'assessment_questions', 'about_us')),
  source_language text not null check (source_language in ('en', 'fil')),
  target_language text not null check (target_language in ('en', 'fil') and target_language <> source_language),
  reserved_characters integer not null check (reserved_characters > 0),
  billed_characters integer check (billed_characters >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'succeeded', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index translation_usage_events_admin_created_idx
  on public.translation_usage_events (admin_id, created_at desc);

create table public.translation_rate_limit_windows (
  admin_id uuid not null references public.admin(admin_id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (admin_id, window_started_at)
);

alter table public.translation_usage_monthly enable row level security;
alter table public.translation_usage_events enable row level security;
alter table public.translation_rate_limit_windows enable row level security;

revoke all on public.translation_usage_monthly from anon, authenticated;
revoke all on public.translation_usage_events from anon, authenticated;
revoke all on public.translation_rate_limit_windows from anon, authenticated;

create or replace function public.reserve_translation_usage(
  p_request_id uuid,
  p_admin_id uuid,
  p_characters integer,
  p_monthly_limit integer,
  p_requests_per_minute integer,
  p_section text,
  p_source_language text,
  p_target_language text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_month date := date_trunc('month', now() at time zone 'utc')::date;
  current_window timestamptz := date_trunc('minute', now());
  safe_monthly_limit integer := least(greatest(coalesce(p_monthly_limit, 2000000), 1), 2000000);
  safe_rate_limit integer := least(greatest(coalesce(p_requests_per_minute, 10), 1), 60);
  current_requests integer;
  current_usage bigint;
begin
  if p_characters is null or p_characters < 1 or p_characters > 50000 then
    raise exception using errcode = '22023', message = 'invalid_character_count';
  end if;

  if p_section not in ('learning_materials', 'assessment_questions', 'about_us')
    or p_source_language not in ('en', 'fil')
    or p_target_language not in ('en', 'fil')
    or p_source_language = p_target_language then
    raise exception using errcode = '22023', message = 'invalid_translation_request';
  end if;

  if not exists (
    select 1
    from public.admin
    where admin_id = p_admin_id
      and lower(trim(role)) = 'admin'
      and lower(trim(coalesce(status, ''))) = 'active'
  ) then
    raise exception using errcode = '42501', message = 'administrator_access_required';
  end if;

  -- Serializes reservations so concurrent instances cannot cross the monthly cap.
  perform pg_advisory_xact_lock(hashtext('ignis_safe_azure_translation_usage'));

  delete from public.translation_rate_limit_windows
  where window_started_at < current_window - interval '10 minutes';

  insert into public.translation_rate_limit_windows (admin_id, window_started_at, request_count)
  values (p_admin_id, current_window, 1)
  on conflict (admin_id, window_started_at)
  do update set request_count = public.translation_rate_limit_windows.request_count + 1
  returning request_count into current_requests;

  if current_requests > safe_rate_limit then
    raise exception using errcode = 'P0001', message = 'translation_rate_limit_exceeded';
  end if;

  insert into public.translation_usage_monthly (month_start)
  values (current_month)
  on conflict (month_start) do nothing;

  select reserved_characters + translated_characters
  into current_usage
  from public.translation_usage_monthly
  where month_start = current_month
  for update;

  if current_usage + p_characters > safe_monthly_limit then
    raise exception using errcode = 'P0001', message = 'translation_monthly_quota_exhausted';
  end if;

  update public.translation_usage_monthly
  set reserved_characters = reserved_characters + p_characters,
      request_count = request_count + 1,
      updated_at = now()
  where month_start = current_month;

  insert into public.translation_usage_events (
    request_id,
    admin_id,
    month_start,
    section,
    source_language,
    target_language,
    reserved_characters
  ) values (
    p_request_id,
    p_admin_id,
    current_month,
    p_section,
    p_source_language,
    p_target_language,
    p_characters
  );

  return jsonb_build_object(
    'remainingCharacters', safe_monthly_limit - current_usage - p_characters,
    'monthlyLimit', safe_monthly_limit
  );
end;
$$;

create or replace function public.finalize_translation_usage(
  p_request_id uuid,
  p_success boolean,
  p_billed_characters integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usage_event public.translation_usage_events%rowtype;
  safe_billed integer;
begin
  select * into usage_event
  from public.translation_usage_events
  where request_id = p_request_id
  for update;

  if not found or usage_event.status <> 'reserved' then
    return;
  end if;

  safe_billed := least(
    greatest(coalesce(p_billed_characters, usage_event.reserved_characters), 0),
    usage_event.reserved_characters
  );

  update public.translation_usage_events
  set status = case when p_success then 'succeeded' else 'failed' end,
      billed_characters = case when p_success then safe_billed else 0 end,
      completed_at = now()
  where request_id = p_request_id;

  update public.translation_usage_monthly
  set reserved_characters = greatest(reserved_characters - usage_event.reserved_characters, 0),
      translated_characters = translated_characters + case when p_success then safe_billed else 0 end,
      failed_request_count = failed_request_count + case when p_success then 0 else 1 end,
      updated_at = now()
  where month_start = usage_event.month_start;
end;
$$;

revoke all on function public.reserve_translation_usage(uuid, uuid, integer, integer, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.finalize_translation_usage(uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.reserve_translation_usage(uuid, uuid, integer, integer, integer, text, text, text) to service_role;
grant execute on function public.finalize_translation_usage(uuid, boolean, integer) to service_role;
