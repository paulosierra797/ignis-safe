import { summarizeUsers } from './progressService';

const average = (values) => (
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
);

const isPreTest = (test) => String(test?.name || '').toUpperCase().startsWith('PRE');
const isPostTest = (test) => String(test?.name || '').toUpperCase().startsWith('POST');

// Like-for-like comparison: only a user's module that has both a pre and a post
// result counts. Pre = first attempt, post = latest attempt (tests are newest
// first). Scores are stored 0-10, shown as 0-100.
const summarizePairs = (pairs) => {
  if (pairs.length === 0) return null;

  const pre = Math.round(average(pairs.map((pair) => pair.pre)));
  const post = Math.round(average(pairs.map((pair) => pair.post)));

  return {
    pre,
    post,
    gain: post - pre,
    learners: new Set(pairs.map((pair) => pair.userId)).size,
  };
};

const collectPairs = (users, moduleName) => users.flatMap((user) => (
  (user.modules || [])
    .filter((module) => !moduleName || module.name === moduleName)
    .flatMap((module) => {
      const pres = (module.tests || []).filter(isPreTest);
      const posts = (module.tests || []).filter(isPostTest);
      if (pres.length === 0 || posts.length === 0) return [];

      return [{
        userId: user.id,
        pre: Number(pres[pres.length - 1].score) * 10,
        post: Number(posts[0].score) * 10,
      }];
    })
));

export const buildPrePost = (users = []) => summarizePairs(collectPairs(users));

export const buildLearningDetails = (barangay, users = [], modules = []) => {
  const summary = summarizeUsers(users);

  const modulePerformance = modules.map((moduleName) => ({
    name: moduleName,
    prePost: summarizePairs(collectPairs(users, moduleName)),
  }));

  return {
    barangay,
    users,
    ...summary,
    started: summary.registered - summary.notStarted,
    prePost: buildPrePost(users),
    modulePerformance,
  };
};
