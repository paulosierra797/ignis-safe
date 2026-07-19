import { supabase } from './supabaseClient';

const ACTIVITY_LOGS_TABLE = 'personnel_activity_logs';

// Best-effort logging: never throws and never blocks the calling flow.
// If the table has not been created yet (setup SQL not run), it silently
// no-ops instead of surfacing an error to the user.
export const logPersonnelActivity = async ({
  personnelId,
  activityType,
  action,
  details = '',
  status = 'SUCCESS',
  metadata = null,
  announcementId = null
}) => {
  try {
    if (!personnelId || !activityType || !action) {
      return { error: 'Missing required fields for personnel activity log.' };
    }

    const { error } = await supabase
      .from(ACTIVITY_LOGS_TABLE)
      .insert({
        personnel_id: personnelId,
        activity_type: activityType,
        action,
        details,
        status,
        metadata,
        announcement_id: announcementId
      });

    if (error) {
      if (error.code === '42P01') {
        console.warn('personnel_activity_logs table does not exist yet. Run personnel_activity_logs_setup.sql to enable Audit Logs.');
        return { error: null };
      }
      // A unique-index conflict means this exact activity was already logged
      // (e.g. an announcement acknowledgment retried after a partial failure)
      // — treat it as already-recorded rather than a failure.
      if (error.code === '23505') {
        return { error: null };
      }
      console.error('Database error inserting personnel activity log:', error);
      throw error;
    }

    return { error: null };
  } catch (error) {
    console.error('Could not record personnel activity log:', error);
    return { error: error.message };
  }
};

export const getPersonnelActivityLogs = async (personnelId) => {
  try {
    if (!personnelId) {
      return { data: [], error: 'Missing personnel id.' };
    }

    const { data, error } = await supabase
      .from(ACTIVITY_LOGS_TABLE)
      .select('log_id, activity_type, action, details, status, performed_at')
      .eq('personnel_id', personnelId)
      .order('performed_at', { ascending: false });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching personnel activity logs:', error);
    if (error?.code === '42P01') {
      return {
        data: [],
        error: 'Audit log table is missing. Run personnel_activity_logs_setup.sql first, then try again.'
      };
    }
    return { data: [], error: error.message };
  }
};
