-- Setup script for personnel leave date fields in admin table
-- Run this in Supabase SQL Editor

ALTER TABLE IF EXISTS public.admin
  ADD COLUMN IF NOT EXISTS leave_start_date DATE,
  ADD COLUMN IF NOT EXISTS leave_end_date DATE;

ALTER TABLE IF EXISTS public.admin ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_leave_date_range_chk'
  ) THEN
    ALTER TABLE public.admin
      ADD CONSTRAINT admin_leave_date_range_chk
      CHECK (
        leave_start_date IS NULL
        OR leave_end_date IS NULL
        OR leave_end_date >= leave_start_date
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_leave_start_date ON public.admin (leave_start_date);
CREATE INDEX IF NOT EXISTS idx_admin_leave_end_date ON public.admin (leave_end_date);

-- Expand status constraint so leave workflow can set status = 'On Leave'.
DO $$
BEGIN
  ALTER TABLE public.admin DROP CONSTRAINT IF EXISTS admin_status_check;

  ALTER TABLE public.admin
    ADD CONSTRAINT admin_status_check
    CHECK (
      status IN (
        'Active',
        'Inactive',
        'Suspended',
        'On Leave',
        'Pending Activation',
        'Expired'
      )
    );
END $$;

-- Allow authenticated users (including admin accounts in-app) to update admin rows.
-- This matches the project's existing pattern used by other setup scripts.
DROP POLICY IF EXISTS "Allow authenticated update admin" ON public.admin;
CREATE POLICY "Allow authenticated update admin"
ON public.admin
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
