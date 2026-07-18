-- Enforce that personnel leave requests cannot be filed for past dates.
-- Run this in Supabase SQL Editor after leave_requests_setup.sql.
--
-- "Today" is normalized to the Asia/Manila timezone so validation stays
-- correct regardless of the database server's own timezone setting, and so
-- it can never be bypassed by editing the browser, request payload, or
-- calling the API/table directly.

create or replace function public.check_leave_request_dates()
returns trigger
language plpgsql
as $$
declare
  today_manila date := (now() at time zone 'Asia/Manila')::date;
begin
  if new.start_date < today_manila then
    raise exception 'You cannot submit a leave request for a past date.'
      using errcode = '23514';
  end if;

  if new.end_date < today_manila then
    raise exception 'You cannot submit a leave request for a past date.'
      using errcode = '23514';
  end if;

  if new.end_date < new.start_date then
    raise exception 'Leave end date must be on or after the start date.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_leave_requests_date_check on public.leave_requests;
create trigger trg_leave_requests_date_check
before insert on public.leave_requests
for each row
execute function public.check_leave_request_dates();
