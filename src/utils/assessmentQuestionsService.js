import { supabase } from './supabaseClient';

const QUESTIONS_TABLE = 'assessment_questions';

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

export const getAssessmentOptions = async () => {
  try {
    const { data, error } = await supabase
      .from('assessments')
      .select('id, title, type, module_id')
      .order('title', { ascending: true });

    if (error) throw error;

    return {
      data: (data || []).map((row) => ({
        id: row.id,
        title: row.title || 'Untitled Assessment',
        type: row.type || '',
        module_id: row.module_id || null
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

export const createAssessmentQuestion = async (payload) => {
  try {
    const { data, error } = await supabase
      .from(QUESTIONS_TABLE)
      .insert(payload)
      .select('id, assessment_id, question_no, prompt, explanation, is_active, created_at, question_type, prompt_tl, explanation_tl')
      .single();

    if (error) throw error;

    return { data: mapQuestion(data), error: null };
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
