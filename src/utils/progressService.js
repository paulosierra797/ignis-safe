import { supabase } from './supabaseClient';

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ACCOUNT_ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const MODULE_DISPLAY_TITLES = {
  1: 'Module 1 - Fire Extinguisher: Basics, Types, and How to Use',
  2: 'Module 2 - House Fire: How to Get Out Safely During a Fire',
  3: 'Module 3 - Electrical Fire: Causes, Safe Actions, and Prevention',
  4: 'Module 4 - Kitchen Fire: What It Is, Common Types, and What To Do',
  5: 'Module 5 - Tenement Fire: What It Is, Common Causes, and What To Do',
};

const getModuleDisplayTitle = (module = {}) =>
  MODULE_DISPLAY_TITLES[toNumber(module.module_no, -1)] || module.title || `Module ${module.module_no ?? '-'}`;

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

// Mobile-app users save their barangay on their own profile record. The web
// admin only reads that value - it never keeps a second copy of the location.
export const UNSPECIFIED_BARANGAY_LABEL = 'Not Specified';

// "Brgy. salawag", "Barangay Salawag" and "SALAWAG" are the same barangay, so
// fold the stored text into one label instead of listing it three times.
export const normalizeBarangay = (value) => {
  const trimmed = String(value || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return UNSPECIFIED_BARANGAY_LABEL;

  const withoutPrefix = trimmed.replace(/^(barangay|brgy\.?|bgy\.?)\s+/i, '').trim();
  const base = withoutPrefix || trimmed;

  return base.replace(/\S+/g, (word) => (
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ));
};

export const getCompletionStatus = (overallPercent) => {
  const percent = toNumber(overallPercent, 0);
  if (percent >= 100) return 'Completed';
  if (percent > 0) return 'In Progress';
  return 'Not Started';
};

// Totals for whatever set of users is currently in view, so the summary cards
// follow the active barangay filter without needing a second query.
export const summarizeUsers = (rows = []) => {
  const registered = rows.length;
  const completed = rows.filter((row) => row.completionStatus === 'Completed').length;
  const inProgress = rows.filter((row) => row.completionStatus === 'In Progress').length;
  const notStarted = registered - completed - inProgress;

  return {
    registered,
    completed,
    inProgress,
    notStarted,
    completionRate: registered > 0 ? round((completed / registered) * 100, 0) : 0,
  };
};

// Barangay-level monitoring view: which barangays have taken the IGNIS SAFE
// training and how far they got. Derived from the same rows the table renders.
export const buildBarangaySummary = (rows = []) => {
  const groups = new Map();

  rows.forEach((row) => {
    const label = row.barangay || UNSPECIFIED_BARANGAY_LABEL;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(row);
  });

  return Array.from(groups.entries())
    .map(([label, groupRows]) => ({ barangay: label, ...summarizeUsers(groupRows) }))
    .sort((a, b) => {
      if (a.barangay === UNSPECIFIED_BARANGAY_LABEL) return 1;
      if (b.barangay === UNSPECIFIED_BARANGAY_LABEL) return -1;
      if (b.registered !== a.registered) return b.registered - a.registered;
      return a.barangay.localeCompare(b.barangay);
    });
};

export const getAccountStatus = (lastActivityAt) => {
  if (!lastActivityAt) return 'Inactive';

  const lastActivityTime = new Date(lastActivityAt).getTime();
  if (Number.isNaN(lastActivityTime)) return 'Inactive';

  return Date.now() - lastActivityTime < ACCOUNT_ACTIVITY_WINDOW_MS
    ? 'Active'
    : 'Inactive';
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
      const scorePercent = toNumber(attempt.score, 0);
      return {
        id: attempt.id,
        name: formatTestName(assessment.type),
        score: Math.max(0, Math.min(10, Math.round(scorePercent / 10))),
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
    moduleProgressRow?.learning_material_completed_at,
    moduleProgressRow?.simulation_completed_at,
    moduleProgressRow?.post_test_completed_at,
    moduleProgressRow?.updated_at,
    moduleProgressRow?.created_at,
    ...tests.map((test) => test.date),
  ]);

  return {
    id: `${profileId}-${module.id}`,
    moduleId: module.id,
    name: getModuleDisplayTitle(module),
    status,
    progress,
    tests,
    latestActivityAt: latestActivityDate ? latestActivityDate.toISOString() : null,
  };
};

export const getUserFeedback = async (userId) => {
  if (!userId) return { data: [], error: null };

  const { data, error } = await supabase
    .from('user_feedback')
    .select('id, rating, comment, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user feedback:', error);
    return { data: [], error: error.message };
  }

  return { data: data || [], error: null };
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
        .select('id, first_name, last_name, email, username, avatar_url, completed_simulations, last_simulation, registration_status, app_language_code, terms_accepted, terms_accepted_at, barangay, city, province, created_at, updated_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('modules')
        .select('id, module_no, title')
        .order('module_no', { ascending: true, nullsFirst: false }),
      supabase
        .from('module_progress')
        .select('user_id, module_id, pre_test_completed_at, learning_material_completed_at, simulation_completed_at, post_test_completed_at, created_at, updated_at'),
      supabase
        .from('assessment_attempts')
        .select('id, user_id, assessment_id, score, submitted_at, started_at, created_at, status'),
      supabase
        .from('assessments')
        .select('id, module_id, type, title'),
      supabase
        .from('admin')
        .select('admin_id'),
    ]);

    if (profilesError) throw profilesError;
    if (modulesError) throw modulesError;
    if (moduleProgressError) throw moduleProgressError;
    if (attemptsError) throw attemptsError;
    if (assessmentsError) throw assessmentsError;
    if (adminError) throw adminError;

    const safeProfiles = profiles || [];
    const safeModules = modules || [];
    const safeModuleProgressRows = moduleProgressRows || [];
    const safeAttempts = attempts || [];
    const safeAssessments = assessments || [];
    const safeAdminRows = adminRows || [];
    // Internal admin and personnel accounts can also have a profiles row, but
    // the Users page is the public mobile-app user directory. Keep back-office
    // accounts in their dedicated account-management views.
    const internalAccountIds = new Set(
      safeAdminRows.map((row) => String(row.admin_id || '').trim()).filter(Boolean)
    );
    const appUserProfiles = safeProfiles.filter((profile) => (
      !internalAccountIds.has(String(profile.id || '').trim())
    ));

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

    const rows = appUserProfiles.map((profile) => {
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
      const normalizedLastActivityAt = lastActivityAt ? lastActivityAt.toISOString() : null;

      const barangayLabel = normalizeBarangay(profile.barangay);

      return {
        id: profile.id,
        accountType: 'Mobile User',
        barangay: barangayLabel,
        barangayRaw: profile.barangay || null,
        city: profile.city || '',
        province: profile.province || '',
        name:
          `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
          profile.username ||
          profile.email ||
          'User',
        email: profile.email || '-',
        username: profile.username || '-',
        avatarUrl: profile.avatar_url || null,
        registrationStatus: profile.registration_status || 'Registered',
        appLanguageCode: profile.app_language_code || 'en',
        termsAccepted: profile.terms_accepted === true,
        termsAcceptedAt: profile.terms_accepted_at || null,
        completedSimulations: toNumber(profile.completed_simulations, 0),
        lastSimulation: profile.last_simulation || 'Not recorded',
        moduleProgress: `${completedModules}/${totalModules} Modules`,
        overallPercent,
        lastActivityAt: normalizedLastActivityAt,
        lastAccessedModule: latestModule?.name || 'N/A',
        accessStatus: getAccountStatus(normalizedLastActivityAt),
        completionStatus: getCompletionStatus(overallPercent),
        dateCreated: profile.created_at || null,
        modulesCompleted: completedModules,
        modules: userModules,
      };
    });

    // Only barangays that actually appear on a user record become options, so
    // the filter can never drift out of sync with the mobile app data.
    const barangays = Array.from(new Set(rows.map((row) => row.barangay)))
      .sort((a, b) => {
        if (a === UNSPECIFIED_BARANGAY_LABEL) return 1;
        if (b === UNSPECIFIED_BARANGAY_LABEL) return -1;
        return a.localeCompare(b);
      });

    return {
      data: {
        users: rows,
        modules: safeModules.map((module) => getModuleDisplayTitle(module)),
        barangays,
      },
      error: null,
    };
  } catch (error) {
    console.error('Error building progress page data:', error);
    return {
      data: { users: [], modules: [], barangays: [] },
      error: error.message,
    };
  }
};
