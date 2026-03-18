-- Attendance Records table setup for QR attendance flow
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  rank TEXT NOT NULL,
  attendance_date DATE NOT NULL,
  time_in TIMESTAMPTZ NULL,
  time_out TIMESTAMPTZ NULL,
  signature TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_personnel ON attendance_records(personnel_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_created_at ON attendance_records(created_at DESC);

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- Policies for current app flow (no Supabase auth session required)
DROP POLICY IF EXISTS "Attendance public read" ON attendance_records;
CREATE POLICY "Attendance public read" ON attendance_records
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Attendance public insert" ON attendance_records;
CREATE POLICY "Attendance public insert" ON attendance_records
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Attendance public update" ON attendance_records;
CREATE POLICY "Attendance public update" ON attendance_records
  FOR UPDATE USING (true) WITH CHECK (true);