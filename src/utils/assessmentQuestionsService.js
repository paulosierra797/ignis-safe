import { supabase } from './supabaseClient';

const QUESTIONS_TABLE = 'assessment_questions';
const OPTIONS_TABLE = 'assessment_options';
const DEFAULT_OPTION_KEYS = ['A', 'B', 'C', 'D'];

const mapQuestion = (row = {}) => ({
  id: row.id,
  assessment_id: row.assessment_id,
  question_no: Number(row.question_no || 0),
  prompt: row.prompt || '',
  explanation: row.explanation || '',
  is_active: Boolean(row.is_active),
  created_at: row.created_at || null,
  question_type: row.question_type || 'multiple_choice',
  prompt_tl: row.prompt_tl || '',
  explanation_tl: row.explanation_tl || ''
});

const mapOption = (row = {}) => ({
  id: row.id,
  question_id: row.question_id,
  option_key: row.option_key || '',
  option_text: row.option_text || '',
  is_correct: Boolean(row.is_correct),
  created_at: row.created_at || null,
  display_order: row.display_order ?? null,
  option_text_tl: row.option_text_tl || ''
});

export const buildDefaultAssessmentOptions = () => DEFAULT_OPTION_KEYS.map((optionKey, index) => ({
  option_key: optionKey,
  option_text: `Option ${optionKey}`,
  option_text_tl: '',
  is_correct: index === 0,
  display_order: index + 1
}));

export const getAssessmentOptions = async () => {
  try {
    const [{ data: assessments, error: assessmentsError }, { data: modules, error: modulesError }] = await Promise.all([
      supabase
        .from('assessments')
        .select('id, title, type, module_id'),
      supabase
        .from('modules')
        .select('id, module_no')
    ]);

    if (assessmentsError) throw assessmentsError;
    if (modulesError) throw modulesError;

    const moduleNumberById = (modules || []).reduce((accumulator, moduleRow) => {
      accumulator[moduleRow.id] = Number(moduleRow.module_no || 0) || null;
      return accumulator;
    }, {});

    const normalizeTypeLabel = (rawType) => {
      const value = String(rawType || '').trim().toLowerCase();
      if (value === 'pre_test' || value === 'pre-test' || value === 'pretest') {
        return 'Pre-test';
      }
      if (value === 'post_test' || value === 'post-test' || value === 'posttest') {
        return 'Post-test';
      }
      return '';
    };

    const normalizeTypeOrder = (typeLabel) => {
      if (typeLabel === 'Pre-test') return 1;
      if (typeLabel === 'Post-test') return 2;
      return 99;
    };

    const sortedAssessments = (assessments || []).slice().sort((a, b) => {
      const moduleNoA = moduleNumberById[a.module_id] ?? Number.MAX_SAFE_INTEGER;
      const moduleNoB = moduleNumberById[b.module_id] ?? Number.MAX_SAFE_INTEGER;
      if (moduleNoA !== moduleNoB) return moduleNoA - moduleNoB;

      const typeOrderA = normalizeTypeOrder(normalizeTypeLabel(a.type));
      const typeOrderB = normalizeTypeOrder(normalizeTypeLabel(b.type));
      if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;

      return String(a.title || '').localeCompare(String(b.title || ''));
    });

    return {
      data: sortedAssessments.map((row) => ({
        id: row.id,
        title: row.title || 'Untitled Assessment',
        type: row.type || '',
        module_id: row.module_id || null,
        module_no: moduleNumberById[row.module_id] ?? null,
        type_label: normalizeTypeLabel(row.type)
      })),
      error: null
    };
  } catch (error) {
    console.error('Error loading assessments:', error);
    return { data: [], error: error.message };
  }
};

export const getQuestionsByAssessment = async (assessmentId) => {
  try {
    if (!assessmentId) {
      return { data: [], error: null };
    }

    const { data, error } = await supabase
      .from(QUESTIONS_TABLE)
      .select('id, assessment_id, question_no, prompt, explanation, is_active, created_at, question_type, prompt_tl, explanation_tl')
      .eq('assessment_id', assessmentId)
      .order('question_no', { ascending: true });

    if (error) throw error;

    return { data: (data || []).map(mapQuestion), error: null };
  } catch (error) {
    console.error('Error loading assessment questions:', error);
    return { data: [], error: error.message };
  }
};

export const getAssessmentOptionsByQuestionIds = async (questionIds = []) => {
  try {
    const normalizedIds = Array.from(new Set((questionIds || []).filter(Boolean)));

    if (normalizedIds.length === 0) {
      return { data: [], error: null };
    }

    const { data, error } = await supabase
      .from(OPTIONS_TABLE)
      .select('id, question_id, option_key, option_text, is_correct, created_at, display_order, option_text_tl')
      .in('question_id', normalizedIds)
      .order('question_id', { ascending: true })
      .order('display_order', { ascending: true })
      .order('option_key', { ascending: true });

    if (error) throw error;

    return { data: (data || []).map(mapOption), error: null };
  } catch (error) {
    console.error('Error loading assessment options:', error);
    return { data: [], error: error.message };
  }
};

export const syncAssessmentQuestionOptions = async (questionId, options = []) => {
  try {
    if (!questionId) {
      return { data: [], error: 'Missing question id.' };
    }

    const normalizedOptions = (options || [])
      .map((option, index) => ({
        question_id: questionId,
        option_key: String(option?.option_key || '').trim().toUpperCase(),
        option_text: String(option?.option_text || '').trim(),
        option_text_tl: String(option?.option_text_tl || '').trim() || null,
        is_correct: Boolean(option?.is_correct),
        display_order: Number.isFinite(Number(option?.display_order))
          ? Number(option.display_order)
          : index + 1
      }))
      .filter((option) => option.option_key);

    if (normalizedOptions.length === 0) {
      const { error: deleteError } = await supabase
        .from(OPTIONS_TABLE)
        .delete()
        .eq('question_id', questionId);

      if (deleteError) throw deleteError;

      return { data: [], error: null };
    }

    const validOptions = normalizedOptions.filter((option) => option.option_text.length > 0);
    if (validOptions.length < 2) {
      return { data: [], error: 'Multiple choice questions need at least two choices.' };
    }

    const correctOptions = validOptions.filter((option) => option.is_correct);
    if (correctOptions.length !== 1) {
      return { data: [], error: 'Select exactly one correct answer.' };
    }

    const { data: existingRows, error: existingError } = await supabase
      .from(OPTIONS_TABLE)
      .select('id, option_key')
      .eq('question_id', questionId);

    if (existingError) throw existingError;

    const incomingKeys = new Set(validOptions.map((option) => option.option_key));
    const rowsToDelete = (existingRows || [])
      .filter((row) => !incomingKeys.has(String(row.option_key || '').toUpperCase()))
      .map((row) => row.id);

    if (rowsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from(OPTIONS_TABLE)
        .delete()
        .in('id', rowsToDelete);

      if (deleteError) throw deleteError;
    }

    const { data, error } = await supabase
      .from(OPTIONS_TABLE)
      .upsert(validOptions, { onConflict: 'question_id,option_key' })
      .select('id, question_id, option_key, option_text, is_correct, created_at, display_order, option_text_tl')
      .order('display_order', { ascending: true });

    if (error) throw error;

    return { data: (data || []).map(mapOption), error: null };
  } catch (error) {
    console.error('Error syncing assessment options:', error);
    return { data: [], error: error.message };
  }
};

export const createAssessmentQuestion = async (payload) => {
  try {
    const { data, error } = await supabase
      .from(QUESTIONS_TABLE)
      .insert(payload)
      .select('id, assessment_id, question_no, prompt, explanation, is_active, created_at, question_type, prompt_tl, explanation_tl')
      .single();

    if (error) throw error;

    const question = mapQuestion(data);

    if (String(payload?.question_type || '').toLowerCase() === 'multiple_choice') {
      const { data: optionData, error: optionError } = await syncAssessmentQuestionOptions(
        question.id,
        buildDefaultAssessmentOptions()
      );

      if (optionError) {
        return { data: { ...question, options: [] }, error: optionError };
      }

      return { data: { ...question, options: optionData || [] }, error: null };
    }

    return { data: { ...question, options: [] }, error: null };
  } catch (error) {
    console.error('Error creating assessment question:', error);
    return { data: null, error: error.message };
  }
};

export const updateAssessmentQuestion = async (id, payload) => {
  try {
    const { data, error } = await supabase
      .from(QUESTIONS_TABLE)
      .update(payload)
      .eq('id', id)
      .select('id, assessment_id, question_no, prompt, explanation, is_active, created_at, question_type, prompt_tl, explanation_tl')
      .single();

    if (error) throw error;

    return { data: mapQuestion(data), error: null };
  } catch (error) {
    console.error('Error updating assessment question:', error);
    return { data: null, error: error.message };
  }
};

export const deleteAssessmentQuestion = async (id) => {
  try {
    const { error } = await supabase
      .from(QUESTIONS_TABLE)
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { error: null };
  } catch (error) {
    console.error('Error deleting assessment question:', error);
    return { error: error.message };
  }
};
