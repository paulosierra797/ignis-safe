import { supabase } from './supabaseClient';

const normalizeText = (value) => String(value || '').trim().toLowerCase();

export const getLearningMaterialsAdminView = async () => {
  try {
    const { data, error } = await supabase
      .from('learning_material_admin_view')
      .select('*')
      .order('module_no', { ascending: true })
      .order('page_no', { ascending: true })
      .order('block_no', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching learning materials admin view:', error);
    return { data: null, error: error.message };
  }
};

export const getLearningMaterialFireClassGuides = async () => {
  try {
    const { data, error } = await supabase
      .from('learning_material_fire_class_guides')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching learning material fire class guides:', error);
    return { data: null, error: error.message };
  }
};
export const updateLearningMaterialBlock = async (blockId, updates) => {
  try {
    const { data, error } = await supabase
      .from('learning_material_blocks')
      .update(updates)
      .eq('id', blockId)
      .select()
      .single();

    if (error) throw error;

    return {
      data,
      error: null
    };
  } catch (error) {
    console.error('Error updating learning material block:', error);

    return {
      data: null,
      error: error.message
    };
  }
};

export const updateLearningMaterialModule = async (moduleNo, updates) => {
  try {
    const payload = {
      title: updates.title_en,
      title_tl: updates.title_tl,
      subtitle: updates.subtitle_en,
      subtitle_tl: updates.subtitle_tl,
    };

    const { data, error } = await supabase
      .from('learning_materials')
      .update(payload)
      .eq('module_no', moduleNo)
      .select()
      .single();

    if (error) throw error;

    return {
      data,
      error: null
    };
  } catch (error) {
    console.error('Error updating learning material module:', error);

    return {
      data: null,
      error: error.message
    };
  }
};

export const updateLearningMaterialPage = async (moduleNo, pageNo, updates) => {
  try {
    const primaryPayload = {
      title_en: updates.title_en,
      title_tl: updates.title_tl
    };

    const { data, error } = await supabase
      .from('learning_material_pages')
      .update(primaryPayload)
      .eq('module_no', moduleNo)
      .eq('page_no', pageNo)
      .select()
      .single();

    if (!error) {
      return {
        data,
        error: null
      };
    }

    const fallbackPayload = {
      page_title_en: updates.title_en,
      page_title_tl: updates.title_tl
    };

    const { data: fallbackData, error: fallbackError } = await supabase
      .from('learning_material_pages')
      .update(fallbackPayload)
      .eq('module_no', moduleNo)
      .eq('page_no', pageNo)
      .select()
      .single();

    if (fallbackError) throw fallbackError;

    return {
      data: fallbackData,
      error: null
    };
  } catch (error) {
    console.error('Error updating learning material page:', error);

    return {
      data: null,
      error: error.message
    };
  }
};

export const buildLearningMaterialModules = (rows = []) => {
  const moduleMap = new Map();

  rows.forEach((row) => {
    const moduleNo = row?.module_no;
    if (moduleNo == null) return;

    if (!moduleMap.has(moduleNo)) {
      moduleMap.set(moduleNo, {
        module_no: moduleNo,
        title: row.module_title_en || '',
        title_tl: row.module_title_tl || '',
        subtitle: row.module_subtitle_en || '',
        subtitle_tl: row.module_subtitle_tl || '',
        hero_asset: row.hero_asset || '',
        pages: new Map(),
        rowCount: 0,
        blockCount: 0
      });
    }

    const moduleEntry = moduleMap.get(moduleNo);
    moduleEntry.rowCount += 1;

    const pageNo = row.page_no;
    if (pageNo == null) return;

    if (!moduleEntry.pages.has(pageNo)) {
      moduleEntry.pages.set(pageNo, {
        page_no: pageNo,
        page_key: row.page_key || '',
        title_en: row.page_title_en || '',
        title_tl: row.page_title_tl || '',
        blocks: []
      });
    }

    const pageEntry = moduleEntry.pages.get(pageNo);
    const hasBlock = row.block_no != null || row.block_key || row.block_type || row.text_en || row.text_tl;
    if (!hasBlock) return;

    pageEntry.blocks.push({
  id: row.block_id || `${row.module_no}-${row.page_no}-${row.block_no}`,
  block_no: row.block_no,
      block_key: row.block_key || '',
      block_type: row.block_type || '',
      text_en: row.text_en || '',
      text_tl: row.text_tl || '',
       metadata: row.metadata || {},
      source_file: row.source_file || '',
      source_line: row.source_line || null,
      is_active: Boolean(row.is_active)
    });
    moduleEntry.blockCount += 1;
  });

  return Array.from(moduleMap.values())
    .map((moduleEntry) => ({
      ...moduleEntry,
      pages: Array.from(moduleEntry.pages.values()).sort((left, right) => left.page_no - right.page_no)
    }))
    .sort((left, right) => left.module_no - right.module_no);
};

export const filterLearningMaterialModules = (modules = [], searchQuery = '') => {
  const query = normalizeText(searchQuery);
  if (!query) return modules;

  return modules.filter((moduleEntry) => {
    const moduleMatches = [
      moduleEntry.title,
      moduleEntry.title_tl,
      moduleEntry.subtitle,
      moduleEntry.subtitle_tl,
      String(moduleEntry.module_no)
    ].some((value) => normalizeText(value).includes(query));

    if (moduleMatches) return true;

    return moduleEntry.pages.some((page) => {
      const pageMatches = [
        page.page_key,
        page.title_en,
        page.title_tl,
        String(page.page_no)
      ].some((value) => normalizeText(value).includes(query));

      if (pageMatches) return true;

      return page.blocks.some((block) => {
        return [
          block.block_key,
          block.block_type,
          block.text_en,
          block.text_tl,
          block.source_file,
          block.source_line == null ? '' : String(block.source_line)
        ].some((value) => normalizeText(value).includes(query));
      });
    });
  });
};
