-- Knowledge Gain Analytics Schema
-- Run in Supabase SQL Editor

-- 1) Training modules
CREATE TABLE IF NOT EXISTS training_modules (
  module_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_code TEXT UNIQUE NOT NULL,
  module_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Assessment attempts (pre-test and post-test)
CREATE TABLE IF NOT EXISTS training_module_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admin(admin_id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES training_modules(module_id) ON DELETE CASCADE,
  attempt_type TEXT NOT NULL CHECK (attempt_type IN ('pre_test', 'post_test')),
  score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  total_items INTEGER,
  correct_items INTEGER,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 3) 3D simulation sessions
CREATE TABLE IF NOT EXISTS training_simulation_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admin(admin_id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES training_modules(module_id) ON DELETE CASCADE,
  completion_rate NUMERIC(5,2) NOT NULL CHECK (completion_rate >= 0 AND completion_rate <= 100),
  simulation_score NUMERIC(5,2) NOT NULL CHECK (simulation_score >= 0 AND simulation_score <= 100),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  hint_count INTEGER NOT NULL DEFAULT 0 CHECK (hint_count >= 0),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 4) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_attempts_admin_module_type
  ON training_module_attempts(admin_id, module_id, attempt_type, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_attempts_attempted_at
  ON training_module_attempts(attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_sim_sessions_admin_module
  ON training_simulation_sessions(admin_id, module_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sim_sessions_completed_at
  ON training_simulation_sessions(completed_at DESC);

-- 5) RLS
ALTER TABLE training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_module_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_simulation_sessions ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
DROP POLICY IF EXISTS "Read training modules" ON training_modules;
CREATE POLICY "Read training modules"
ON training_modules FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Read module attempts" ON training_module_attempts;
CREATE POLICY "Read module attempts"
ON training_module_attempts FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Read simulation sessions" ON training_simulation_sessions;
CREATE POLICY "Read simulation sessions"
ON training_simulation_sessions FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Insert/update own records
DROP POLICY IF EXISTS "Insert own module attempts" ON training_module_attempts;
CREATE POLICY "Insert own module attempts"
ON training_module_attempts FOR INSERT
WITH CHECK (admin_id::text = auth.uid()::text);

DROP POLICY IF EXISTS "Update own module attempts" ON training_module_attempts;
CREATE POLICY "Update own module attempts"
ON training_module_attempts FOR UPDATE
USING (admin_id::text = auth.uid()::text);

DROP POLICY IF EXISTS "Insert own simulation sessions" ON training_simulation_sessions;
CREATE POLICY "Insert own simulation sessions"
ON training_simulation_sessions FOR INSERT
WITH CHECK (admin_id::text = auth.uid()::text);

DROP POLICY IF EXISTS "Update own simulation sessions" ON training_simulation_sessions;
CREATE POLICY "Update own simulation sessions"
ON training_simulation_sessions FOR UPDATE
USING (admin_id::text = auth.uid()::text);

-- 6) Convenience view: latest pre/post per learner+module + normalized gain
CREATE OR REPLACE VIEW v_training_knowledge_gain AS
WITH latest_pre AS (
  SELECT DISTINCT ON (admin_id, module_id)
    admin_id,
    module_id,
    score AS pre_test_score,
    attempted_at AS pre_test_at
  FROM training_module_attempts
  WHERE attempt_type = 'pre_test'
  ORDER BY admin_id, module_id, attempted_at DESC
),
latest_post AS (
  SELECT DISTINCT ON (admin_id, module_id)
    admin_id,
    module_id,
    score AS post_test_score,
    attempted_at AS post_test_at
  FROM training_module_attempts
  WHERE attempt_type = 'post_test'
  ORDER BY admin_id, module_id, attempted_at DESC
),
latest_sim AS (
  SELECT DISTINCT ON (admin_id, module_id)
    admin_id,
    module_id,
    completion_rate,
    simulation_score,
    duration_seconds,
    error_count,
    hint_count,
    completed_at
  FROM training_simulation_sessions
  ORDER BY admin_id, module_id, completed_at DESC
)
SELECT
  COALESCE(lp.admin_id, lpo.admin_id, ls.admin_id) AS admin_id,
  COALESCE(lp.module_id, lpo.module_id, ls.module_id) AS module_id,
  tm.module_name,
  lp.pre_test_score,
  lpo.post_test_score,
  ls.completion_rate,
  ls.simulation_score,
  ls.duration_seconds,
  ls.error_count,
  ls.hint_count,
  CASE
    WHEN lp.pre_test_score IS NULL OR lpo.post_test_score IS NULL THEN NULL
    WHEN (100 - lp.pre_test_score) = 0 THEN 0
    ELSE ROUND(((lpo.post_test_score - lp.pre_test_score) / (100 - lp.pre_test_score))::numeric, 4)
  END AS normalized_gain,
  CASE
    WHEN lp.pre_test_score IS NULL OR lpo.post_test_score IS NULL THEN NULL
    ELSE ROUND((lpo.post_test_score - lp.pre_test_score)::numeric, 2)
  END AS raw_gain,
  GREATEST(
    COALESCE(lp.pre_test_at, 'epoch'::timestamptz),
    COALESCE(lpo.post_test_at, 'epoch'::timestamptz),
    COALESCE(ls.completed_at, 'epoch'::timestamptz)
  ) AS latest_activity_at
FROM latest_pre lp
FULL OUTER JOIN latest_post lpo
  ON lp.admin_id = lpo.admin_id AND lp.module_id = lpo.module_id
FULL OUTER JOIN latest_sim ls
  ON COALESCE(lp.admin_id, lpo.admin_id) = ls.admin_id
 AND COALESCE(lp.module_id, lpo.module_id) = ls.module_id
LEFT JOIN training_modules tm
  ON tm.module_id = COALESCE(lp.module_id, lpo.module_id, ls.module_id);

-- 7) Seed modules (optional)
INSERT INTO training_modules (module_code, module_name)
VALUES
  ('M1', 'Kitchen Fires'),
  ('M2', 'Electrical Fires'),
  ('M3', 'Fire Extinguisher')
ON CONFLICT (module_code) DO NOTHING;
