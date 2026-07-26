create index if not exists idx_leave_requests_archived_by
  on public.leave_requests (archived_by);

create index if not exists idx_profile_change_requests_archived_by
  on public.profile_change_requests (archived_by);
