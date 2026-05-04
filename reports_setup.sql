-- Setup script for personnel-created investigation reports
-- Run this in Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Main report table
CREATE TABLE IF NOT EXISTS investigation_reports (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_no TEXT UNIQUE,
  report_type TEXT NOT NULL CHECK (
    report_type IN ('fireOperations', 'spotInvestigation', 'finalInvestigation')
  ),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'archived')
  ),

  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by_name TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Full form payload from InvestigationReport.jsx
  report_payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Optional generated PDF metadata
  pdf_url TEXT,
  pdf_file_name TEXT,

  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,

  rejection_reason TEXT,
  internal_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Review history / audit trail
CREATE TABLE IF NOT EXISTS investigation_report_reviews (
  review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES investigation_reports(report_id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (
    action IN ('submitted', 'assigned', 'under_review', 'approved', 'rejected', 'returned', 'updated', 'archived')
  ),
  remarks TEXT,
  acted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  acted_by_name TEXT,
  acted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) Optional attachments table
CREATE TABLE IF NOT EXISTS investigation_report_attachments (
  attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES investigation_reports(report_id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4) Auto-updated timestamp trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_investigation_reports_updated_at ON investigation_reports;
CREATE TRIGGER trg_investigation_reports_updated_at
BEFORE UPDATE ON investigation_reports
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 5) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_investigation_reports_created_by ON investigation_reports(created_by);
CREATE INDEX IF NOT EXISTS idx_investigation_reports_status ON investigation_reports(status);
CREATE INDEX IF NOT EXISTS idx_investigation_reports_type ON investigation_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_investigation_reports_created_at ON investigation_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_investigation_reviews_report_id ON investigation_report_reviews(report_id);
CREATE INDEX IF NOT EXISTS idx_investigation_attachments_report_id ON investigation_report_attachments(report_id);

-- 6) Report number generator (e.g., REP-2026-000001)
CREATE SEQUENCE IF NOT EXISTS investigation_report_no_seq;

CREATE OR REPLACE FUNCTION assign_report_no()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.report_no IS NULL OR NEW.report_no = '' THEN
    NEW.report_no := 'REP-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('investigation_report_no_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_report_no ON investigation_reports;
CREATE TRIGGER trg_assign_report_no
BEFORE INSERT ON investigation_reports
FOR EACH ROW
EXECUTE FUNCTION assign_report_no();

-- 7) Enable RLS
ALTER TABLE investigation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE investigation_report_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE investigation_report_attachments ENABLE ROW LEVEL SECURITY;

-- Helper condition note:
-- Reviewer roles are sourced from admin.role and include admin, intel unit, intel-unit.

-- 8) RLS policies: investigation_reports
DROP POLICY IF EXISTS "Personnel insert own reports" ON investigation_reports;
CREATE POLICY "Personnel insert own reports"
ON investigation_reports
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
);

DROP POLICY IF EXISTS "Personnel read own reports" ON investigation_reports;
CREATE POLICY "Personnel read own reports"
ON investigation_reports
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM admin a
    WHERE a.admin_id = auth.uid()
      AND LOWER(a.role) IN ('admin', 'intel unit', 'intel-unit')
  )
);

DROP POLICY IF EXISTS "Personnel update own editable reports" ON investigation_reports;
CREATE POLICY "Personnel update own editable reports"
ON investigation_reports
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  AND status IN ('draft', 'submitted', 'rejected')
)
WITH CHECK (
  created_by = auth.uid()
  AND status IN ('draft', 'submitted', 'rejected')
);

DROP POLICY IF EXISTS "Reviewer manage reports" ON investigation_reports;
DROP POLICY IF EXISTS "Intel unit manage reports" ON investigation_reports;
CREATE POLICY "Intel unit manage reports"
ON investigation_reports
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM admin a
    WHERE a.admin_id = auth.uid()
      AND LOWER(a.role) IN ('admin', 'intel unit', 'intel-unit')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM admin a
    WHERE a.admin_id = auth.uid()
      AND LOWER(a.role) IN ('admin', 'intel unit', 'intel-unit')
  )
);

DROP POLICY IF EXISTS "Admin delete reports" ON investigation_reports;
DROP POLICY IF EXISTS "Intel unit delete reports" ON investigation_reports;
CREATE POLICY "Intel unit delete reports"
ON investigation_reports
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM admin a
    WHERE a.admin_id = auth.uid()
      AND LOWER(a.role) IN ('admin', 'intel unit', 'intel-unit')
  )
);

-- 9) RLS policies: review history
DROP POLICY IF EXISTS "Read review history by access" ON investigation_report_reviews;
CREATE POLICY "Read review history by access"
ON investigation_report_reviews
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM investigation_reports r
    WHERE r.report_id = investigation_report_reviews.report_id
      AND (
        r.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM admin a
          WHERE a.admin_id = auth.uid()
            AND LOWER(a.role) IN ('admin', 'intel unit', 'intel-unit')
        )
      )
  )
);

DROP POLICY IF EXISTS "Reviewer insert review history" ON investigation_report_reviews;
DROP POLICY IF EXISTS "Intel unit insert review history" ON investigation_report_reviews;
CREATE POLICY "Intel unit insert review history"
ON investigation_report_reviews
FOR INSERT
TO authenticated
WITH CHECK (
  acted_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM admin a
    WHERE a.admin_id = auth.uid()
      AND LOWER(a.role) IN ('admin', 'intel unit', 'intel-unit')
  )
);

-- 10) RLS policies: attachments
DROP POLICY IF EXISTS "Read attachments by access" ON investigation_report_attachments;
CREATE POLICY "Read attachments by access"
ON investigation_report_attachments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM investigation_reports r
    WHERE r.report_id = investigation_report_attachments.report_id
      AND (
        r.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM admin a
          WHERE a.admin_id = auth.uid()
            AND LOWER(a.role) IN ('admin', 'intel unit', 'intel-unit')
        )
      )
  )
);

DROP POLICY IF EXISTS "Insert attachments by owner/reviewer" ON investigation_report_attachments;
CREATE POLICY "Insert attachments by owner/reviewer"
ON investigation_report_attachments
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM investigation_reports r
    WHERE r.report_id = investigation_report_attachments.report_id
      AND (
        r.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM admin a
          WHERE a.admin_id = auth.uid()
            AND LOWER(a.role) IN ('admin', 'intel unit', 'intel-unit')
        )
      )
  )
);

DROP POLICY IF EXISTS "Delete attachments by owner/reviewer" ON investigation_report_attachments;
CREATE POLICY "Delete attachments by owner/reviewer"
ON investigation_report_attachments
FOR DELETE
TO authenticated
USING (
  uploaded_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM admin a
    WHERE a.admin_id = auth.uid()
      AND LOWER(a.role) IN ('admin', 'intel unit', 'intel-unit')
  )
);

-- 11) Storage bucket for generated PDF reports
INSERT INTO storage.buckets (id, name, public)
VALUES ('report_files', 'report_files', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated can read report files" ON storage.objects;
CREATE POLICY "Authenticated can read report files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'report_files');

DROP POLICY IF EXISTS "Personnel can upload own report files" ON storage.objects;
CREATE POLICY "Personnel can upload own report files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'report_files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Intel can manage report files" ON storage.objects;
CREATE POLICY "Intel can manage report files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'report_files'
  AND EXISTS (
    SELECT 1 FROM admin a
    WHERE a.admin_id = auth.uid()
      AND LOWER(a.role) IN ('admin', 'intel unit', 'intel-unit')
  )
)
WITH CHECK (
  bucket_id = 'report_files'
  AND EXISTS (
    SELECT 1 FROM admin a
    WHERE a.admin_id = auth.uid()
      AND LOWER(a.role) IN ('admin', 'intel unit', 'intel-unit')
  )
);

DROP POLICY IF EXISTS "Owner or intel delete report files" ON storage.objects;
CREATE POLICY "Owner or intel delete report files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'report_files'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM admin a
      WHERE a.admin_id = auth.uid()
        AND LOWER(a.role) IN ('admin', 'intel unit', 'intel-unit')
    )
  )
);
