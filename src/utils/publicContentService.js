const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const PUBLIC_CONTENT_TIMEOUT_MS = 20000;

const requestPublicRows = async (path) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Public content service is not configured.');
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PUBLIC_CONTENT_TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        Accept: 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
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
