import { supabase } from './supabaseClient';

const LANDING_CONTENT_TABLE = 'landing_content';
const LANDING_CONTENT_ID = 'default';
const LANDING_CONTENT_TIMEOUT_MS = 20000;

const withTimeout = (promise, timeoutMs, timeoutMessage) => {
  let timeoutId;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
};

export const getLandingContentFromDb = async () => {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from(LANDING_CONTENT_TABLE)
        .select('content, updated_at')
        .eq('id', LANDING_CONTENT_ID)
        .maybeSingle(),
      LANDING_CONTENT_TIMEOUT_MS,
      'Loading landing content timed out. Please retry.'
    );

    if (error) throw error;

    return {
      data: data?.content || null,
      updatedAt: data?.updated_at || null,
      error: null,
    };
  } catch (error) {
    console.error('Error loading landing content from DB:', error);
    return { data: null, updatedAt: null, error: error.message };
  }
};

export const saveLandingContentToDb = async ({ content, updatedBy }) => {
  try {
    const payload = {
      id: LANDING_CONTENT_ID,
      content,
      updated_by: updatedBy || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await withTimeout(
      supabase
        .from(LANDING_CONTENT_TABLE)
        .upsert(payload, { onConflict: 'id' })
        .select('updated_at')
        .maybeSingle(),
      LANDING_CONTENT_TIMEOUT_MS,
      'Saving landing content timed out. Please check connection and try again.'
    );

    if (error) throw error;

    return {
      updatedAt: data?.updated_at || null,
      error: null,
    };
  } catch (error) {
    console.error('Error saving landing content to DB:', error);
    return { updatedAt: null, error: error.message };
  }
};
