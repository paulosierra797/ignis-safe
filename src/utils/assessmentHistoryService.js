import { supabase } from './supabaseClient';
import { readAllRows } from './readAllRows';
import { buildBarangayLookup, resolveBarangayLabel, UNSPECIFIED_BARANGAY_LABEL } from './progressService';
import { getMobileUserLocation, OUTSIDE_DASMARINAS_LOCATION } from './mobileUserLocation';
import { toScore } from './assessmentHistory';

const DATA_CHANGED_EVENT = 'ignis-safe:data-changed';

// Missing relation / function codes from Postgres and PostgREST: the assessment
// rounds migration has not been applied to this database yet.
const NOT_SET_UP_CODES = new Set(['42P01', 'PGRST205', '42883', 'PGRST202']);

export const ASSESSMENT_ROUNDS_NOT_SET_UP =
  'Assessment history is not available yet because the assessment rounds database update has not been applied.';

const SKIP_REASON_LABELS = {
  not_a_learner: 'not a mobile app learner',
  no_submitted_assessment_in_current_round: 'no submitted assessment in the current round yet',
};

export const describeSkipReason = (reason) => SKIP_REASON_LABELS[reason] || 'skipped';

const emitDataChanged = (detail = {}) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, {
    detail: { scope: 'assessment_rounds', ...detail },
  }));
};

const toFriendlyError = (error) => {
  if (!error) return null;
  if (NOT_SET_UP_CODES.has(error.code)) return ASSESSMENT_ROUNDS_NOT_SET_UP;
  if (error.code === '42501') return 'Only an active Admin can open a reassessment round.';
  return error.message || 'Something went wrong. Please try again.';
};

const fullName = (profile = {}) => (
  `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
  || profile.username
  || profile.email
  || 'Learner'
);

const HISTORY_COLUMNS = [
  'user_id',
  'module_id',
  'module_no',
  'module_title',
  'round_no',
  'barangay_snapshot',
  'pre_score',
  'pre_submitted_at',
  'post_score',
  'post_submitted_at',
  'round_opened_at',
  'round_opened_by_name',
  'round_reason',
].join(', ');

// The view has no primary key; (user, module, round) is unique, so ordering by
// it keeps paged reads stable.
const readHistoryRows = async () => {
  const rows = [];
  const batchSize = 500;
  for (;;) {
    const { data, error } = await supabase
      .from('assessment_round_history')
      .select(HISTORY_COLUMNS)
      .order('user_id', { ascending: true })
      .order('module_id', { ascending: true })
      .order('round_no', { ascending: true })
      .range(rows.length, rows.length + batchSize - 1);
    if (error) return { rows: [], error };
    rows.push(...(data || []));
    if (!data || data.length < batchSize) return { rows, error: null };
  }
};

export const getAssessmentHistoryData = async () => {
  try {
    const [
      history,
      profiles,
      { data: adminRows, error: adminError },
      { data: modules, error: modulesError },
      { data: barangayRows, error: barangayError },
      { data: locationRows, error: locationError },
    ] = await Promise.all([
      readHistoryRows(),
      readAllRows(() => supabase
        .from('profiles')
        .select('id, first_name, last_name, email, username, barangay, city, province')
        .order('id', { ascending: true })),
      supabase.from('admin').select('admin_id'),
      supabase.from('modules').select('id, module_no, title').order('module_no', { ascending: true }),
      supabase
        .from('dasmarinas_barangays')
        .select('name, display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true, nullsFirst: false }),
      supabase.rpc('get_mobile_registration_locations'),
    ]);

    if (history.error) throw history.error;
    if (adminError) throw adminError;
    if (modulesError) throw modulesError;
    if (barangayError) throw barangayError;
    if (locationError) throw locationError;

    // Back-office accounts can also learn on mobile, but - as on the Users
    // page - only mobile app learners are part of learner analytics.
    const backOfficeIds = new Set((adminRows || []).map((row) => row.admin_id));
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    const locationsById = new Map((locationRows || []).map((row) => [row.user_id, row.location]));
    const lookup = buildBarangayLookup(barangayRows || []);

    // Grouping uses the barangay the learner declared when the attempt was
    // made (snapshot), falling back to the current self-declared value.
    const barangayLabel = (snapshot, profile) => {
      if (String(snapshot || '').trim()) return resolveBarangayLabel(snapshot, lookup);
      const location = getMobileUserLocation(profile, locationsById.get(profile.id));
      return location.key === 'outside'
        ? OUTSIDE_DASMARINAS_LOCATION
        : resolveBarangayLabel(profile.barangay, lookup);
    };

    const records = history.rows
      .filter((row) => !backOfficeIds.has(row.user_id) && profilesById.has(row.user_id))
      .map((row) => {
        const profile = profilesById.get(row.user_id);
        return {
          userId: row.user_id,
          learnerName: fullName(profile),
          email: profile.email || '',
          barangay: barangayLabel(row.barangay_snapshot, profile),
          moduleId: row.module_id,
          moduleNo: Number(row.module_no),
          moduleTitle: row.module_title || `Module ${row.module_no}`,
          roundNo: Number(row.round_no) || 1,
          preScore: toScore(row.pre_score),
          postScore: toScore(row.post_score),
          preSubmittedAt: row.pre_submitted_at || null,
          postSubmittedAt: row.post_submitted_at || null,
          roundOpenedAt: row.round_opened_at || null,
          roundOpenedByName: row.round_opened_by_name || null,
          roundReason: row.round_reason || null,
        };
      });

    const learnerIds = new Set(records.map((record) => record.userId));
    const learners = Array.from(learnerIds)
      .map((id) => {
        const profile = profilesById.get(id);
        return {
          id,
          name: fullName(profile),
          email: profile.email || '',
          barangay: barangayLabel(null, profile),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    // Filter options: official barangays (display order) that appear in the
    // history, then any other labels, then Outside / Not Specified last.
    const present = new Set(records.map((record) => record.barangay));
    const official = (barangayRows || []).map((row) => String(row.name || '').trim()).filter(Boolean);
    const trailing = [OUTSIDE_DASMARINAS_LOCATION, UNSPECIFIED_BARANGAY_LABEL];
    const barangays = [
      ...official.filter((name) => present.has(name)),
      ...Array.from(present)
        .filter((label) => !official.includes(label) && !trailing.includes(label))
        .sort((a, b) => a.localeCompare(b)),
      ...trailing.filter((label) => present.has(label)),
    ];

    return {
      data: {
        records,
        learners,
        modules: (modules || []).map((module) => ({
          id: module.id,
          moduleNo: Number(module.module_no),
          title: module.title,
        })),
        barangays,
        rounds: Array.from(new Set(records.map((record) => record.roundNo))).sort((a, b) => a - b),
      },
      error: null,
    };
  } catch (error) {
    console.error('Error loading assessment history:', error);
    return { data: null, error: toFriendlyError(error) };
  }
};

// Opens the next assessment round for every selected learner + module. The
// database checks the caller is an active Admin, preserves earlier results and
// writes one audit log entry per opened round.
export const openReassessmentRound = async ({ userIds = [], moduleIds = [], reason = '' }) => {
  const { data, error } = await supabase.rpc('open_assessment_reassessment', {
    p_user_ids: userIds,
    p_module_ids: moduleIds,
    p_reason: String(reason || '').trim() || null,
  });

  if (error) {
    console.error('Error opening reassessment round:', error);
    return { data: null, error: toFriendlyError(error) };
  }

  const result = {
    opened: Array.isArray(data?.opened) ? data.opened : [],
    skipped: Array.isArray(data?.skipped) ? data.skipped : [],
  };
  if (result.opened.length) emitDataChanged({ opened: result.opened.length });
  return { data: result, error: null };
};
