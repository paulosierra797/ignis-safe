import { supabase } from './supabaseClient';
import { IMPORT_COLUMNS, normalizeImportRow } from './personnelImport';

const API_URL = String(import.meta.env.VITE_ANALYTICS_API_URL || '').replace(/\/+$/, '');
const safeRequest = async (action, rows) => {
  try {
    if (!API_URL) return { data: null, error: 'Personnel import is unavailable. Contact the administrator to configure the account service.' };
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) return { data: null, error: 'Please sign in as an administrator to continue.' };
    const records = rows.map((row) => {
      const normalized = normalizeImportRow(row);
      return { row_id: row.row_id, ...Object.fromEntries(IMPORT_COLUMNS.map(({ key }) => [key, normalized[key]])) };
    });
    const response = await fetch(`${API_URL}/api/admin/personnel-import/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ records }),
    });
    const body = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) return { data: null, error: 'Your administrator session has expired or does not have access. Please sign in again.' };
    if (!response.ok || !Array.isArray(body?.data?.results)) return { data: null, error: 'The import service could not complete this request. Please try again.' };
    return { data: body.data, error: null };
  } catch {
    return { data: null, error: action === 'create'
      ? 'The account service could not confirm the result. Retry these records to check their saved progress safely.'
      : 'Records could not be checked. Check your connection and validate again.' };
  }
};

export const validatePersonnelImport = (rows) => safeRequest('validate', rows);
export const createPersonnelImport = (rows) => safeRequest('create', rows);
