import { supabase } from './supabaseClient';
import { getAllUsers } from './usersService';
import { logAdminActivity } from './usersService';
import { logPersonnelActivity } from './activityLogService';

const ANNOUNCEMENTS_TABLE = 'announcements';
const ANNOUNCEMENT_ATTACHMENTS_BUCKET = 'announcement_attachments';
const ANNOUNCEMENT_ACK_TABLE = 'announcement_acknowledgments';
const ANNOUNCEMENT_RECIPIENTS_TABLE = 'announcement_recipients';
const ANNOUNCEMENT_PERSONNEL_ARCHIVE_TABLE = 'announcement_personnel_archives';
const PERSONNEL_ACTIVITY_LOGS_TABLE = 'personnel_activity_logs';
const ANNOUNCEMENT_NUDGE_ACTIVITY_TYPE = 'announcement_acknowledgement_nudge';
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ATTACHMENT_UPLOAD_TIMEOUT_MS = 120000;
const ANNOUNCEMENT_NUDGE_COOLDOWN_MS = 5000;
const DATA_CHANGED_EVENT = 'ignis-safe:data-changed';
export const MAX_ANNOUNCEMENT_WORDS = 500;

export const countAnnouncementWords = (value = '') => {
  const normalizedValue = String(value || '').trim();
  return normalizedValue ? normalizedValue.split(/\s+/u).length : 0;
};

const emitDataChanged = (scope, detail = {}) => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, {
    detail: {
      scope,
      ...detail
    }
  }));
};

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

const formatPersonnelName = (person = {}) =>
  [person.rank, person.first_name, person.last_name].filter(Boolean).join(' ').trim() || person.email || 'Personnel';

const mapAnnouncement = (row = {}) => ({
  announcement_id: row.announcement_id,
  title: row.title || '',
  content: row.content || '',
  attachments: normalizeAttachments(row.attachments),
  audience_type: row.audience_type || 'public',
  acknowledgement_deadline: row.acknowledgement_deadline || null,
  // target_personnel_id is legacy (single-recipient rows written before
  // multi-select support). Current specific_personnel rows carry their
  // recipients in announcement_recipients and are attached below as
  // target_personnel_ids/target_personnel_names.
  target_personnel_id: row.target_personnel_id || null,
  target_personnel_ids: row.target_personnel_id ? [row.target_personnel_id] : [],
  created_at: row.created_at || null,
  created_by: row.created_by || null,
  created_by_name: [row.creator?.rank, row.creator?.first_name, row.creator?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || row.creator?.email || 'Admin',
  target_personnel_name: [row.target?.rank, row.target?.first_name, row.target?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || row.target?.email || '',
  target_personnel_names: row.target?.rank || row.target?.first_name || row.target?.last_name || row.target?.email
    ? [formatPersonnelName(row.target)]
    : [],
  is_archived: Boolean(row.is_archived),
  archived_at: row.archived_at || null,
  archived_by: row.archived_by || null,
  archived_by_name: [row.archiver?.rank, row.archiver?.first_name, row.archiver?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || row.archiver?.email || ''
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
    const { data, error } = await getAllUsers({ includePersonnelWorkspaceProfiles: true });

    if (error) throw error;
    const personnel = (data || [])
      .filter((row) => String(row.role || '').toLowerCase() === 'personnel')
      .filter((row) => row.status === 'Active')
      .sort((left, right) => String(left.first_name || '').localeCompare(String(right.first_name || '')));

    return {
      data: personnel.map((row) => ({
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

const fetchAnnouncementRecipients = async (announcementIds) => {
  const map = new Map();
  if (!announcementIds.length) return map;

  const { data, error } = await supabase
    .from(ANNOUNCEMENT_RECIPIENTS_TABLE)
    .select('announcement_id, personnel:admin(admin_id, first_name, last_name, rank, email)')
    .in('announcement_id', announcementIds);

  if (error) throw error;

  (data || []).forEach((row) => {
    if (!row.personnel) return;
    const existing = map.get(row.announcement_id) || [];
    existing.push({ admin_id: row.personnel.admin_id, name: formatPersonnelName(row.personnel) });
    map.set(row.announcement_id, existing);
  });

  return map;
};

const mergeAnnouncementRecipients = async (announcements) => {
  const specificAnnouncementIds = announcements
    .filter((row) => row.audience_type === 'specific_personnel')
    .map((row) => row.announcement_id);

  const recipientsMap = await fetchAnnouncementRecipients(specificAnnouncementIds);

  return announcements.map((row) => {
    if (row.audience_type !== 'specific_personnel') return row;

    const recipientRows = recipientsMap.get(row.announcement_id) || [];
    const byId = new Map(
      row.target_personnel_ids.map((personnelId, index) => [personnelId, row.target_personnel_names[index]])
    );
    recipientRows.forEach((recipient) => byId.set(recipient.admin_id, recipient.name));

    return {
      ...row,
      target_personnel_ids: Array.from(byId.keys()),
      target_personnel_names: Array.from(byId.values())
    };
  });
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
        acknowledgement_deadline,
        target_personnel_id,
        created_by,
        created_at,
        is_archived,
        archived_at,
        archived_by,
        creator:admin!announcements_created_by_fkey(first_name, last_name, rank, email),
        target:admin!announcements_target_personnel_id_fkey(first_name, last_name, rank, email),
        archiver:admin!announcements_archived_by_fkey(first_name, last_name, rank, email)
      `)
      .eq('is_archived', false)
      .order('created_at', { ascending: false });

    if (role !== 'admin') {
      if (!userId) {
        query = query.eq('audience_type', 'all_personnel');
      } else {
        const { data: recipientRows, error: recipientError } = await supabase
          .from(ANNOUNCEMENT_RECIPIENTS_TABLE)
          .select('announcement_id')
          .eq('personnel_id', userId);

        if (recipientError) throw recipientError;

        const orClauses = [
          'audience_type.eq.all_personnel',
          `and(audience_type.eq.specific_personnel,target_personnel_id.eq.${userId})`
        ];
        const recipientAnnouncementIds = (recipientRows || []).map((row) => row.announcement_id);
        if (recipientAnnouncementIds.length > 0) {
          orClauses.push(
            `and(audience_type.eq.specific_personnel,announcement_id.in.(${recipientAnnouncementIds.join(',')}))`
          );
        }

        query = query.or(orClauses.join(','));
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    let announcements = (data || []).map(mapAnnouncement);

    if (!announcements.length) {
      return { data: announcements, error: null };
    }

    announcements = await mergeAnnouncementRecipients(announcements);

    const announcementIds = announcements.map((row) => row.announcement_id);

    if (role === 'personnel' && userId) {
      const [ackResult, nudgeResult, personnelArchiveResult] = await Promise.all([
        supabase
          .from(ANNOUNCEMENT_ACK_TABLE)
          .select('announcement_id, acknowledged_at')
          .eq('personnel_id', userId)
          .in('announcement_id', announcementIds),
        supabase
          .from(PERSONNEL_ACTIVITY_LOGS_TABLE)
          .select('log_id, announcement_id, details, performed_at')
          .eq('personnel_id', userId)
          .eq('activity_type', ANNOUNCEMENT_NUDGE_ACTIVITY_TYPE)
          .in('announcement_id', announcementIds)
          .order('performed_at', { ascending: false }),
        supabase
          .from(ANNOUNCEMENT_PERSONNEL_ARCHIVE_TABLE)
          .select('announcement_id')
          .eq('personnel_id', userId)
          .in('announcement_id', announcementIds)
      ]);

      if (ackResult.error) throw ackResult.error;
      if (nudgeResult.error) throw nudgeResult.error;
      if (personnelArchiveResult.error) throw personnelArchiveResult.error;

      const ackByAnnouncement = new Map(
        (ackResult.data || []).map((row) => [row.announcement_id, row.acknowledged_at])
      );
      const nudgeByAnnouncement = new Map();

      (nudgeResult.data || []).forEach((row) => {
        const current = nudgeByAnnouncement.get(row.announcement_id);
        if (!current) {
          nudgeByAnnouncement.set(row.announcement_id, {
            count: 1,
            latestAt: row.performed_at,
            message: row.details || 'An administrator reminded you to review this announcement.'
          });
          return;
        }

        current.count += 1;
      });

      // Personnel-archived announcements are hidden from this account's own
      // active feed (and therefore from its pending-acknowledgement badge
      // count) without touching the global is_archived flag other
      // recipients and the admin view rely on.
      const personnelArchivedIds = new Set(
        (personnelArchiveResult.data || []).map((row) => row.announcement_id)
      );

      return {
        data: announcements
          .filter((row) => !personnelArchivedIds.has(row.announcement_id))
          .map((row) => {
            const nudge = nudgeByAnnouncement.get(row.announcement_id);

            return {
              ...row,
              acknowledged_by_current_user: ackByAnnouncement.has(row.announcement_id),
              acknowledged_at: ackByAnnouncement.get(row.announcement_id) || null,
              acknowledgement_nudge_count: nudge?.count || 0,
              latest_acknowledgement_nudge_at: nudge?.latestAt || null,
              acknowledgement_nudge_message: nudge?.message || ''
            };
          }),
        error: null
      };
    }

    if (role === 'admin') {
      const [personnelResult, ackResult, nudgeResult] = await Promise.all([
        getAllUsers({ includePersonnelWorkspaceProfiles: true }),
        supabase
          .from(ANNOUNCEMENT_ACK_TABLE)
          .select('announcement_id, personnel_id, acknowledged_at')
          .in('announcement_id', announcementIds),
        supabase
          .from(PERSONNEL_ACTIVITY_LOGS_TABLE)
          .select('announcement_id, personnel_id, performed_at, action, metadata')
          .eq('activity_type', ANNOUNCEMENT_NUDGE_ACTIVITY_TYPE)
          .in('announcement_id', announcementIds)
          .order('performed_at', { ascending: true })
      ]);

      if (personnelResult.error) throw personnelResult.error;
      if (ackResult.error) throw ackResult.error;
      if (nudgeResult.error) throw nudgeResult.error;

      // announcement_id -> personnel_id -> [{ at, auto }] ordered oldest first
      const nudgeMap = new Map();
      (nudgeResult.data || []).forEach((nudgeRow) => {
        const byPersonnel = nudgeMap.get(nudgeRow.announcement_id) || new Map();
        const history = byPersonnel.get(nudgeRow.personnel_id) || [];
        history.push({
          at: nudgeRow.performed_at,
          auto: Boolean(nudgeRow.metadata?.auto)
        });
        byPersonnel.set(nudgeRow.personnel_id, history);
        nudgeMap.set(nudgeRow.announcement_id, byPersonnel);
      });

      const allPersonnel = (personnelResult.data || [])
        .filter((row) => String(row.role || '').toLowerCase() === 'personnel');
      const activePersonnel = allPersonnel
        .filter((row) => row.status === 'Active');
      const activePersonnelIds = new Set(activePersonnel.map((row) => row.admin_id));
      const personnelById = new Map(allPersonnel.map((row) => [row.admin_id, row]));
      const ackMap = new Map();

      (ackResult.data || []).forEach((row) => {
        const existing = ackMap.get(row.announcement_id) || new Map();
        existing.set(row.personnel_id, row.acknowledged_at);
        ackMap.set(row.announcement_id, existing);
      });

      return {
        data: announcements.map((row) => {
          const acknowledgements = ackMap.get(row.announcement_id) || new Map();
          const nudgesByPersonnel = nudgeMap.get(row.announcement_id) || new Map();
          const recipientIds = row.audience_type === 'all_personnel'
            ? Array.from(activePersonnelIds)
            : row.audience_type === 'specific_personnel'
              ? row.target_personnel_ids
              : [];
          const recipientDetails = recipientIds.map((personnelId, index) => {
            const personnel = personnelById.get(personnelId);
            const fallbackName = row.target_personnel_names[index] || 'Personnel';
            const nudgeHistory = nudgesByPersonnel.get(personnelId) || [];

            return {
              personnel_id: personnelId,
              name: personnel
                ? [personnel.first_name, personnel.last_name].filter(Boolean).join(' ').trim() || personnel.email || 'Personnel'
                : fallbackName,
              rank: personnel?.rank || '',
              email: personnel?.email || '',
              status: personnel?.status || '',
              acknowledged_at: acknowledgements.get(personnelId) || null,
              acknowledgement_deadline: row.acknowledgement_deadline || null,
              nudge_count: nudgeHistory.length,
              nudge_history: nudgeHistory
            };
          });
          const acknowledgedPersonnel = recipientDetails.filter((person) => person.acknowledged_at);
          const pendingPersonnelDetails = recipientDetails.filter((person) => !person.acknowledged_at);
          const totalNudges = recipientDetails.reduce((sum, person) => sum + person.nudge_count, 0);

          return {
            ...row,
            acknowledgement_summary: {
              acknowledgedCount: acknowledgedPersonnel.length,
              totalRecipients: recipientDetails.length
            },
            acknowledgement_personnel: {
              acknowledged: acknowledgedPersonnel,
              pending: pendingPersonnelDetails
            },
            // Full per-recipient tracking (acknowledged first is not implied —
            // ordered the same as recipientIds) for the admin Nudge Tracking
            // panel: Name | Acknowledged/Pending | Deadline | Nudge Count | History.
            acknowledgement_tracking: recipientDetails,
            acknowledgement_tracking_summary: {
              totalRecipients: recipientDetails.length,
              acknowledgedCount: acknowledgedPersonnel.length,
              pendingCount: pendingPersonnelDetails.length,
              totalNudges
            },
            pending_personnel: pendingPersonnelDetails.map((person) => person.name)
          };
        }),
        error: null
      };
    }

    return {
      data: announcements,
      error: null
    };
  } catch (error) {
    console.error('Error fetching announcements:', error);
    return { data: [], error: error.message };
  }
};

export const nudgeAnnouncementPersonnel = async (
  currentUser,
  announcementId,
  announcementTitle,
  personnelIds
) => {
  try {
    if (normalizeRole(currentUser?.role) !== 'admin') {
      throw new Error('Only admin users can send acknowledgement reminders.');
    }

    const recipients = Array.from(
      new Set((Array.isArray(personnelIds) ? personnelIds : []).filter(Boolean))
    );

    if (!announcementId || recipients.length === 0) {
      throw new Error('Select at least one pending personnel to nudge.');
    }

    const cooldownStartedAt = new Date(Date.now() - ANNOUNCEMENT_NUDGE_COOLDOWN_MS).toISOString();
    const { data: recentNudges, error: recentNudgesError } = await supabase
      .from(PERSONNEL_ACTIVITY_LOGS_TABLE)
      .select('personnel_id, performed_at')
      .eq('activity_type', ANNOUNCEMENT_NUDGE_ACTIVITY_TYPE)
      .eq('announcement_id', announcementId)
      .in('personnel_id', recipients)
      .gte('performed_at', cooldownStartedAt);

    if (recentNudgesError) throw recentNudgesError;

    const coolingDownIds = new Set((recentNudges || []).map((row) => row.personnel_id));
    const availableRecipients = recipients.filter((personnelId) => !coolingDownIds.has(personnelId));

    if (availableRecipients.length === 0) {
      throw new Error('Please wait 5 seconds before sending another reminder.');
    }

    const safeTitle = String(announcementTitle || 'this announcement').trim().slice(0, 120);
    const details = `Please review and acknowledge "${safeTitle}".`;
    const { data, error } = await supabase
      .from(PERSONNEL_ACTIVITY_LOGS_TABLE)
      .insert(availableRecipients.map((personnelId) => ({
        personnel_id: personnelId,
        activity_type: ANNOUNCEMENT_NUDGE_ACTIVITY_TYPE,
        action: 'Acknowledgement Reminder',
        details,
        status: 'NOTICE',
        announcement_id: announcementId,
        metadata: {
          announcement_id: announcementId,
          announcement_title: safeTitle,
          nudged_by: currentUser.admin_id,
          auto: false
        }
      })))
      .select('personnel_id, performed_at');

    if (error) throw error;

    await logAdminActivity({
      actorId: currentUser.admin_id,
      actorName: currentUser.name || currentUser.email || 'Admin User',
      action: 'Announcement Reminder Sent',
      actionType: 'notify',
      details: `Sent an acknowledgement reminder to ${availableRecipients.length} personnel for "${safeTitle}".`,
      status: 'SUCCESS',
      metadata: {
        announcementId,
        personnelIds: availableRecipients
      }
    });

    emitDataChanged('announcements', {
      announcementId,
      action: 'nudged',
      personnelIds: availableRecipients
    });

    return {
      data: data || [],
      skippedPersonnelIds: Array.from(coolingDownIds),
      error: null
    };
  } catch (error) {
    console.error('Error sending announcement reminder:', error);
    return { data: [], error: error.message };
  }
};

export const acknowledgeAnnouncement = async (currentUser, announcementId, announcementTitle = '') => {
  try {
    const role = normalizeRole(currentUser?.role);
    const personnelId = currentUser?.admin_id;

    if (role !== 'personnel') {
      return { data: null, error: 'Only personnel can acknowledge announcements.' };
    }

    if (!personnelId || !announcementId) {
      return { data: null, error: 'Missing personnel or announcement id.' };
    }

    const { data, error } = await supabase
      .from(ANNOUNCEMENT_ACK_TABLE)
      .upsert(
        {
          announcement_id: announcementId,
          personnel_id: personnelId,
          acknowledged_at: new Date().toISOString()
        },
        {
          onConflict: 'announcement_id,personnel_id',
          ignoreDuplicates: false
        }
      )
      .select('ack_id, announcement_id, personnel_id, acknowledged_at')
      .single();

    if (error) {
      console.error('Database error inserting announcement_acknowledgments row:', error);
      throw error;
    }

    // The acknowledgment write above is idempotent (upsert on announcement_id+
    // personnel_id), so if this audit-log write fails we can safely surface the
    // error and let the caller retry without creating duplicate acknowledgments.
    const { error: auditError } = await logPersonnelActivity({
      personnelId,
      activityType: 'announcement_acknowledged',
      action: 'Announcement Acknowledged',
      details: 'Reviewed and acknowledged the assigned announcement.',
      status: 'SUCCESS',
      announcementId,
      metadata: {
        announcement_id: announcementId,
        announcement_title: announcementTitle || ''
      }
    });

    if (auditError) {
      console.error('Database error recording announcement acknowledgment audit log:', auditError);
      throw new Error(`Acknowledgment audit log failed: ${auditError}`);
    }

    emitDataChanged('announcements', { announcementId, personnelId });

    return { data, error: null };
  } catch (error) {
    console.error('Error acknowledging announcement:', error);
    return { data: null, error: error.message };
  }
};

// Sidebar navigation is only blocked for a memorandum/announcement addressed
// specifically to this personnel account. Broadcast ("all_personnel") items
// are informational and must never lock navigation.
export const getPendingAcknowledgementCount = async (currentUser) => {
  try {
    const role = normalizeRole(currentUser?.role);
    const personnelId = currentUser?.admin_id;

    if (role !== 'personnel' || !personnelId) {
      return { data: { pendingCount: 0 }, error: null };
    }

    const { data: announcements, error: announcementError } = await getAnnouncementsForUser(currentUser);
    if (announcementError) {
      return { data: { pendingCount: 0 }, error: announcementError };
    }

    const pendingAnnouncements = (announcements || []).filter((row) =>
      row.audience_type === 'specific_personnel' &&
      row.target_personnel_ids.includes(personnelId) &&
      !row.acknowledged_by_current_user
    );
    const pendingNudges = (announcements || [])
      .filter((row) =>
        !row.acknowledged_by_current_user &&
        row.latest_acknowledgement_nudge_at
      )
      .sort((left, right) =>
        new Date(right.latest_acknowledgement_nudge_at).getTime() -
        new Date(left.latest_acknowledgement_nudge_at).getTime()
      );

    return {
      data: {
        pendingCount: pendingAnnouncements.length,
        pendingNudgeCount: pendingNudges.length,
        latestNudge: pendingNudges[0]
          ? {
              announcementId: pendingNudges[0].announcement_id,
              title: pendingNudges[0].title,
              message: pendingNudges[0].acknowledgement_nudge_message,
              sentAt: pendingNudges[0].latest_acknowledgement_nudge_at,
              deadline: pendingNudges[0].acknowledgement_deadline || null,
              // Urgent once the acknowledgement deadline has passed — mirrors the
              // "Overdue" signal used by the admin Nudge Tracking panel.
              isUrgent: Boolean(
                pendingNudges[0].acknowledgement_deadline &&
                  new Date(pendingNudges[0].acknowledgement_deadline).getTime() <= Date.now()
              )
            }
          : null
      },
      error: null
    };
  } catch (error) {
    console.error('Error loading pending acknowledgements:', error);
    return { data: { pendingCount: 0 }, error: error.message };
  }
};

export const createAnnouncement = async (currentUser, payload) => {
  try {
    if (normalizeRole(currentUser?.role) !== 'admin') {
      throw new Error('Only admin users can create announcements.');
    }

    const audienceType = String(payload?.audience_type || '').trim();
    const targetPersonnelIds = Array.from(
      new Set((Array.isArray(payload?.target_personnel_ids) ? payload.target_personnel_ids : []).filter(Boolean))
    );

    if (!payload?.title?.trim()) {
      throw new Error('Title is required.');
    }

    if (!payload?.content?.trim()) {
      throw new Error('Content is required.');
    }

    if (countAnnouncementWords(payload.content) > MAX_ANNOUNCEMENT_WORDS) {
      throw new Error(`Announcement messages cannot exceed ${MAX_ANNOUNCEMENT_WORDS} words.`);
    }

    if (!['public', 'all_personnel', 'specific_personnel'].includes(audienceType)) {
      throw new Error('Audience type is invalid.');
    }

    if (Array.isArray(payload?.attachments) && payload.attachments.length > MAX_ATTACHMENTS) {
      throw new Error(`You can attach up to ${MAX_ATTACHMENTS} files.`);
    }

    if (audienceType === 'specific_personnel' && targetPersonnelIds.length === 0) {
      throw new Error('Please select at least one personnel recipient.');
    }

    // Acknowledgement deadline is optional and only meaningful for the two
    // personnel-targeted audiences. It is silently ignored for Public.
    let acknowledgementDeadline = null;
    if (audienceType !== 'public' && payload?.acknowledgement_deadline) {
      const deadlineDate = new Date(payload.acknowledgement_deadline);
      if (Number.isNaN(deadlineDate.getTime())) {
        throw new Error('The acknowledgement deadline is not a valid date and time.');
      }
      if (deadlineDate.getTime() <= Date.now()) {
        throw new Error('The acknowledgement deadline must be in the future.');
      }
      acknowledgementDeadline = deadlineDate.toISOString();
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
        acknowledgement_deadline: acknowledgementDeadline,
        target_personnel_id: null,
        created_by: currentUser.admin_id
      })
      .select('announcement_id')
      .single();

    if (error) throw error;

    if (audienceType === 'specific_personnel' && targetPersonnelIds.length > 0) {
      const { error: recipientsError } = await supabase
        .from(ANNOUNCEMENT_RECIPIENTS_TABLE)
        .insert(targetPersonnelIds.map((personnelId) => ({
          announcement_id: data.announcement_id,
          personnel_id: personnelId
        })));

      if (recipientsError) throw recipientsError;
    }

    await logAdminActivity({
      actorId: currentUser.admin_id,
      actorName: currentUser.name || currentUser.email || 'Admin User',
      action: 'Announcement Created',
      actionType: 'create',
      details: `Audience: ${audienceType}${targetPersonnelIds.length ? ` (${targetPersonnelIds.join(', ')})` : ''}`,
      status: 'SUCCESS',
      metadata: {
        announcementId: data?.announcement_id || null,
        audienceType,
        targetPersonnelIds,
        attachmentCount: uploadedAttachments.data.length,
        acknowledgementDeadline
      }
    });

    return { data, error: null };
  } catch (error) {
    console.error('Error creating announcement:', error);
    return { data: null, error: error.message };
  }
};

export const archiveAnnouncement = async (currentUser, announcementId) => {
  try {
    if (normalizeRole(currentUser?.role) !== 'admin') {
      throw new Error('Only admin users can archive announcements.');
    }

    if (!announcementId) {
      throw new Error('Missing announcement id.');
    }

    const { error } = await supabase
      .from(ANNOUNCEMENTS_TABLE)
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by: currentUser.admin_id
      })
      .eq('announcement_id', announcementId);

    if (error) throw error;

    await logAdminActivity({
      actorId: currentUser.admin_id,
      actorName: currentUser.name || currentUser.email || 'Admin User',
      action: 'Announcement Archived',
      actionType: 'archive',
      details: `Announcement ${announcementId} archived.`,
      status: 'SUCCESS',
      metadata: { announcementId }
    });

    emitDataChanged('announcements', { announcementId, action: 'archived' });

    return { data: { announcementId }, error: null };
  } catch (error) {
    console.error('Error archiving announcement:', error);
    return { data: null, error: error.message };
  }
};

export const restoreAnnouncement = async (currentUser, announcementId) => {
  try {
    if (normalizeRole(currentUser?.role) !== 'admin') {
      throw new Error('Only admin users can restore announcements.');
    }

    if (!announcementId) {
      throw new Error('Missing announcement id.');
    }

    const { error } = await supabase
      .from(ANNOUNCEMENTS_TABLE)
      .update({
        is_archived: false,
        archived_at: null,
        archived_by: null
      })
      .eq('announcement_id', announcementId);

    if (error) throw error;

    await logAdminActivity({
      actorId: currentUser.admin_id,
      actorName: currentUser.name || currentUser.email || 'Admin User',
      action: 'Announcement Restored',
      actionType: 'restore',
      details: `Announcement ${announcementId} restored.`,
      status: 'SUCCESS',
      metadata: { announcementId }
    });

    emitDataChanged('announcements', { announcementId, action: 'restored' });

    return { data: { announcementId }, error: null };
  } catch (error) {
    console.error('Error restoring announcement:', error);
    return { data: null, error: error.message };
  }
};

export const getArchivedAnnouncements = async (currentUser) => {
  try {
    if (normalizeRole(currentUser?.role) !== 'admin') {
      return { data: [], error: 'Only admin users can view archived announcements.' };
    }

    const { data, error } = await supabase
      .from(ANNOUNCEMENTS_TABLE)
      .select(`
        announcement_id,
        title,
        content,
        attachments,
        audience_type,
        acknowledgement_deadline,
        target_personnel_id,
        created_by,
        created_at,
        is_archived,
        archived_at,
        archived_by,
        creator:admin!announcements_created_by_fkey(first_name, last_name, rank, email),
        target:admin!announcements_target_personnel_id_fkey(first_name, last_name, rank, email),
        archiver:admin!announcements_archived_by_fkey(first_name, last_name, rank, email)
      `)
      .eq('is_archived', true)
      .order('archived_at', { ascending: false });

    if (error) throw error;

    const archived = (data || []).map(mapAnnouncement);
    return { data: await mergeAnnouncementRecipients(archived), error: null };
  } catch (error) {
    console.error('Error fetching archived announcements:', error);
    return { data: [], error: error.message };
  }
};

export const archivePersonnelAnnouncement = async (currentUser, announcementId) => {
  try {
    const role = normalizeRole(currentUser?.role);
    const personnelId = currentUser?.admin_id;

    if (role !== 'personnel') {
      throw new Error('Only personnel can archive their own announcements.');
    }

    if (!personnelId || !announcementId) {
      throw new Error('Missing personnel or announcement id.');
    }

    const { error } = await supabase
      .from(ANNOUNCEMENT_PERSONNEL_ARCHIVE_TABLE)
      .upsert(
        {
          announcement_id: announcementId,
          personnel_id: personnelId,
          archived_at: new Date().toISOString()
        },
        {
          onConflict: 'announcement_id,personnel_id',
          ignoreDuplicates: false
        }
      );

    if (error) throw error;

    await logPersonnelActivity({
      personnelId,
      activityType: 'announcement_archived',
      action: 'Announcement Archived',
      details: 'Archived an announcement from their personal feed.',
      status: 'SUCCESS',
      announcementId,
      metadata: { announcement_id: announcementId }
    });

    emitDataChanged('announcements', { announcementId, personnelId, action: 'personnel_archived' });

    return { data: { announcementId }, error: null };
  } catch (error) {
    console.error('Error archiving announcement for personnel:', error);
    return { data: null, error: error.message };
  }
};

export const restorePersonnelAnnouncement = async (currentUser, announcementId) => {
  try {
    const role = normalizeRole(currentUser?.role);
    const personnelId = currentUser?.admin_id;

    if (role !== 'personnel') {
      throw new Error('Only personnel can restore their own announcements.');
    }

    if (!personnelId || !announcementId) {
      throw new Error('Missing personnel or announcement id.');
    }

    const { error } = await supabase
      .from(ANNOUNCEMENT_PERSONNEL_ARCHIVE_TABLE)
      .delete()
      .eq('announcement_id', announcementId)
      .eq('personnel_id', personnelId);

    if (error) throw error;

    await logPersonnelActivity({
      personnelId,
      activityType: 'announcement_restored',
      action: 'Announcement Restored',
      details: 'Restored an announcement to their active feed.',
      status: 'SUCCESS',
      announcementId,
      metadata: { announcement_id: announcementId }
    });

    emitDataChanged('announcements', { announcementId, personnelId, action: 'personnel_restored' });

    return { data: { announcementId }, error: null };
  } catch (error) {
    console.error('Error restoring announcement for personnel:', error);
    return { data: null, error: error.message };
  }
};

export const getArchivedAnnouncementsForPersonnel = async (currentUser) => {
  try {
    const role = normalizeRole(currentUser?.role);
    const personnelId = currentUser?.admin_id;

    if (role !== 'personnel' || !personnelId) {
      return { data: [], error: 'Only personnel can view their archived announcements.' };
    }

    const { data: archiveRows, error: archiveError } = await supabase
      .from(ANNOUNCEMENT_PERSONNEL_ARCHIVE_TABLE)
      .select('announcement_id, archived_at')
      .eq('personnel_id', personnelId)
      .order('archived_at', { ascending: false });

    if (archiveError) throw archiveError;

    if (!archiveRows || archiveRows.length === 0) {
      return { data: [], error: null };
    }

    const personnelArchivedAtByAnnouncement = new Map(
      archiveRows.map((row) => [row.announcement_id, row.archived_at])
    );
    const announcementIds = archiveRows.map((row) => row.announcement_id);

    const [{ data, error }, ackResult] = await Promise.all([
      supabase
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
          is_archived,
          archived_at,
          archived_by,
          creator:admin!announcements_created_by_fkey(first_name, last_name, rank, email),
          target:admin!announcements_target_personnel_id_fkey(first_name, last_name, rank, email)
        `)
        .in('announcement_id', announcementIds),
      supabase
        .from(ANNOUNCEMENT_ACK_TABLE)
        .select('announcement_id, acknowledged_at')
        .eq('personnel_id', personnelId)
        .in('announcement_id', announcementIds)
    ]);

    if (error) throw error;
    if (ackResult.error) throw ackResult.error;

    let announcements = (data || []).map(mapAnnouncement);
    announcements = await mergeAnnouncementRecipients(announcements);

    const ackByAnnouncement = new Map(
      (ackResult.data || []).map((row) => [row.announcement_id, row.acknowledged_at])
    );

    const merged = announcements.map((row) => ({
      ...row,
      acknowledged_by_current_user: ackByAnnouncement.has(row.announcement_id),
      acknowledged_at: ackByAnnouncement.get(row.announcement_id) || null,
      personnel_archived_at: personnelArchivedAtByAnnouncement.get(row.announcement_id) || null
    }));

    merged.sort((left, right) =>
      new Date(right.personnel_archived_at || 0).getTime() - new Date(left.personnel_archived_at || 0).getTime()
    );

    return { data: merged, error: null };
  } catch (error) {
    console.error('Error fetching archived announcements for personnel:', error);
    return { data: [], error: error.message };
  }
};

export const getAudienceLabel = (announcement) => {
  const audience = String(announcement?.audience_type || 'public');

  if (audience === 'all_personnel') {
    return 'All Personnel';
  }

  if (audience === 'specific_personnel') {
    const names = Array.isArray(announcement?.target_personnel_names) ? announcement.target_personnel_names : [];

    if (names.length === 0) return 'Specific Personnel';
    if (names.length === 1) return `Specific: ${names[0]}`;
    if (names.length <= 2) return `Specific: ${names.join(', ')}`;
    return `Specific: ${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
  }

  return 'Public';
};
