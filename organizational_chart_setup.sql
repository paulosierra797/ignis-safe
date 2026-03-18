-- Setup script for organizational chart persistence
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS organizational_chart (
  config_key TEXT PRIMARY KEY,
  chart_data JSONB NOT NULL,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE organizational_chart ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read org chart" ON organizational_chart;
CREATE POLICY "Allow authenticated read org chart"
ON organizational_chart
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Allow authenticated write org chart" ON organizational_chart;
CREATE POLICY "Allow authenticated write org chart"
ON organizational_chart
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update org chart" ON organizational_chart;
CREATE POLICY "Allow authenticated update org chart"
ON organizational_chart
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
