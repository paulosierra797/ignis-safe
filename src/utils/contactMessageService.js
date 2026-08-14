import { supabase } from './supabaseClient';

const readFunctionErrorPayload = async (error) => {
  const response = error?.context;

  if (!response || typeof response.clone !== 'function') {
    return null;
  }

  try {
    return await response.clone().json();
  } catch {
    try {
      const text = await response.clone().text();
      return text ? { error: text } : null;
    } catch {
      return null;
    }
  }
};

export const sendContactMessage = async ({ name, email, topic, message }) => {
  try {
    const { data, error } = await supabase.functions.invoke('send-contact-message', {
      body: { name, email, topic, message },
    });

    if (error) {
      const payload = await readFunctionErrorPayload(error);
      return { success: false, error: payload?.error || error.message || 'Failed to send your message.' };
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Unexpected error sending contact message:', error);
    return { success: false, error: error.message || 'Failed to send your message.' };
  }
};
