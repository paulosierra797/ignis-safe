import { supabase } from './supabaseClient';

const LANDING_CONTENT_TABLE = 'landing_content';
const LANDING_CONTENT_ID = 'default';

export const getLandingContentFromDb = async () => {
  try {
    const { data, error } = await supabase
      .from(LANDING_CONTENT_TABLE)
      .select('content, updated_at')
      .eq('id', LANDING_CONTENT_ID)
      .maybeSingle();

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

    const { data, error } = await supabase
      .from(LANDING_CONTENT_TABLE)
      .upsert(payload, { onConflict: 'id' })
      .select('updated_at')
      .maybeSingle();

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
