import { supabase } from './supabaseClient';

// assessment_attempts.round_no comes from the assessment rounds migration
// (20261016130000_add_assessment_rounds_and_reassessment.sql). Until that is
// applied the column does not exist, so fall back to the original columns and
// let callers treat every attempt as Round 1 - existing analytics keep working
// either way.
const UNDEFINED_COLUMN = '42703';

export const selectAssessmentAttempts = async (columns) => {
  const withRound = await supabase.from('assessment_attempts').select(`${columns}, round_no`);
  if (withRound.error?.code === UNDEFINED_COLUMN) {
    return supabase.from('assessment_attempts').select(columns);
  }
  return withRound;
};
