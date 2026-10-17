import { useSyncExternalStore } from 'react';
import { supabase } from './supabaseClient';

// Client for the server-managed bulk import job. The server does the work; this
// module only starts it, polls real progress, and requests cancellation. It lives
// outside React so progress survives closing the modal and navigating between pages.

const API_URL = String(import.meta.env.VITE_ANALYTICS_API_URL || '').replace(/\/+$/, '');
const JOBS_PATH = '/api/admin/users/import-jobs';
const POLL_INTERVAL_MS = 1200;

export const isImportJobActive = (job) => job?.status === 'running' || job?.status === 'cancelling';

let state = {
  job: null,
  sourceRows: {}, // submitted rows by id, so failed ones can be retried or edited
  connectionLost: false,
  modalOpen: false,
  pendingOpen: false
};
const listeners = new Set();
let pollTimer = null;

const setState = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

const request = async (method, path, body) => {
  if (!API_URL) throw new Error('Personnel import requires the configured analytics API.');

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Please sign in as an administrator to continue.');

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = typeof json?.detail === 'string' ? json.detail : '';
    const error = new Error(detail || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return json?.data ?? null;
};

const schedulePoll = () => {
  clearTimeout(pollTimer);
  if (isImportJobActive(state.job)) pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
};

async function poll() {
  const id = state.job?.id;
  if (!id) return;
  try {
    const job = await request('GET', `${JOBS_PATH}/${id}`);
    if (state.job?.id !== id) return;
    setState({ job, connectionLost: false });
  } catch (error) {
    if (state.job?.id !== id) return;
    if (error.status === 404) {
      // The server no longer knows this job (for example after a restart).
      setState({ job: { ...state.job, status: 'lost' }, connectionLost: false });
      return;
    }
    setState({ connectionLost: true });
  }
  schedulePoll();
}

export const startImportJob = async ({ rows, sourceRows, fileName }) => {
  const job = await request('POST', JOBS_PATH, { file_name: fileName || null, rows });
  setState({
    job,
    sourceRows: Object.fromEntries(sourceRows.map((row) => [row.id, row])),
    connectionLost: false
  });
  schedulePoll();
  return job;
};

export const cancelImportJob = async () => {
  const id = state.job?.id;
  if (!id) return;
  const job = await request('POST', `${JOBS_PATH}/${id}/cancel`);
  if (state.job?.id === id) setState({ job });
  schedulePoll();
};

// Resume progress after a page reload.
export const loadActiveImportJob = async () => {
  if (state.job) return;
  try {
    const job = await request('GET', `${JOBS_PATH}/active`);
    if (job && isImportJobActive(job) && !state.job) {
      setState({ job });
      schedulePoll();
    }
  } catch {
    // Nothing to resume; stay quiet.
  }
};

export const dismissImportJob = () => {
  if (isImportJobActive(state.job)) return;
  clearTimeout(pollTimer);
  setState({ job: null, sourceRows: {}, connectionLost: false });
};

export const setImportModalOpen = (modalOpen) => setState({ modalOpen });
export const requestImportModalOpen = () => setState({ pendingOpen: true });
export const consumeImportModalRequest = () => setState({ pendingOpen: false });

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useImportJob = () => useSyncExternalStore(subscribe, () => state);
