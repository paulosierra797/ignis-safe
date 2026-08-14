-- Adds a Service Status field to personnel accounts, tracking real-world
-- employment state (Active/Retired/Resigned/Separated/Dismissed/Deceased).
-- This is intentionally separate from the existing `status` column, which
-- continues to track account/access state (Active/Inactive/On Leave/
-- Suspended/Pending Activation/Expired) — personnel on leave remain
-- "Active" from a service-status standpoint.

alter table public.admin
  add column if not exists service_status text not null default 'Active';

alter table public.admin
  add constraint admin_service_status_check
  check (service_status in ('Active', 'Retired', 'Resigned', 'Separated', 'Dismissed', 'Deceased'));

alter table public.personnel_workspace_profiles
  add column if not exists service_status text not null default 'Active';

alter table public.personnel_workspace_profiles
  add constraint personnel_workspace_profiles_service_status_check
  check (service_status in ('Active', 'Retired', 'Resigned', 'Separated', 'Dismissed', 'Deceased'));
