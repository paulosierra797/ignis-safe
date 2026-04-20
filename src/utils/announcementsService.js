import { supabase } from './supabaseClient';
import { logAdminActivity } from './usersService';

const ANNOUNCEMENTS_TABLE = 'announcements';

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const mapAnnouncement = (row = {}) => ({
  announcement_id: row.announcement_id,
  title: row.title || '',
  content: row.content || '',
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
      .select('announcement_id, title, content, created_at')
      .eq('audience_type', 'public')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return {
      data: (data || []).map((row) => ({
        announcement_id: row.announcement_id,
        title: row.title || '',
        content: row.content || '',
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
      .eq('role', 'personnel')
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
        audience_type,
        target_personnel_id,
        created_by,
        created_at,
        creator:admin!announcements_created_by_fkey(first_name, last_name, rank, email),
        target:admin!announcements_target_personnel_id_fkey(first_name, last_name, rank, email)
      `)
      .order('created_at', { ascending: false });

    if (role !== 'admin') {
      query = query
        .in('audience_type', ['all_personnel'])
        .or(`audience_type.eq.specific_personnel,target_personnel_id.eq.${userId}`);
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

    if (audienceType === 'specific_personnel' && !targetPersonnelId) {
      throw new Error('Please select a personnel recipient.');
    }

    const { data, error } = await supabase
      .from(ANNOUNCEMENTS_TABLE)
      .insert({
        title: payload.title.trim(),
        content: payload.content.trim(),
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
        targetPersonnelId
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
