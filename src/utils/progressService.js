import { supabase } from './supabaseClient';

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value, decimals = 0) => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const normalizeAssessmentType = (value = '') =>
  String(value || '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .trim();

const formatTestName = (type = '') => {
  const normalized = normalizeAssessmentType(type);
  if (!normalized) return 'ASSESSMENT';
  return normalized.replace(/_/g, ' ').toUpperCase();
};

const getAttemptTimestamp = (attempt = {}) => {
  return attempt.submitted_at || attempt.started_at || attempt.created_at || null;
};

const getMostRecentDate = (dates = []) => {
  return dates
    .filter(Boolean)
    .map((date) => new Date(date))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
};

const buildModuleProgress = ({ profileId, module, moduleProgressRow, attemptsForUser, assessmentsById }) => {
  const preDone = Boolean(moduleProgressRow?.pre_test_completed_at);
  const simulationDone = Boolean(moduleProgressRow?.simulation_completed_at);
  const postDone = Boolean(moduleProgressRow?.post_test_completed_at);

  const completedSteps = [preDone, simulationDone, postDone].filter(Boolean).length;
  const progress = round((completedSteps / 3) * 100, 0);

  let status = 'Not yet Started';
  if (progress >= 100) status = 'Completed';
  else if (progress > 0) status = 'In Progress';

  const tests = (attemptsForUser || [])
    .filter((attempt) => {
      const assessment = assessmentsById[attempt.assessment_id];
      return assessment?.module_id === module.id;
    })
    .map((attempt) => {
      const assessment = assessmentsById[attempt.assessment_id] || {};
      return {
        id: attempt.id,
        name: formatTestName(assessment.type),
        score: toNumber(attempt.score, 0),
        date: getAttemptTimestamp(attempt),
        status: 'COMPLETED',
      };
    })
    .sort((a, b) => {
      const aDate = new Date(a.date || 0).getTime();
      const bDate = new Date(b.date || 0).getTime();
      return bDate - aDate;
    });

  const latestActivityDate = getMostRecentDate([
    moduleProgressRow?.pre_test_completed_at,
    moduleProgressRow?.simulation_completed_at,
    moduleProgressRow?.post_test_completed_at,
    ...tests.map((test) => test.date),
  ]);

  return {
    id: `${profileId}-${module.id}`,
    moduleId: module.id,
    name: module.title,
    status,
    progress,
    tests,
    latestActivityAt: latestActivityDate ? latestActivityDate.toISOString() : null,
  };
};

export const getProgressPageData = async () => {
  try {
    const [
      { data: profiles, error: profilesError },
      { data: modules, error: modulesError },
      { data: moduleProgressRows, error: moduleProgressError },
      { data: attempts, error: attemptsError },
      { data: assessments, error: assessmentsError },
      { data: adminRows, error: adminError },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, email, username, created_at, updated_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('modules')
        .select('id, module_no, title')
        .order('module_no', { ascending: true, nullsFirst: false }),
      supabase
        .from('module_progress')
        .select('user_id, module_id, pre_test_completed_at, simulation_completed_at, post_test_completed_at, created_at'),
      supabase
        .from('assessment_attempts')
        .select('id, user_id, assessment_id, score, submitted_at, started_at, created_at, status'),
      supabase
        .from('assessments')
        .select('id, module_id, type, title'),
      supabase
        .from('admin')
        .select('admin_id, status'),
    ]);

    if (profilesError) throw profilesError;
    if (modulesError) throw modulesError;
    if (moduleProgressError) throw moduleProgressError;
    if (attemptsError) throw attemptsError;
    if (assessmentsError) throw assessmentsError;

    if (adminError) {
      console.warn('Could not load admin status while building progress page data:', adminError);
    }

    const safeProfiles = profiles || [];
    const safeModules = modules || [];
    const safeModuleProgressRows = moduleProgressRows || [];
    const safeAttempts = attempts || [];
    const safeAssessments = assessments || [];
    const safeAdminRows = adminRows || [];

    const progressByUserModule = safeModuleProgressRows.reduce((accumulator, row) => {
      accumulator[`${row.user_id}-${row.module_id}`] = row;
      return accumulator;
    }, {});

    const attemptsByUser = safeAttempts.reduce((accumulator, row) => {
      if (!accumulator[row.user_id]) accumulator[row.user_id] = [];
      accumulator[row.user_id].push(row);
      return accumulator;
    }, {});

    const assessmentsById = safeAssessments.reduce((accumulator, row) => {
      accumulator[row.id] = row;
      return accumulator;
    }, {});

    const adminStatusById = safeAdminRows.reduce((accumulator, row) => {
      accumulator[row.admin_id] = row.status;
      return accumulator;
    }, {});

    const rows = safeProfiles.map((profile) => {
      const attemptsForUser = attemptsByUser[profile.id] || [];

      const userModules = safeModules.map((module) => {
        const moduleProgressRow = progressByUserModule[`${profile.id}-${module.id}`];
        return buildModuleProgress({
          profileId: profile.id,
          module,
          moduleProgressRow,
          attemptsForUser,
          assessmentsById,
        });
      });

      const totalModules = userModules.length;
      const completedModules = userModules.filter((item) => item.progress >= 100).length;
      const progressSum = userModules.reduce((sum, item) => sum + item.progress, 0);
      const overallPercent = totalModules > 0 ? round(progressSum / totalModules, 0) : 0;

      const latestModule = userModules
        .filter((item) => item.latestActivityAt)
        .sort((a, b) => new Date(b.latestActivityAt).getTime() - new Date(a.latestActivityAt).getTime())[0] || null;

      const lastActivityAt = getMostRecentDate([
        latestModule?.latestActivityAt,
        profile.updated_at,
        profile.created_at,
      ]);

      return {
        id: profile.id,
        name:
          `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
          profile.username ||
          profile.email ||
          'User',
        email: profile.email || '-',
        moduleProgress: `${completedModules}/${totalModules} Modules`,
        overallPercent,
        lastActivityAt: lastActivityAt ? lastActivityAt.toISOString() : null,
        lastAccessedModule: latestModule?.name || 'N/A',
        accessStatus: String(adminStatusById[profile.id] || 'Active').toUpperCase(),
        dateCreated: profile.created_at || null,
        modulesCompleted: completedModules,
        modules: userModules,
      };
    });

    return {
      data: {
        users: rows,
        modules: safeModules.map((module) => module.title),
      },
      error: null,
    };
  } catch (error) {
    console.error('Error building progress page data:', error);
    return {
      data: { users: [], modules: [] },
      error: error.message,
    };
  }
};
