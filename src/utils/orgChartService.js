import { supabase } from './supabaseClient';

const CHART_TABLE = 'organizational_chart';
const CHART_KEY = 'main';
const AVATAR_BUCKET = 'profile_pic';

export const getOrgChartConfig = async () => {
  try {
    const { data, error } = await supabase
      .from(CHART_TABLE)
      .select('chart_data, updated_at')
      .eq('config_key', CHART_KEY)
      .maybeSingle();

    if (error) throw error;

    return {
      data: data?.chart_data || null,
      updatedAt: data?.updated_at || null,
      error: null
    };
  } catch (error) {
    console.error('Error fetching organizational chart config:', error);
    return { data: null, updatedAt: null, error: error.message };
  }
};

export const saveOrgChartConfig = async (chartData, updatedBy = null) => {
  try {
    const payload = {
      config_key: CHART_KEY,
      chart_data: chartData,
      updated_by: updatedBy,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from(CHART_TABLE)
      .upsert(payload, { onConflict: 'config_key' })
      .select('chart_data, updated_at')
      .single();

    if (error) throw error;

    return {
      data: data?.chart_data || null,
      updatedAt: data?.updated_at || null,
      error: null
    };
  } catch (error) {
    console.error('Error saving organizational chart config:', error);
    return { data: null, updatedAt: null, error: error.message };
  }
};

export const uploadOrgChartAvatar = async (nodeId, file, actorId = 'admin') => {
  try {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return {
        data: null,
        error: 'Invalid file type. Please upload an image (JPEG, PNG, GIF, or WebP).'
      };
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return { data: null, error: 'File size exceeds 5MB. Please upload a smaller image.' };
    }

    const fileExt = file.name.split('.').pop() || 'jpg';
    const filePath = `org-chart/${actorId}/${nodeId}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl }
    } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);

    return { data: publicUrl, error: null };
  } catch (error) {
    console.error('Error uploading organizational chart avatar:', error);
    return { data: null, error: error.message };
  }
};
