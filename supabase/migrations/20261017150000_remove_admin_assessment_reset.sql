-- Remove the Admin-controlled assessment reset (Phase 2 reassessment).
--
-- Only the entry point is dropped. Nothing is deleted or rewritten:
--   * public.assessment_reassessments keeps every historical reset record.
--   * assessment_attempts.round_no, existing rounds, scores and progress stay.
--   * public.assessment_round_history and the round-assignment trigger stay, so
--     existing multi-round data keeps reading and writing correctly.
-- Without this function no Admin can open a new round, so every learner keeps
-- the one-attempt rule for Pre-Assessment and Post-Assessment.

drop function if exists public.open_assessment_reassessment(uuid[], uuid[], text);
