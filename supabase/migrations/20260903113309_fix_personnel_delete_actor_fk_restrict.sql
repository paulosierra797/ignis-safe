-- Root cause of "Failed to delete auth user: Database error deleting user":
-- reports.created_by and report_reviews.acted_by are FKs to auth.users(id)
-- declared ON DELETE RESTRICT (and NOT NULL), and announcements.created_by is
-- an FK to admin(admin_id) with no ON DELETE action (implicit NO ACTION).
-- Any personnel account referenced by these columns blocks the Auth Admin
-- delete_user() call at the Postgres level, before Supabase Auth can clean up
-- auth.users. Every sibling "actor" column in this schema (approved_by,
-- archived_by, reviewed_by, resolved_by, assigned_to, updated_by, etc.)
-- already uses ON DELETE SET NULL, and reports/report_reviews already
-- denormalize the human-readable actor into created_by_name / acted_by_name,
-- so switching these three to SET NULL preserves the audit trail display
-- while allowing account deletion to succeed without orphaning any rows.

BEGIN;

ALTER TABLE public.reports ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.reports DROP CONSTRAINT investigation_reports_created_by_fkey;
ALTER TABLE public.reports
  ADD CONSTRAINT investigation_reports_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.report_reviews ALTER COLUMN acted_by DROP NOT NULL;
ALTER TABLE public.report_reviews DROP CONSTRAINT investigation_report_reviews_acted_by_fkey;
ALTER TABLE public.report_reviews
  ADD CONSTRAINT investigation_report_reviews_acted_by_fkey
  FOREIGN KEY (acted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.announcements ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.announcements DROP CONSTRAINT announcements_created_by_fkey;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.admin(admin_id) ON DELETE SET NULL;

COMMIT;
