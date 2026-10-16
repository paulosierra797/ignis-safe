import { supabase } from './supabaseClient';

const FALLBACK_ERROR = 'Translation is temporarily unavailable. Your text is unchanged and manual editing is still available.';

const readFunctionError = async (error) => {
  try {
    const payload = await error?.context?.json?.();
    return typeof payload?.error === 'string' ? payload.error : FALLBACK_ERROR;
  } catch {
    return FALLBACK_ERROR;
  }
};

export async function translateContent({ texts, sourceLanguage, targetLanguage, section }) {
  try {
    const { data, error } = await supabase.functions.invoke('translate-content', {
      body: { texts, sourceLanguage, targetLanguage, section },
    });

    if (error) return { data: null, error: await readFunctionError(error) };
    if (!Array.isArray(data?.translations) || data.translations.length !== texts.length) {
      return { data: null, error: FALLBACK_ERROR };
    }
    return { data, error: null };
  } catch {
    return { data: null, error: FALLBACK_ERROR };
  }
}
