const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const PUBLIC_CONTENT_TIMEOUT_MS = 20000;

const requestPublicRows = async (path, { method = 'GET', body } = {}) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Public content service is not configured.');
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PUBLIC_CONTENT_TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Public content request failed (${response.status}).`);
    }

    return await response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const normalizeAttachments = (attachments) => {
  if (!Array.isArray(attachments)) return [];

  return attachments
    .map((item) => ({
      file_name: item?.file_name || item?.name || 'Attachment',
      file_path: item?.file_path || '',
      file_url: item?.file_url || item?.url || '',
      mime_type: item?.mime_type || '',
      size_bytes: Number(item?.size_bytes || item?.size || 0),
      is_image: Boolean(item?.is_image),
    }))
    .filter((item) => item.file_url || item.file_path);
};

export const getPublicLandingContent = async () => {
  try {
    const rows = await requestPublicRows(
      'landing_content?id=eq.default&select=content%2Cupdated_at&limit=1',
    );
    const row = rows?.[0] || null;

    return {
      data: row?.content || null,
      updatedAt: row?.updated_at || null,
      error: null,
    };
  } catch (error) {
    console.error('Error loading public landing content:', error);
    return { data: null, updatedAt: null, error: error.message };
  }
};

export const getPublicAnnouncements = async () => {
  try {
    const rows = await requestPublicRows(
      'announcements?audience_type=eq.public&select=announcement_id%2Ctitle%2Ccontent%2Cattachments%2Ccreated_at&order=created_at.desc',
    );

    return {
      data: (rows || []).map((row) => ({
        announcement_id: row.announcement_id,
        title: row.title || '',
        content: row.content || '',
        attachments: normalizeAttachments(row.attachments),
        created_at: row.created_at || null,
        audience_type: 'public',
      })),
      error: null,
    };
  } catch (error) {
    console.error('Error fetching public announcements:', error);
    return { data: [], error: error.message };
  }
};

// Public Trends come from get_public_trends(), which only ever returns
// aggregates. Anything malformed is dropped here instead of being shown, so the
// section can fall back to "Not enough data yet" rather than a wrong number.
const toCount = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
};

const toScoreOrNull = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const normalizeMonthSeries = (rows, fields) => (Array.isArray(rows) ? rows : [])
  .filter((row) => MONTH_KEY_PATTERN.test(String(row?.month || '')))
  .map((row) => fields.reduce(
    (point, field) => ({ ...point, [field]: toCount(row[field]) }),
    { month: row.month },
  ));

export const normalizePublicTrends = (raw) => {
  if (!raw || typeof raw !== 'object') return null;

  const assessment = raw.assessment || {};
  const averagePre = toScoreOrNull(assessment.average_pre);
  const averagePost = toScoreOrNull(assessment.average_post);
  const averageDifference = toScoreOrNull(assessment.average_difference);
  const hasAssessmentAverages = averagePre !== null && averagePost !== null && averageDifference !== null;

  return {
    generatedAt: raw.generated_at || null,
    minGroupSize: toCount(raw.min_group_size),
    registeredLearners: toCount(raw.registered_learners),
    registrationsByMonth: normalizeMonthSeries(raw.registrations_by_month, ['total']),
    barangays: {
      represented: toCount(raw.barangays?.represented),
      officialTotal: toCount(raw.barangays?.official_total),
      byMonth: normalizeMonthSeries(raw.barangays?.by_month, ['total']),
    },
    completedModules: toCount(raw.completed_modules),
    participationByMonth: normalizeMonthSeries(raw.participation_by_month, ['activities', 'active_learners']),
    modules: (Array.isArray(raw.modules) ? raw.modules : [])
      .filter((row) => Number.isInteger(Number(row?.module_no)))
      .map((row) => ({
        moduleNo: Number(row.module_no),
        title: String(row.title || ''),
        started: toCount(row.started),
        completed: toCount(row.completed),
      })),
    assessment: {
      comparableRecords: toCount(assessment.comparable_records),
      averagePre: hasAssessmentAverages ? averagePre : null,
      averagePost: hasAssessmentAverages ? averagePost : null,
      averageDifference: hasAssessmentAverages ? averageDifference : null,
    },
    assessmentByModule: (Array.isArray(raw.assessment_by_module) ? raw.assessment_by_module : [])
      .filter((row) => (
        Number.isInteger(Number(row?.module_no))
        && toScoreOrNull(row.average_pre) !== null
        && toScoreOrNull(row.average_post) !== null
      ))
      .map((row) => ({
        moduleNo: Number(row.module_no),
        comparableRecords: toCount(row.comparable_records),
        averagePre: Number(row.average_pre),
        averagePost: Number(row.average_post),
      })),
  };
};

export const getPublicTrends = async () => {
  try {
    const raw = await requestPublicRows('rpc/get_public_trends', { method: 'POST', body: {} });
    const data = normalizePublicTrends(raw);
    if (!data) throw new Error('Public trends response was empty.');
    return { data, error: null };
  } catch (error) {
    console.error('Error loading public trends:', error);
    return { data: null, error: error.message };
  }
};
