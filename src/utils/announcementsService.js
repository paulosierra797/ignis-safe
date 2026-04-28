import { supabase } from './supabaseClient';
import { logAdminActivity } from './usersService';

const ANNOUNCEMENTS_TABLE = 'announcements';
const ANNOUNCEMENT_ATTACHMENTS_BUCKET = 'announcement_attachments';
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ATTACHMENT_UPLOAD_TIMEOUT_MS = 120000;

const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/bmp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain'
];

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const sanitizeFileName = (name = '') =>
  String(name || 'attachment')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);

const withTimeout = (promise, timeoutMs, timeoutMessage) => {
  let timeoutId;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    })
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
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
      is_image: Boolean(item?.is_image)
    }))
    .filter((item) => item.file_url || item.file_path);
};

const uploadAnnouncementAttachments = async (currentUser, files) => {
  if (!Array.isArray(files) || files.length === 0) {
    return { data: [], error: null };
  }

  if (files.length > MAX_ATTACHMENTS) {
    return { data: [], error: `You can attach up to ${MAX_ATTACHMENTS} files.` };
  }

  const uploaded = [];

  try {
    for (const file of files) {
      const mimeType = String(file?.type || '').toLowerCase();
      const size = Number(file?.size || 0);

      if (!ALLOWED_ATTACHMENT_TYPES.includes(mimeType)) {
        return {
          data: [],
          error: `Unsupported file type for ${file?.name || 'Unknown file'} (${mimeType || 'unknown'}).`
        };
      }

      if (size > MAX_ATTACHMENT_SIZE) {
        return {
          data: [],
          error: `File too large: ${file?.name || 'Unknown file'} (max 10 MB).`
        };
      }

      const safeUserId = currentUser?.admin_id || 'unknown-user';
      const fileName = sanitizeFileName(file?.name);
      const filePath = `${safeUserId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileName}`;

      const { error: uploadError } = await withTimeout(
        supabase.storage
          .from(ANNOUNCEMENT_ATTACHMENTS_BUCKET)
          .upload(filePath, file, {
            contentType: mimeType || 'application/octet-stream',
            upsert: false
          }),
        ATTACHMENT_UPLOAD_TIMEOUT_MS,
        `Upload timed out for ${file?.name || 'attachment'}. Check bucket allowed MIME types and retry.`
      );

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl }
      } = supabase.storage.from(ANNOUNCEMENT_ATTACHMENTS_BUCKET).getPublicUrl(filePath);

      uploaded.push({
        file_name: file?.name || 'Attachment',
        file_path: filePath,
        file_url: publicUrl || '',
        mime_type: mimeType,
        size_bytes: size,
        is_image: mimeType.startsWith('image/')
      });
    }

    return { data: uploaded, error: null };
  } catch (error) {
    console.error('Error uploading announcement attachment:', error);
    return { data: [], error: error.message || 'Failed to upload attachment.' };
  }
};

const mapAnnouncement = (row = {}) => ({
  announcement_id: row.announcement_id,
  title: row.title || '',
  content: row.content || '',
  attachments: normalizeAttachments(row.attachments),
  audience_type: row.audience_type || 'public',
  target_personnel_id: row.target_personnel_id || null,
  created_at: row.created_at || null,
  created_by: row.created_by || null,
  created_by_name: [row.creator?.rank, row.creator?.first_name, row.creator?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || row.creator?.email || 'Admin',
  target_personnel_name: [row.target?.rank, row.target?.first_name, row.target?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || row.target?.email || ''
});

export const getPublicAnnouncements = async () => {
  try {
    const { data, error } = await supabase
      .from(ANNOUNCEMENTS_TABLE)
      .select('announcement_id, title, content, attachments, created_at')
      .eq('audience_type', 'public')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return {
      data: (data || []).map((row) => ({
        announcement_id: row.announcement_id,
        title: row.title || '',
        content: row.content || '',
        attachments: normalizeAttachments(row.attachments),
        created_at: row.created_at || null,
        audience_type: 'public'
      })),
      error: null
    };
  } catch (error) {
    console.error('Error fetching public announcements:', error);
    return { data: [], error: error.message };
  }
};

export const getPersonnelRecipients = async () => {
  try {
    const { data, error } = await supabase
      .from('admin')
      .select('admin_id, first_name, last_name, rank, email, status')
      .ilike('role', 'personnel')
      .eq('status', 'Active')
      .order('first_name', { ascending: true });

    if (error) throw error;

    return {
      data: (data || []).map((row) => ({
        admin_id: row.admin_id,
        name: [row.rank, row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.email || 'Personnel',
        status: row.status || 'Unknown',
        email: row.email || ''
      })),
      error: null
    };
  } catch (error) {
    console.error('Error fetching personnel recipients:', error);
    return { data: [], error: error.message };
  }
};

export const getAnnouncementsForUser = async (currentUser) => {
  try {
    const role = normalizeRole(currentUser?.role);
    const userId = currentUser?.admin_id;

    let query = supabase
      .from(ANNOUNCEMENTS_TABLE)
      .select(`
        announcement_id,
        title,
        content,
        attachments,
        audience_type,
        target_personnel_id,
        created_by,
        created_at,
        creator:admin!announcements_created_by_fkey(first_name, last_name, rank, email),
        target:admin!announcements_target_personnel_id_fkey(first_name, last_name, rank, email)
      `)
      .order('created_at', { ascending: false });

    if (role !== 'admin') {
      if (!userId) {
        query = query.eq('audience_type', 'all_personnel');
      } else {
        query = query.or(
          `audience_type.eq.all_personnel,audience_type.eq.specific_personnel,target_personnel_id.eq.${userId}`
        );
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      data: (data || []).map(mapAnnouncement),
      error: null
    };
  } catch (error) {
    console.error('Error fetching announcements:', error);
    return { data: [], error: error.message };
  }
};

export const createAnnouncement = async (currentUser, payload) => {
  try {
    if (normalizeRole(currentUser?.role) !== 'admin') {
      throw new Error('Only admin users can create announcements.');
    }

    const audienceType = String(payload?.audience_type || '').trim();
    const targetPersonnelId = payload?.target_personnel_id || null;

    if (!payload?.title?.trim()) {
      throw new Error('Title is required.');
    }

    if (!payload?.content?.trim()) {
      throw new Error('Content is required.');
    }

    if (!['public', 'all_personnel', 'specific_personnel'].includes(audienceType)) {
      throw new Error('Audience type is invalid.');
    }

    if (Array.isArray(payload?.attachments) && payload.attachments.length > MAX_ATTACHMENTS) {
      throw new Error(`You can attach up to ${MAX_ATTACHMENTS} files.`);
    }

    if (audienceType === 'specific_personnel' && !targetPersonnelId) {
      throw new Error('Please select a personnel recipient.');
    }

    const uploadedAttachments = await uploadAnnouncementAttachments(currentUser, payload?.attachments || []);
    if (uploadedAttachments.error) {
      throw new Error(uploadedAttachments.error);
    }

    const { data, error } = await supabase
      .from(ANNOUNCEMENTS_TABLE)
      .insert({
        title: payload.title.trim(),
        content: payload.content.trim(),
        attachments: uploadedAttachments.data,
        audience_type: audienceType,
        target_personnel_id: audienceType === 'specific_personnel' ? targetPersonnelId : null,
        created_by: currentUser.admin_id
      })
      .select('announcement_id')
      .single();

    if (error) throw error;

    await logAdminActivity({
      actorId: currentUser.admin_id,
      actorName: currentUser.name || currentUser.email || 'Admin User',
      action: 'Announcement Created',
      actionType: 'create',
      details: `Audience: ${audienceType}${targetPersonnelId ? ` (${targetPersonnelId})` : ''}`,
      status: 'SUCCESS',
      metadata: {
        announcementId: data?.announcement_id || null,
        audienceType,
        targetPersonnelId,
        attachmentCount: uploadedAttachments.data.length
      }
    });

    return { data, error: null };
  } catch (error) {
    console.error('Error creating announcement:', error);
    return { data: null, error: error.message };
  }
};

export const getAudienceLabel = (announcement) => {
  const audience = String(announcement?.audience_type || 'public');

  if (audience === 'all_personnel') {
    return 'All Personnel';
  }

  if (audience === 'specific_personnel') {
    return announcement?.target_personnel_name
      ? `Specific: ${announcement.target_personnel_name}`
      : 'Specific Personnel';
  }

  return 'Public';
};
