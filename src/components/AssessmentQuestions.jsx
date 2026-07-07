import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './AssessmentQuestions.css';
import { useUser } from '../context/UserContext';
import { logAdminActivity } from '../utils/usersService';
import {
  getAssessmentOptions,
  getQuestionsByAssessment,
  createAssessmentQuestion,
  updateAssessmentQuestion,
 resetAssessmentQuestions,
 deactivateAssessmentQuestions,
  getAssessmentOptionsByQuestionIds,
  syncAssessmentQuestionOptions,
  buildDefaultAssessmentOptions,
  generateAssessmentQuestions,
} from '../utils/assessmentQuestionsService';
import { getLearningMaterialsAdminView } from '../utils/learningMaterialsService';

const AI_OPTION_KEYS = ['A', 'B', 'C', 'D'];

const mergeQuestionsWithOptions = (questionRows = [], optionRows = []) => {
  const optionsByQuestionId = optionRows.reduce((accumulator, option) => {
    if (!accumulator[option.question_id]) {
      accumulator[option.question_id] = [];
    }

    accumulator[option.question_id].push(option);
    return accumulator;
  }, {});

  return questionRows.map((question) => ({
    ...question,
    question_type: 'multiple_choice',
    options: optionsByQuestionId[question.id] || []
  }));
};

const formatAssessmentLabel = (assessment = {}) => {
  const moduleNo = Number(assessment.module_no || 0);
  const moduleText = moduleNo > 0 ? `Module ${moduleNo}` : 'Module';
  const typeText = assessment.type_label || assessment.type || '';

  if (!typeText) {
    return moduleText;
  }

  return `${moduleText} - ${typeText}`;
};

const isPreferredAssessment = (assessment = {}) => {
  const moduleNo = Number(assessment.module_no || 0);
  const typeLabel = String(assessment.type_label || '').toLowerCase();

  return moduleNo >= 1 && moduleNo <= 5 && (typeLabel === 'pre-test' || typeLabel === 'post-test');
};

const formatGenerateQuestionsError = (error) => {
  if (!error) {
    return 'The AI service returned no questions.';
  }

  if (typeof error === 'string') {
    return error;
  }

  const parts = [];

  if (error.status) {
    parts.push(`Status ${error.status}`);
  }

  if (error.message) {
    parts.push(error.message.replace(/^Gemini request failed:\s*/i, ''));
  }

  if (error.retryAfterSeconds) {
    parts.push(`Try again in about ${error.retryAfterSeconds} seconds.`);
  }

  return parts.join(' - ') || 'The AI service failed.';
};

export default function AssessmentQuestions() {
  const { currentUser } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [assessments, setAssessments] = useState([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [isLoadingAssessments, setIsLoadingAssessments] = useState(true);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [savingRowIds, setSavingRowIds] = useState({});
  const [pendingDeleteQuestion, setPendingDeleteQuestion] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const loadAssessments = async () => {
      setIsLoadingAssessments(true);
      const { data, error } = await getAssessmentOptions();

      if (error) {
        setMessage({ type: 'error', text: `Failed to load assessments: ${error}` });
        setAssessments([]);
      } else {
        const loadedAssessments = data || [];
        setAssessments(loadedAssessments);
        if (loadedAssessments.length > 0) {
          const preferred = loadedAssessments.find((row) => isPreferredAssessment(row));
          setSelectedAssessmentId(preferred?.id || loadedAssessments[0].id);
        }
      }

      setIsLoadingAssessments(false);
    };

    loadAssessments();
  }, []);

  useEffect(() => {
    const loadQuestions = async () => {
      if (!selectedAssessmentId) {
        setQuestions([]);
        return;
      }

      setIsLoadingQuestions(true);
      const { data, error } = await getQuestionsByAssessment(selectedAssessmentId);

      if (error) {
        setMessage({ type: 'error', text: `Failed to load questions: ${error}` });
        setQuestions([]);
      } else {
        setQuestions(data || []);
      }

      const questionIds = (data || []).map((row) => row.id);
      const { data: optionRows, error: optionError } = await getAssessmentOptionsByQuestionIds(questionIds);

      if (optionError) {
        console.warn('Failed to load assessment options:', optionError);
      }

      setIsLoadingQuestions(false);
      setQuestions(mergeQuestionsWithOptions(data || [], optionRows || []));
    };

    loadQuestions();
  }, [selectedAssessmentId]);

  const displayAssessments = useMemo(() => {
    const preferred = assessments.filter((row) => isPreferredAssessment(row));
    return preferred.length > 0 ? preferred : assessments;
  }, [assessments]);

  const selectedAssessmentLabel = useMemo(() => {
    const selected = assessments.find((row) => row.id === selectedAssessmentId);
    if (!selected) return '';
    return formatAssessmentLabel(selected);
  }, [assessments, selectedAssessmentId]);

  const filteredQuestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return questions;

    return questions.filter((item) => {
      return (
        String(item.question_no).includes(q)
        || item.prompt.toLowerCase().includes(q)
        || item.prompt_tl.toLowerCase().includes(q)
        || item.explanation.toLowerCase().includes(q)
        || item.explanation_tl.toLowerCase().includes(q)
        || item.question_type.toLowerCase().includes(q)
      );
    });
  }, [questions, searchQuery]);

  const setRowValue = (id, field, value) => {
    setQuestions((prev) => prev.map((item) => (
      item.id === id ? { ...item, [field]: value } : item
    )));
  };

  const setOptionValue = (questionId, optionKey, field, value) => {
    setQuestions((prev) => prev.map((question) => {
      if (question.id !== questionId) {
        return question;
      }

      return {
        ...question,
        options: (question.options || []).map((option) => (
          option.option_key === optionKey ? { ...option, [field]: value } : option
        ))
      };
    }));
  };

  const setCorrectOption = (questionId, optionKey) => {
    setQuestions((prev) => prev.map((question) => {
      if (question.id !== questionId) {
        return question;
      }

      return {
        ...question,
        options: (question.options || []).map((option) => ({
          ...option,
          is_correct: option.option_key === optionKey
        }))
      };
    }));
  };

  const setRowSaving = (id, isSaving) => {
    setSavingRowIds((prev) => ({ ...prev, [id]: isSaving }));
  };

  const buildModuleContext = (rows = [], moduleNo = null) => {
    const filteredRows = (rows || []).filter((row) => Number(row.module_no) === Number(moduleNo) && row.is_active !== false);

    if (filteredRows.length === 0) {
      return '';
    }

    const moduleRow = filteredRows[0];
    const pageMap = new Map();

    filteredRows.forEach((row) => {
      const pageNo = Number(row.page_no || 0);

      if (!pageMap.has(pageNo)) {
        pageMap.set(pageNo, {
          pageNo,
          title: row.page_title_en || row.page_title_tl || '',
          blocks: [],
        });
      }

      const pageEntry = pageMap.get(pageNo);
      if (row.text_en || row.text_tl) {
        pageEntry.blocks.push({
          blockNo: row.block_no,
          text: row.text_en || row.text_tl || '',
        });
      }
    });

    const pageText = Array.from(pageMap.values())
      .sort((left, right) => left.pageNo - right.pageNo)
      .map((page) => {
        const blockText = page.blocks
          .map((block) => `Block ${block.blockNo ?? '-'}: ${block.text}`)
          .join('\n');

        return [`Page ${page.pageNo}${page.title ? ` - ${page.title}` : ''}`, blockText]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');

    return [
      `Module ${moduleNo}`,
      moduleRow.module_title_en ? `Title: ${moduleRow.module_title_en}` : '',
      moduleRow.module_subtitle_en ? `Subtitle: ${moduleRow.module_subtitle_en}` : '',
      pageText,
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 12000);
  };

  const handleGenerateQuestions = async () => {
    if (isGenerating) return;
    if (!selectedAssessmentId) return;

    setIsGenerating(true);
    setMessage({ type: '', text: '' });

    try {
      const selectedAssessment = assessments.find((row) => row.id === selectedAssessmentId);
      const moduleNo = Number(selectedAssessment?.module_no || 0);

      if (!moduleNo) {
        setMessage({ type: 'error', text: 'The selected assessment is not linked to a module.' });
        return;
      }

      const safeCount = 10;

      const { data: materialRows, error: materialError } = await getLearningMaterialsAdminView();

      if (materialError) {
        setMessage({ type: 'error', text: `Unable to load learning materials: ${materialError}` });
        return;
      }

      const learningContext = buildModuleContext(materialRows || [], moduleNo);

      if (!learningContext) {
        setMessage({ type: 'error', text: `No active learning material content found for Module ${moduleNo}.` });
        return;
      }

      const { data: generatedPayload, error: generateError } = await generateAssessmentQuestions({
        assessmentId: selectedAssessmentId,
        assessmentTitle: selectedAssessment?.title || selectedAssessmentLabel || `Module ${moduleNo}`,
        assessmentType: selectedAssessment?.type_label || selectedAssessment?.type || '',
        moduleNo,
        questionCount: safeCount,
        context: learningContext,
      });

      if (generateError || !generatedPayload?.questions?.length) {
        setMessage({
          type: 'error',
          text: formatGenerateQuestionsError(generateError),
        });
        return;
      }

      const { error: deactivateError } = await deactivateAssessmentQuestions(selectedAssessmentId);

      if (deactivateError) {
        setMessage({
          type: 'error',
          text: `Failed to deactivate old questions: ${deactivateError}`,
        });
        return;
      }

      setQuestions([]);

      const nextQuestionNoStart = 1;
      const createdQuestions = [];

      for (let index = 0; index < generatedPayload.questions.length; index += 1) {
        const generatedQuestion = generatedPayload.questions[index];
        const questionNo = nextQuestionNoStart + index;

        const { data: createdQuestion, error: createError } = await createAssessmentQuestion({
          assessment_id: selectedAssessmentId,
          question_no: questionNo,
          question_type: 'multiple_choice',
          prompt: String(generatedQuestion?.prompt || '').trim(),
          prompt_tl: String(generatedQuestion?.prompt_tl || '').trim() || null,
          explanation: String(generatedQuestion?.explanation || '').trim() || null,
          explanation_tl: String(generatedQuestion?.explanation_tl || '').trim() || null,
          is_active: true,
        });

        if (createError || !createdQuestion?.id) {
          continue;
        }

        const aiOptions = Array.isArray(generatedQuestion?.options)
          ? generatedQuestion.options.map((option, optionIndex) => ({
            option_key: String(option?.option_key || AI_OPTION_KEYS[optionIndex] || '').trim().toUpperCase(),
            option_text: String(option?.option_text || '').trim(),
            option_text_tl: String(option?.option_text_tl || '').trim(),
            is_correct: Boolean(option?.is_correct),
            display_order: Number.isFinite(Number(option?.display_order))
              ? Number(option.display_order)
              : optionIndex + 1,
          })).filter((option) => option.option_key && option.option_text)
          : [];

        if (aiOptions.length >= 2) {
          const { error: optionsError } = await syncAssessmentQuestionOptions(createdQuestion.id, aiOptions);
          if (optionsError) {
            console.warn('Failed to sync AI-generated options:', optionsError);
          }
        }

        createdQuestions.push({
          ...createdQuestion,
          options: aiOptions.length >= 2 ? aiOptions : buildDefaultAssessmentOptions(),
        });
      }

      if (createdQuestions.length === 0) {
        setMessage({ type: 'error', text: 'The AI did not return any usable questions.' });
        return;
      }

      setQuestions(createdQuestions.sort((a, b) => a.question_no - b.question_no));
      setMessage({
        type: 'success',
        text: `Generated ${createdQuestions.length} question${createdQuestions.length === 1 ? '' : 's'} from Module ${moduleNo}. Review and save the generated rows.`,
      });

      await logAdminActivity({
        actorId: currentUser?.admin_id || null,
        actorName: currentUser?.name || currentUser?.email || 'Admin User',
        action: 'Assessment Questions Generated',
        actionType: 'create',
        details: `Generated ${createdQuestions.length} questions for ${selectedAssessmentLabel || selectedAssessmentId} from Module ${moduleNo}.`,
        metadata: {
          assessment_id: selectedAssessmentId,
          module_no: moduleNo,
          generated_count: createdQuestions.length,
        },
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveQuestion = async (question) => {
    if (!question?.id) return;
    if (!question.prompt.trim()) {
      setMessage({ type: 'error', text: `Question ${question.question_no}: prompt is required.` });
      return;
    }

    const normalizedOptions = (question.options || [])
      .map((option, index) => ({
        ...option,
        option_key: String(option.option_key || '').trim().toUpperCase(),
        option_text: String(option.option_text || '').trim(),
        option_text_tl: String(option.option_text_tl || '').trim(),
        display_order: Number.isFinite(Number(option.display_order)) ? Number(option.display_order) : index + 1,
      }))
      .filter((option) => option.option_key);

    const filledOptions = normalizedOptions.filter((option) => option.option_text.length > 0);
    const correctOptions = filledOptions.filter((option) => option.is_correct);

    if (filledOptions.length < 2) {
      setMessage({ type: 'error', text: `Question ${question.question_no}: add at least two choices.` });
      return;
    }

    if (correctOptions.length !== 1) {
      setMessage({ type: 'error', text: `Question ${question.question_no}: select exactly one correct answer.` });
      return;
    }

    setRowSaving(question.id, true);
    setMessage({ type: '', text: '' });

    const payload = {
      question_no: Number(question.question_no),
      prompt: question.prompt.trim(),
      prompt_tl: question.prompt_tl.trim() || null,
      explanation: question.explanation.trim() || null,
      explanation_tl: question.explanation_tl.trim() || null,
      question_type: 'multiple_choice',
      is_active: Boolean(question.is_active),
    };

    const { data, error } = await updateAssessmentQuestion(question.id, payload);

    if (error) {
      setMessage({ type: 'error', text: `Unable to save question ${question.question_no}: ${error}` });
    } else {
      const { error: optionsError, data: savedOptions } = await syncAssessmentQuestionOptions(data.id, normalizedOptions);

      if (optionsError) {
        setMessage({ type: 'error', text: `Question ${data.question_no} saved, but choices failed: ${optionsError}` });
        setQuestions((prev) => prev
          .map((item) => (item.id === data.id ? { ...data, question_type: 'multiple_choice', options: normalizedOptions } : item))
          .sort((a, b) => a.question_no - b.question_no));
        setRowSaving(question.id, false);
        return;
      }

      setQuestions((prev) => prev
        .map((item) => (item.id === data.id ? { ...data, question_type: 'multiple_choice', options: savedOptions || normalizedOptions } : item))
        .sort((a, b) => a.question_no - b.question_no));
      setMessage({ type: 'success', text: `Question ${data.question_no} saved.` });

      await logAdminActivity({
        actorId: currentUser?.admin_id || null,
        actorName: currentUser?.name || currentUser?.email || 'Admin User',
        action: 'Assessment Question Updated',
        actionType: 'edit',
        details: `Updated question ${data.question_no} in ${selectedAssessmentLabel || selectedAssessmentId}.`,
        metadata: {
          assessment_id: selectedAssessmentId,
          question_id: data.id,
          question_no: data.question_no,
        },
      });
    }

    setRowSaving(question.id, false);
  };

  const handleDeleteQuestion = async (question) => {
    if (!question?.id) return;

    setPendingDeleteQuestion(question);
  };

  const closeDeleteQuestionModal = () => {
    const isProcessing = pendingDeleteQuestion?.id && Boolean(savingRowIds[pendingDeleteQuestion.id]);
    if (isProcessing) {
      return;
    }

    setPendingDeleteQuestion(null);
  };

  const confirmDeleteQuestion = async () => {
    const question = pendingDeleteQuestion;
    if (!question?.id) return;

    setRowSaving(question.id, true);
    setMessage({ type: '', text: '' });

   await updateAssessmentQuestion(question.id, {
  is_active: false
});

    if (error) {
      setMessage({ type: 'error', text: `Unable to delete question ${question.question_no}: ${error}` });
      setRowSaving(question.id, false);
      return;
    }

    setQuestions((prev) => prev.filter((item) => item.id !== question.id));
    setMessage({ type: 'success', text: `Question ${question.question_no} deleted.` });

    await logAdminActivity({
      actorId: currentUser?.admin_id || null,
      actorName: currentUser?.name || currentUser?.email || 'Admin User',
      action: 'Assessment Question Deleted',
      actionType: 'delete',
      details: `Deleted question ${question.question_no} from ${selectedAssessmentLabel || selectedAssessmentId}.`,
      metadata: {
        assessment_id: selectedAssessmentId,
        question_id: question.id,
        question_no: question.question_no,
      },
    });

    setRowSaving(question.id, false);
    setPendingDeleteQuestion(null);
  };

  return (
    <div className="assessment-questions-container">
      <Sidebar />

      <div className="assessment-questions-main">
        <PageHeader
          title="Assessment Questions"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="assessment-questions-toolbar">
          <div className="assessment-filter">
            <label>Select Assessment</label>
            <select
              value={selectedAssessmentId}
              onChange={(event) => setSelectedAssessmentId(event.target.value)}
              disabled={isLoadingAssessments || displayAssessments.length === 0}
            >
              {isLoadingAssessments ? (
                <option>Loading...</option>
              ) : displayAssessments.length === 0 ? (
                <option value="">No assessments found</option>
              ) : (
                displayAssessments.map((row) => (
                  <option key={row.id} value={row.id}>
                    {formatAssessmentLabel(row)}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="assessment-generator">
            <label htmlFor="assessment-generate-count">AI questions generator</label>
            <div className="assessment-generator-controls">
            
              <button
                className="assessment-generate-button"
                type="button"
                onClick={handleGenerateQuestions}
                disabled={!selectedAssessmentId || isLoadingQuestions || isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate Questions'}
              </button>
            </div>
            <p className="assessment-generator-hint">
              Uses the selected module’s learning materials and saves the generated questions for review.
            </p>
          </div>
        </div>

        {message.text && (
          <div className={`assessment-message assessment-message-${message.type || 'info'}`}>
            {message.text}
          </div>
        )}

        <div className="assessment-table-card">
          <table className="assessment-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Question Type</th>
                <th>Choices / Correct Answer</th>
                <th>Prompt (EN)</th>
                <th>Prompt (TL)</th>
                <th>Explanation (EN)</th>
                <th>Explanation (TL)</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingQuestions ? (
                <tr>
                  <td colSpan="9" className="assessment-empty-row">Loading questions...</td>
                </tr>
              ) : filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan="9" className="assessment-empty-row">No questions found for this assessment.</td>
                </tr>
              ) : filteredQuestions.map((question) => {
                const isSaving = Boolean(savingRowIds[question.id]);
                const questionOptions = question.options || [];

                return (
                  <tr key={question.id}>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={question.question_no}
                        onChange={(event) => setRowValue(question.id, 'question_no', Number(event.target.value || 0))}
                      />
                    </td>
                    <td>
                      <span className="assessment-question-type-label">Multiple Choice</span>
                    </td>
                    <td>
                      <div className="assessment-options-grid">
                        {questionOptions.map((option) => (
                          <div key={option.option_key} className="assessment-option-row">
                            <label className="assessment-option-correct">
                              <input
                                type="radio"
                                name={`correct-${question.id}`}
                                checked={Boolean(option.is_correct)}
                                onChange={() => setCorrectOption(question.id, option.option_key)}
                              />
                              Correct
                            </label>
                            <div className="assessment-option-fields">
                              <div className="assessment-option-key">{option.option_key}</div>
                              <input
                                type="text"
                                value={option.option_text}
                                onChange={(event) => setOptionValue(question.id, option.option_key, 'option_text', event.target.value)}
                                placeholder={`Option ${option.option_key}`}
                              />
                              <input
                                type="text"
                                value={option.option_text_tl}
                                onChange={(event) => setOptionValue(question.id, option.option_key, 'option_text_tl', event.target.value)}
                                placeholder={`Option ${option.option_key} (TL)`}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <textarea
                        value={question.prompt}
                        onChange={(event) => setRowValue(question.id, 'prompt', event.target.value)}
                        rows={3}
                      />
                    </td>
                    <td>
                      <textarea
                        value={question.prompt_tl}
                        onChange={(event) => setRowValue(question.id, 'prompt_tl', event.target.value)}
                        rows={3}
                      />
                    </td>
                    <td>
                      <textarea
                        value={question.explanation}
                        onChange={(event) => setRowValue(question.id, 'explanation', event.target.value)}
                        rows={3}
                      />
                    </td>
                    <td>
                      <textarea
                        value={question.explanation_tl}
                        onChange={(event) => setRowValue(question.id, 'explanation_tl', event.target.value)}
                        rows={3}
                      />
                    </td>
                    <td className="assessment-active-cell">
                      <input
                        type="checkbox"
                        checked={question.is_active}
                        onChange={(event) => setRowValue(question.id, 'is_active', event.target.checked)}
                      disabled/>
                    </td>
                    <td>
                      <div className="assessment-actions">
                        <button
                          type="button"
                          className="assessment-save"
                          onClick={() => handleSaveQuestion(question)}
                          disabled={isSaving}
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="assessment-delete"
                          onClick={() => handleDeleteQuestion(question)}
                          disabled={isSaving}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pendingDeleteQuestion && (
          <div className="assessment-modal-overlay" role="dialog" aria-modal="true">
            <div className="assessment-modal-box">
              <h3>Delete Question</h3>
              <p>Are you sure you want to delete question {pendingDeleteQuestion.question_no}?</p>
              <div className="assessment-modal-actions">
                <button
                  type="button"
                  className="assessment-modal-cancel"
                  onClick={closeDeleteQuestionModal}
                  disabled={Boolean(savingRowIds[pendingDeleteQuestion.id])}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="assessment-modal-confirm"
                  onClick={confirmDeleteQuestion}
                  disabled={Boolean(savingRowIds[pendingDeleteQuestion.id])}
                >
                  {savingRowIds[pendingDeleteQuestion.id] ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
