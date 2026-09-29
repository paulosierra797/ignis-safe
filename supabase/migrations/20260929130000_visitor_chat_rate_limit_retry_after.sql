-- Extend consume_visitor_chat_rate_limits() to report how many seconds remain
-- until a blocked caller may retry, computed from the actual rate-limit event
-- timestamps rather than a hardcoded value. Return type changes from boolean
-- to jsonb, so the function is dropped and recreated.

drop function if exists public.consume_visitor_chat_rate_limits(text[], text, integer[], integer[]);

create function public.consume_visitor_chat_rate_limits(
  p_key_hashes text[],
  p_action text,
  p_window_seconds integer[],
  p_limits integer[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item_count integer;
  item_index integer;
  recent_count bigint;
  is_blocked boolean := false;
  max_retry_after integer := 0;
  rule_retry_after integer;
  earliest_excess_at timestamptz;
begin
  item_count := cardinality(p_key_hashes);
  if item_count is null
    or item_count = 0
    or item_count <> cardinality(p_window_seconds)
    or item_count <> cardinality(p_limits)
    or p_action not in ('start', 'restore', 'message') then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', 0);
  end if;

  for item_index in 1..item_count loop
    if p_key_hashes[item_index] is null
      or p_window_seconds[item_index] not between 1 and 172800
      or p_limits[item_index] not between 1 and 100 then
      return jsonb_build_object('allowed', false, 'retry_after_seconds', 0);
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(p_action || ':' || p_key_hashes[item_index], 0)
    );
  end loop;

  for item_index in 1..item_count loop
    select count(*)
      into recent_count
      from public.visitor_chat_rate_events
      where key_hash = p_key_hashes[item_index]
        and action = p_action
        and occurred_at >= now() - make_interval(secs => p_window_seconds[item_index]);

    if recent_count >= p_limits[item_index] then
      is_blocked := true;

      -- The caller can retry once enough of the oldest events in the window
      -- age out to bring the count back under the limit.
      select occurred_at
        into earliest_excess_at
        from public.visitor_chat_rate_events
        where key_hash = p_key_hashes[item_index]
          and action = p_action
          and occurred_at >= now() - make_interval(secs => p_window_seconds[item_index])
        order by occurred_at asc
        offset greatest(recent_count - p_limits[item_index], 0)
        limit 1;

      rule_retry_after := greatest(0, ceil(extract(epoch from (
        earliest_excess_at + make_interval(secs => p_window_seconds[item_index]) - now()
      ))))::integer;

      if rule_retry_after > max_retry_after then
        max_retry_after := rule_retry_after;
      end if;
    end if;
  end loop;

  if is_blocked then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', max_retry_after);
  end if;

  for item_index in 1..item_count loop
    insert into public.visitor_chat_rate_events (key_hash, action)
    values (p_key_hashes[item_index], p_action);
  end loop;

  return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
end;
$$;

revoke all on function public.consume_visitor_chat_rate_limits(text[], text, integer[], integer[])
  from public, anon, authenticated;
grant execute on function public.consume_visitor_chat_rate_limits(text[], text, integer[], integer[])
  to service_role;
