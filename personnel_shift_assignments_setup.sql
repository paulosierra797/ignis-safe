-- Setup script for personnel shift assignments
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.personnel_shift_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id UUID NOT NULL REFERENCES public.admin(admin_id) ON DELETE CASCADE,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('A', 'B')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  assigned_by UUID REFERENCES public.admin(admin_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT personnel_shift_assignments_date_range_chk CHECK (end_date >= start_date),
  CONSTRAINT personnel_shift_unique_per_period UNIQUE (personnel_id, shift_type, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS idx_personnel_shift_assignments_personnel_id 
ON public.personnel_shift_assignments (personnel_id);

CREATE INDEX IF NOT EXISTS idx_personnel_shift_assignments_shift_type 
ON public.personnel_shift_assignments (shift_type);

CREATE INDEX IF NOT EXISTS idx_personnel_shift_assignments_date_range 
ON public.personnel_shift_assignments (start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_personnel_shift_assignments_personnel_shift_date
ON public.personnel_shift_assignments (personnel_id, shift_type, start_date);

CREATE OR REPLACE FUNCTION public.set_personnel_shift_assignments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_personnel_shift_assignments_updated_at ON public.personnel_shift_assignments;
CREATE TRIGGER trg_personnel_shift_assignments_updated_at
BEFORE UPDATE ON public.personnel_shift_assignments
FOR EACH ROW
EXECUTE FUNCTION public.set_personnel_shift_assignments_updated_at();

ALTER TABLE public.personnel_shift_assignments ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read personnel shift assignments
DROP POLICY IF EXISTS "personnel_shift_assignments_select_authenticated" ON public.personnel_shift_assignments;
CREATE POLICY "personnel_shift_assignments_select_authenticated"
ON public.personnel_shift_assignments
FOR SELECT
TO authenticated
USING (true);

-- Allow admins to insert personnel shift assignments
DROP POLICY IF EXISTS "personnel_shift_assignments_insert_admin" ON public.personnel_shift_assignments;
CREATE POLICY "personnel_shift_assignments_insert_admin"
ON public.personnel_shift_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin a
    WHERE a.admin_id = auth.uid()
      AND LOWER(a.role) = 'admin'
  )
);

-- Allow admins to update personnel shift assignments
DROP POLICY IF EXISTS "personnel_shift_assignments_update_admin" ON public.personnel_shift_assignments;
CREATE POLICY "personnel_shift_assignments_update_admin"
ON public.personnel_shift_assignments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin a
    WHERE a.admin_id = auth.uid()
      AND LOWER(a.role) = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin a
    WHERE a.admin_id = auth.uid()
      AND LOWER(a.role) = 'admin'
  )
);

-- Allow admins to delete personnel shift assignments
DROP POLICY IF EXISTS "personnel_shift_assignments_delete_admin" ON public.personnel_shift_assignments;
CREATE POLICY "personnel_shift_assignments_delete_admin"
ON public.personnel_shift_assignments
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin a
    WHERE a.admin_id = auth.uid()
      AND LOWER(a.role) = 'admin'
  )
);
