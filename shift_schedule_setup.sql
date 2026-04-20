-- Setup script for Shift A / Shift B duty date scheduling
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.shift_schedule (
  config_key TEXT PRIMARY KEY,
  shift_a_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
  shift_b_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.shift_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read shift schedule" ON public.shift_schedule;
CREATE POLICY "Allow authenticated read shift schedule"
ON public.shift_schedule
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Allow authenticated write shift schedule" ON public.shift_schedule;
CREATE POLICY "Allow authenticated write shift schedule"
ON public.shift_schedule
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow authenticated update shift schedule" ON public.shift_schedule;
CREATE POLICY "Allow authenticated update shift schedule"
ON public.shift_schedule
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
