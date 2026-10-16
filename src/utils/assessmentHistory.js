// Pre and post must come from the same round when pairing a learner's scores.
// Attempts without round_no (database not migrated yet) count as Round 1.
export const keepLatestRoundAttempts = (attempts = [], getModuleId) => {
  const latestRound = {};
  attempts.forEach((attempt) => {
    const key = `${attempt.user_id}:${getModuleId(attempt)}`;
    latestRound[key] = Math.max(latestRound[key] || 1, Number(attempt.round_no) || 1);
  });
  return attempts.filter((attempt) => (
    (Number(attempt.round_no) || 1) === latestRound[`${attempt.user_id}:${getModuleId(attempt)}`]
  ));
};
