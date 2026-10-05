import { supabase } from './supabaseClient';

const CHART_TABLE = 'organizational_chart';
const CHART_KEY = 'main';

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
