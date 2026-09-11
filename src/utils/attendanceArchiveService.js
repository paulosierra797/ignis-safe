import { supabase } from './supabaseClient';
import { readAllRows } from './readAllRows';

export async function getAttendanceArchiveIds() {
  const data = await readAllRows(() => supabase.from('attendance_archives').select('attendance_id').order('attendance_id'));
  return (data || []).map(row => row.attendance_id);
}

export async function setAttendanceArchived(attendanceId, archived) {
  if (!attendanceId) throw new Error('An attendance record is required.');
  const query = archived
    ? supabase.from('attendance_archives').insert({ attendance_id: attendanceId })
    : supabase.from('attendance_archives').delete().eq('attendance_id', attendanceId);
  const { data, error } = await query.select('attendance_id');
  if (archived && error?.code === '23505') return;
  if (error) throw new Error(error.message || 'Could not update the attendance archive.');
  if (!data?.length) throw new Error('The archive was not changed. Refresh and check your account permissions.');
}
