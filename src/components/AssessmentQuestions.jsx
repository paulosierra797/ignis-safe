import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './AssessmentQuestions.css';
import './AppDialog.css';
import { useUser } from '../context/UserContext';
import { logAdminActivity } from '../utils/usersService';
import {
  getAssessmentOptions,
  getQuestionsByAssessment,
  createAssessmentQuestion,
  updateAssessmentQuestion,
  getAssessmentOptionsByQuestionIds,
  syncAssessmentQuestionOptions,
  buildDefaultAssessmentOptions,
  generateAssessmentQuestions,
} from '../utils/assessmentQuestionsService';
import { getLearningMaterialsAdminView } from '../utils/learningMaterialsService';

const AI_OPTION_KEYS = ['A', 'B', 'C', 'D'];
const AI_DRAFT_PREFIX = 'ai-question-draft';
const MODULE_TITLE_FALLBACKS = {
  1: 'Fire Extinguisher: Basics, Types, and How to Use',
  2: 'House Fire: How to Get Out Safely During a Fire',
  3: 'Electrical Fire: Causes, Safe Actions, and Prevention',
  4: 'Kitchen Fire: What It Is, Common Types, and What To Do',
  5: 'Tenement Fire: What It Is, Common Causes, and What To Do'
};

const getAssessmentTypeLabel = (assessment = {}) => {
  const typeValue = String(assessment.type_label || assessment.type || '').trim().toLowerCase();

  if (typeValue.includes('pre')) return 'Pre-assessment';
  if (typeValue.includes('post')) return 'Post-assessment';
  return assessment.type_label || assessment.type || 'Assessment';
};

const getAssessmentTypeOrder = (assessment = {}) => {
  const label = getAssessmentTypeLabel(assessment);
  if (label === 'Pre-assessment') return 1;
  if (label === 'Post-assessment') return 2;
  return 99;
};

const sortAssessments = (rows = []) => rows.slice().sort((left, right) => {
  const moduleDifference = Number(left.module_no || Number.MAX_SAFE_INTEGER)
    - Number(right.module_no || Number.MAX_SAFE_INTEGER);
  if (moduleDifference !== 0) return moduleDifference;

  const typeDifference = getAssessmentTypeOrder(left) - getAssessmentTypeOrder(right);
  if (typeDifference !== 0) return typeDifference;

  return String(left.title || '').localeCompare(String(right.title || ''));
});

const AutoResizeTextarea = ({ value, onChange, className = '', ...props }) => {
  const textareaRef = useRef(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      className={`assessment-auto-textarea ${className}`.trim()}
      value={value || ''}
      onChange={onChange}
      {...props}
    />
  );
};

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
  return `${moduleText}: ${getAssessmentTypeLabel(assessment)}`;
};

const isPreferredAssessment = (assessment = {}) => {
  const moduleNo = Number(assessment.module_no || 0);
  const typeLabel = getAssessmentTypeLabel(assessment);

  return moduleNo >= 1 && moduleNo <= 5
    && (typeLabel === 'Pre-assessment' || typeLabel === 'Post-assessment');
};

const formatGenerateQuestionsError = (error) => {
  if (!error) {
    return 'The AI service returned no questions.';
  }

  if (typeof error === 'string') {
    return error;
  }

  if ([502, 503, 504].includes(Number(error.status))) {
    return error.message || 'The AI question service is temporarily unavailable. Please try again.';
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

const normalizeGeneratedOptions = (generatedQuestion = {}) => {
  const options = Array.isArray(generatedQuestion.options)
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

  return options.length >= 2 ? options : buildDefaultAssessmentOptions();
};

const buildGeneratedQuestionDraft = ({
  generatedQuestion,
  questionNo,
  assessmentId,
  existingQuestion = null,
}) => ({
  ...(existingQuestion || {}),
  id: existingQuestion?.id
    || `${AI_DRAFT_PREFIX}-${Date.now()}-${questionNo}-${Math.random().toString(36).slice(2, 8)}`,
  assessment_id: assessmentId,
  question_no: questionNo,
  question_type: 'multiple_choice',
  prompt: String(generatedQuestion?.prompt || '').trim(),
  prompt_tl: String(generatedQuestion?.prompt_tl || '').trim(),
  explanation: String(generatedQuestion?.explanation || '').trim(),
  explanation_tl: String(generatedQuestion?.explanation_tl || '').trim(),
  is_active: existingQuestion?.is_active ?? true,
  options: normalizeGeneratedOptions(generatedQuestion),
  _isGeneratedDraft: Boolean(existingQuestion?._isGeneratedDraft) || !existingQuestion?.id,
  _isAiGenerated: true,
});

export default function AssessmentQuestions() {
  const { currentUser } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [assessments, setAssessments] = useState([]);
  const [moduleTitles, setModuleTitles] = useState(MODULE_TITLE_FALLBACKS);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [focusedQuestionId, setFocusedQuestionId] = useState('');
  const [isLoadingAssessments, setIsLoadingAssessments] = useState(true);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingRowIds, setGeneratingRowIds] = useState({});
  const [savingRowIds, setSavingRowIds] = useState({});
  const [dirtyQuestionIds, setDirtyQuestionIds] = useState(() => new Set());
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [pendingManualNavigation, setPendingManualNavigation] = useState(null);
  const [pendingAssessmentId, setPendingAssessmentId] = useState('');
  const [pendingDeleteQuestion, setPendingDeleteQuestion] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const bypassNavigationRef = useRef(false);
  const questionHighlightTimeoutRef = useRef(null);

  const isDirty = dirtyQuestionIds.size > 0;
  const shouldBlockNavigation = useCallback(({ currentLocation, nextLocation }) => {
    if (bypassNavigationRef.current) {
      bypassNavigationRef.current = false;
      return false;
    }

    const currentPath = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`;
    const nextPath = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;
    return isDirty && currentPath !== nextPath;
  }, [isDirty]);
  const blocker = useBlocker(shouldBlockNavigation);
  const hasPendingExit = Boolean(
    pendingManualNavigation
    || pendingAssessmentId
    || blocker.state === 'blocked'
  );

  const markQuestionDirty = useCallback((questionId) => {
    setDirtyQuestionIds((current) => {
      const next = new Set(current);
      next.add(questionId);
      return next;
    });
  }, []);

  useEffect(() => {
    const loadAssessments = async () => {
      setIsLoadingAssessments(true);
      const [assessmentResult, learningMaterialsResult] = await Promise.all([
        getAssessmentOptions(),
        getLearningMaterialsAdminView()
      ]);
      const { data, error } = assessmentResult;

      if (!learningMaterialsResult.error) {
        const loadedTitles = (learningMaterialsResult.data || []).reduce((titles, row) => {
          const moduleNo = Number(row.module_no || 0);
          const moduleTitle = String(row.module_title_en || '').trim();
          if (moduleNo > 0 && moduleTitle && !titles[moduleNo]) {
            titles[moduleNo] = moduleTitle;
          }
          return titles;
        }, {});
        setModuleTitles({ ...MODULE_TITLE_FALLBACKS, ...loadedTitles });
      }

      if (error) {
        setMessage({ type: 'error', text: `Failed to load assessments: ${error}` });
        setAssessments([]);
      } else {
        const loadedAssessments = sortAssessments(data || []);
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
        setDirtyQuestionIds(new Set());
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
      setDirtyQuestionIds(new Set());
    };

    loadQuestions();
  }, [selectedAssessmentId]);

  useEffect(() => {
    setFocusedQuestionId('');
  }, [selectedAssessmentId]);

  useEffect(() => () => {
    if (questionHighlightTimeoutRef.current) {
      window.clearTimeout(questionHighlightTimeoutRef.current);
    }
  }, []);

  const displayAssessments = useMemo(() => {
    const preferred = assessments.filter((row) => isPreferredAssessment(row));
    return sortAssessments(preferred.length > 0 ? preferred : assessments);
  }, [assessments]);

  const selectedAssessment = useMemo(
    () => assessments.find((row) => row.id === selectedAssessmentId) || null,
    [assessments, selectedAssessmentId]
  );

  const selectedAssessmentLabel = useMemo(() => {
    if (!selectedAssessment) return '';
    return formatAssessmentLabel(selectedAssessment);
  }, [selectedAssessment]);

  const selectedModuleNo = Number(selectedAssessment?.module_no || 0);
  const selectedModuleTitle = moduleTitles[selectedModuleNo]
    || selectedAssessment?.title
    || 'Assessment Questions';

  const filteredQuestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return questions;

    return questions.filter((item) => {
      return (
        String(item.question_no).includes(q)
        || String(item.prompt || '').toLowerCase().includes(q)
        || String(item.prompt_tl || '').toLowerCase().includes(q)
        || String(item.explanation || '').toLowerCase().includes(q)
        || String(item.explanation_tl || '').toLowerCase().includes(q)
        || String(item.question_type || '').toLowerCase().includes(q)
      );
    });
  }, [questions, searchQuery]);

  const questionNavigatorOptions = useMemo(() => {
    return questions.slice().sort((left, right) => left.question_no - right.question_no);
  }, [questions]);

  useEffect(() => {
    if (!isDirty) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleAssessmentChange = (event) => {
    const nextAssessmentId = event.target.value;
    if (!nextAssessmentId || nextAssessmentId === selectedAssessmentId) return;

    if (isDirty) {
      setPendingAssessmentId(nextAssessmentId);
      return;
    }

    setSelectedAssessmentId(nextAssessmentId);
  };

  const handleQuestionJump = (event) => {
    const questionId = event.target.value;
    if (!questionId) return;

    const questionElement = document.getElementById(`assessment-question-${questionId}`);
    if (!questionElement) return;

    setFocusedQuestionId(questionId);
    questionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (questionHighlightTimeoutRef.current) {
      window.clearTimeout(questionHighlightTimeoutRef.current);
    }
    questionHighlightTimeoutRef.current = window.setTimeout(() => {
      setFocusedQuestionId('');
    }, 1800);
  };

  const handleHeaderNavigationRequest = (navigation) => {
    if (!isDirty) {
      navigation.action();
      return;
    }

    if (hasPendingExit) return;
    setPendingManualNavigation(navigation);
  };

  const setRowValue = (id, field, value) => {
    markQuestionDirty(id);
    setQuestions((prev) => prev.map((item) => (
      item.id === id ? { ...item, [field]: value } : item
    )));
  };

  const setOptionValue = (questionId, optionKey, field, value) => {
    markQuestionDirty(questionId);
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
    markQuestionDirty(questionId);
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
    if (isDirty) {
      setMessage({
        type: 'error',
        text: 'Save or discard the current unsaved question changes before generating a new set.',
      });
      return;
    }

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

      const existingQuestionsByNumber = new Map(
        questions.map((question) => [Number(question.question_no), question])
      );
      const generatedDrafts = generatedPayload.questions.map((generatedQuestion, index) => {
        const questionNo = index + 1;
        return buildGeneratedQuestionDraft({
          generatedQuestion,
          questionNo,
          assessmentId: selectedAssessmentId,
          existingQuestion: existingQuestionsByNumber.get(questionNo) || null,
        });
      });

      if (generatedDrafts.length === 0) {
        setMessage({ type: 'error', text: 'The AI did not return any usable questions.' });
        return;
      }

      const generatedQuestionNumbers = new Set(
        generatedDrafts.map((question) => Number(question.question_no))
      );
      const preservedQuestions = questions.filter(
        (question) => !generatedQuestionNumbers.has(Number(question.question_no))
      );
      const nextQuestions = [...generatedDrafts, ...preservedQuestions]
        .sort((a, b) => a.question_no - b.question_no);

      setQuestions(nextQuestions);
      setDirtyQuestionIds(new Set(generatedDrafts.map((question) => question.id)));
      setMessage({
        type: 'success',
        text: `Generated ${generatedDrafts.length} unsaved question draft${generatedDrafts.length === 1 ? '' : 's'} from Module ${moduleNo}. Review them, then use Save question or Save all changes.`,
      });

      await logAdminActivity({
        actorId: currentUser?.admin_id || null,
        actorName: currentUser?.name || currentUser?.email || 'Admin User',
        action: 'AI Assessment Drafts Generated',
        actionType: 'create',
        details: `Generated ${generatedDrafts.length} unsaved question drafts for ${selectedAssessmentLabel || selectedAssessmentId} from Module ${moduleNo}.`,
        metadata: {
          assessment_id: selectedAssessmentId,
          module_no: moduleNo,
          generated_count: generatedDrafts.length,
        },
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateSingleQuestion = async (question) => {
    if (!question?.id || isGenerating || generatingRowIds[question.id]) return;
    if (dirtyQuestionIds.has(question.id) && !question._isAiGenerated) {
      setMessage({
        type: 'error',
        text: `Save or discard the current edits to question ${question.question_no} before generating a replacement.`,
      });
      return;
    }

    setGeneratingRowIds((current) => ({ ...current, [question.id]: true }));
    setMessage({ type: '', text: '' });

    try {
      const moduleNo = Number(selectedAssessment?.module_no || 0);
      if (!moduleNo) {
        setMessage({ type: 'error', text: 'The selected assessment is not linked to a module.' });
        return;
      }

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
        questionCount: 1,
        targetQuestionNo: Number(question.question_no),
        existingPrompt: String(question.prompt || '').trim(),
        context: learningContext,
      });

      const generatedQuestion = generatedPayload?.questions?.[0];
      if (generateError || !generatedQuestion) {
        setMessage({ type: 'error', text: formatGenerateQuestionsError(generateError) });
        return;
      }

      const generatedDraft = buildGeneratedQuestionDraft({
        generatedQuestion,
        questionNo: Number(question.question_no),
        assessmentId: selectedAssessmentId,
        existingQuestion: question,
      });

      setQuestions((current) => current.map((item) => (
        item.id === question.id ? generatedDraft : item
      )));
      markQuestionDirty(question.id);
      setMessage({
        type: 'success',
        text: `AI generated an unsaved draft for question ${question.question_no}. Review it, then save the question.`,
      });
    } finally {
      setGeneratingRowIds((current) => {
        const next = { ...current };
        delete next[question.id];
        return next;
      });
    }
  };

  const handleSaveQuestion = async (question, { showSuccessMessage = true } = {}) => {
    if (!question?.id) return false;
    if (!String(question.prompt || '').trim()) {
      setMessage({ type: 'error', text: `Question ${question.question_no}: prompt is required.` });
      return false;
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
      return false;
    }

    if (correctOptions.length !== 1) {
      setMessage({ type: 'error', text: `Question ${question.question_no}: select exactly one correct answer.` });
      return false;
    }

    setRowSaving(question.id, true);
    setMessage({ type: '', text: '' });

    const originalQuestionId = question.id;
    const isNewGeneratedDraft = Boolean(question._isGeneratedDraft);
    const payload = {
      question_no: Number(question.question_no),
      prompt: String(question.prompt || '').trim(),
      prompt_tl: String(question.prompt_tl || '').trim() || null,
      explanation: String(question.explanation || '').trim() || null,
      explanation_tl: String(question.explanation_tl || '').trim() || null,
      question_type: 'multiple_choice',
      is_active: Boolean(question.is_active),
    };

    const { data, error } = isNewGeneratedDraft
      ? await createAssessmentQuestion({
        ...payload,
        assessment_id: selectedAssessmentId,
      })
      : await updateAssessmentQuestion(question.id, payload);

    if (error) {
      setMessage({ type: 'error', text: `Unable to save question ${question.question_no}: ${error}` });
      setRowSaving(question.id, false);
      return false;
    } else {
      const { error: optionsError, data: savedOptions } = await syncAssessmentQuestionOptions(data.id, normalizedOptions);

      if (optionsError) {
        setMessage({ type: 'error', text: `Question ${data.question_no} saved, but choices failed: ${optionsError}` });
        setQuestions((prev) => prev
          .map((item) => (item.id === originalQuestionId
            ? { ...data, question_type: 'multiple_choice', options: normalizedOptions, _isAiGenerated: true }
            : item))
          .sort((a, b) => a.question_no - b.question_no));
        setDirtyQuestionIds((current) => {
          const next = new Set(current);
          next.delete(originalQuestionId);
          next.add(data.id);
          return next;
        });
        setRowSaving(question.id, false);
        return false;
      }

      setQuestions((prev) => prev
        .map((item) => (item.id === originalQuestionId
          ? { ...data, question_type: 'multiple_choice', options: savedOptions || normalizedOptions }
          : item))
        .sort((a, b) => a.question_no - b.question_no));
      setDirtyQuestionIds((current) => {
        const next = new Set(current);
        next.delete(originalQuestionId);
        next.delete(data.id);
        return next;
      });
      if (showSuccessMessage) {
        setMessage({ type: 'success', text: `Question ${data.question_no} saved.` });
      }

      await logAdminActivity({
        actorId: currentUser?.admin_id || null,
        actorName: currentUser?.name || currentUser?.email || 'Admin User',
        action: isNewGeneratedDraft ? 'Assessment Question Created' : 'Assessment Question Updated',
        actionType: isNewGeneratedDraft ? 'create' : 'edit',
        details: `${isNewGeneratedDraft ? 'Created' : 'Updated'} question ${data.question_no} in ${selectedAssessmentLabel || selectedAssessmentId}.`,
        metadata: {
          assessment_id: selectedAssessmentId,
          question_id: data.id,
          question_no: data.question_no,
        },
      });
    }

    setRowSaving(question.id, false);
    return true;
  };

  const handleSaveAllQuestions = async ({ continueAfterSave = false } = {}) => {
    if (isSavingAll) return false;

    const questionsToSave = questions.filter((question) => dirtyQuestionIds.has(question.id));
    if (questionsToSave.length === 0) return true;

    setIsSavingAll(true);
    setMessage({ type: '', text: '' });

    for (const question of questionsToSave) {
      const saved = await handleSaveQuestion(question, { showSuccessMessage: false });
      if (!saved) {
        setIsSavingAll(false);
        return false;
      }
    }

    setIsSavingAll(false);
    if (!continueAfterSave) {
      setMessage({
        type: 'success',
        text: `${questionsToSave.length} question${questionsToSave.length === 1 ? '' : 's'} saved successfully.`
      });
    }
    return true;
  };

  const runManualNavigation = (navigation) => {
    bypassNavigationRef.current = true;

    try {
      const navigationResult = navigation.action();
      Promise.resolve(navigationResult).finally(() => {
        bypassNavigationRef.current = false;
      });
    } catch (navigationError) {
      bypassNavigationRef.current = false;
      throw navigationError;
    }
  };

  const resumePendingExit = () => {
    const manualNavigation = pendingManualNavigation;
    const nextAssessmentId = pendingAssessmentId;
    setPendingManualNavigation(null);
    setPendingAssessmentId('');

    if (nextAssessmentId) {
      if (blocker.state === 'blocked') blocker.reset();
      setSelectedAssessmentId(nextAssessmentId);
      return;
    }

    if (manualNavigation) {
      if (blocker.state === 'blocked') blocker.reset();
      runManualNavigation(manualNavigation);
      return;
    }

    if (blocker.state === 'blocked') blocker.proceed();
  };

  const handleCancelExit = () => {
    if (isSavingAll) return;
    setPendingManualNavigation(null);
    setPendingAssessmentId('');
    if (blocker.state === 'blocked') blocker.reset();
  };

  const handleLeaveWithoutSaving = () => {
    if (isSavingAll) return;
    setDirtyQuestionIds(new Set());
    resumePendingExit();
  };

  const handleSaveAndContinue = async () => {
    const saved = await handleSaveAllQuestions({ continueAfterSave: true });
    if (saved) resumePendingExit();
  };

  const handleDeleteQuestion = async (question) => {
    if (!question?.id) return;

    if (question._isGeneratedDraft) {
      setQuestions((current) => current.filter((item) => item.id !== question.id));
      setDirtyQuestionIds((current) => {
        const next = new Set(current);
        next.delete(question.id);
        return next;
      });
      setMessage({ type: 'success', text: `Unsaved question ${question.question_no} draft removed.` });
      return;
    }

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

    const { error } = await updateAssessmentQuestion(question.id, {
      is_active: false
    });

    if (error) {
      setMessage({ type: 'error', text: `Unable to delete question ${question.question_no}: ${error}` });
      setRowSaving(question.id, false);
      return;
    }

    setQuestions((prev) => prev.filter((item) => item.id !== question.id));
    setDirtyQuestionIds((current) => {
      const next = new Set(current);
      next.delete(question.id);
      return next;
    });
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
          onNavigationRequest={handleHeaderNavigationRequest}
        />

        <section className="assessment-module-context">
          <div className="assessment-module-heading">
            <span>{selectedAssessmentLabel || 'Select an assessment'}</span>
            <h2>{selectedModuleTitle}</h2>
            <p>Review and update the questions for this learning module.</p>
          </div>

          <div className="assessment-question-navigator">
            <label htmlFor="assessment-question-jump">Quick question access</label>
            <div className="assessment-question-navigator-controls">
              <select
                id="assessment-question-jump"
                value=""
                onChange={handleQuestionJump}
                disabled={isLoadingQuestions || questionNavigatorOptions.length === 0}
                aria-label="Jump to a question"
              >
                <option value="">
                  {questionNavigatorOptions.length === 0 ? 'No matching questions' : 'Choose a question...'}
                </option>
                {questionNavigatorOptions.map((question) => (
                  <option key={question.id} value={question.id}>
                    {`Question ${question.question_no} — ${String(question.prompt || '').slice(0, 80)}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <div className="assessment-questions-toolbar">
          <div className="assessment-filter">
            <label>Select Assessment</label>
            <select
              value={selectedAssessmentId}
              onChange={handleAssessmentChange}
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
              Uses the selected module’s learning materials to create unsaved drafts for review. Nothing is stored until you save.
            </p>
          </div>
        </div>

        {message.text && (
          <div className={`assessment-message assessment-message-${message.type || 'info'}`}>
            {message.text}
          </div>
        )}

        <div className="assessment-editor-bar">
          <div className="assessment-editor-summary">
            <strong>{filteredQuestions.length}</strong>
            <span>{filteredQuestions.length === 1 ? 'question' : 'questions'} in this view</span>
            {isDirty && (
              <span className="assessment-unsaved-count">
                {dirtyQuestionIds.size} unsaved
              </span>
            )}
          </div>
          <button
            type="button"
            className="assessment-save-all"
            onClick={() => handleSaveAllQuestions()}
            disabled={!isDirty || isSavingAll}
          >
            {isSavingAll ? 'Saving all...' : 'Save all changes'}
          </button>
        </div>

        <div className="assessment-question-list">
          {isLoadingQuestions ? (
            <div className="assessment-empty-state">Loading questions...</div>
          ) : filteredQuestions.length === 0 ? (
            <div className="assessment-empty-state">No questions found for this assessment.</div>
          ) : filteredQuestions.map((question) => {
            const isSaving = Boolean(savingRowIds[question.id]);
            const isGeneratingRow = Boolean(generatingRowIds[question.id]);
            const isQuestionDirty = dirtyQuestionIds.has(question.id);
            const questionOptions = question.options || [];

            return (
              <article
                key={question.id}
                id={`assessment-question-${question.id}`}
                className={`assessment-question-card${isQuestionDirty ? ' is-dirty' : ''}${focusedQuestionId === question.id ? ' is-focused' : ''}`}
              >
                <header className="assessment-question-header">
                  <div className="assessment-question-meta">
                    <label className="assessment-number-field">
                      <span>Question</span>
                      <input
                        type="number"
                        min="1"
                        className="assessment-no-input"
                        value={question.question_no}
                        onChange={(event) => setRowValue(question.id, 'question_no', Number(event.target.value || 0))}
                        aria-label="Question number"
                      />
                    </label>
                    <span className="assessment-question-type-label">Multiple Choice</span>
                    {isQuestionDirty && <span className="assessment-dirty-badge">Unsaved changes</span>}
                    {question._isAiGenerated && <span className="assessment-ai-draft-badge">AI draft</span>}
                  </div>

                  <div className="assessment-actions">
                    <button
                      type="button"
                      className="assessment-generate-one"
                      onClick={() => handleGenerateSingleQuestion(question)}
                      disabled={isSaving || isGenerating || isGeneratingRow}
                    >
                      {isGeneratingRow
                        ? 'Generating...'
                        : question._isAiGenerated
                          ? 'Regenerate with AI'
                          : 'Generate with AI'}
                    </button>
                    <button
                      type="button"
                      className="assessment-save"
                      onClick={() => handleSaveQuestion(question)}
                      disabled={isSaving || isGeneratingRow || !isQuestionDirty}
                    >
                      {isSaving ? 'Saving...' : 'Save question'}
                    </button>
                    <button
                      type="button"
                      className="assessment-delete"
                      onClick={() => handleDeleteQuestion(question)}
                      disabled={isSaving || isGeneratingRow}
                    >
                      Delete
                    </button>
                  </div>
                </header>

                <div className="assessment-question-body">
                  <section className="assessment-edit-section">
                    <div className="assessment-section-heading">
                      <span className="assessment-section-number">1</span>
                      <div>
                        <h3>Question prompt</h3>
                        <p>The question shown to personnel during the assessment.</p>
                      </div>
                    </div>
                    <div className="assessment-language-grid">
                      <label className="assessment-field">
                        <span>English</span>
                        <AutoResizeTextarea
                          value={question.prompt}
                          onChange={(event) => setRowValue(question.id, 'prompt', event.target.value)}
                          rows={3}
                          aria-label={`Question ${question.question_no} prompt in English`}
                        />
                      </label>
                      <label className="assessment-field">
                        <span>Tagalog</span>
                        <AutoResizeTextarea
                          value={question.prompt_tl}
                          onChange={(event) => setRowValue(question.id, 'prompt_tl', event.target.value)}
                          rows={3}
                          aria-label={`Question ${question.question_no} prompt in Tagalog`}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="assessment-edit-section">
                    <div className="assessment-section-heading">
                      <span className="assessment-section-number">2</span>
                      <div>
                        <h3>Choices and correct answer</h3>
                        <p>Select one correct answer and review both language versions.</p>
                      </div>
                    </div>
                    <div className="assessment-options-grid">
                      {questionOptions.map((option) => (
                        <div
                          key={option.option_key}
                          className={`assessment-option-row${option.is_correct ? ' is-correct' : ''}`}
                        >
                          <div className="assessment-option-heading">
                            <span className="assessment-option-key">{option.option_key}</span>
                            <label className="assessment-option-correct">
                              <input
                                type="radio"
                                name={`correct-${question.id}`}
                                checked={Boolean(option.is_correct)}
                                onChange={() => setCorrectOption(question.id, option.option_key)}
                              />
                              Correct answer
                            </label>
                          </div>
                          <div className="assessment-language-grid assessment-option-language-grid">
                            <label className="assessment-field">
                              <span>English</span>
                              <AutoResizeTextarea
                                value={option.option_text}
                                onChange={(event) => setOptionValue(question.id, option.option_key, 'option_text', event.target.value)}
                                rows={1}
                                placeholder={`Option ${option.option_key}`}
                                aria-label={`Option ${option.option_key} in English`}
                              />
                            </label>
                            <label className="assessment-field">
                              <span>Tagalog</span>
                              <AutoResizeTextarea
                                value={option.option_text_tl}
                                onChange={(event) => setOptionValue(question.id, option.option_key, 'option_text_tl', event.target.value)}
                                rows={1}
                                placeholder={`Option ${option.option_key} in Tagalog`}
                                aria-label={`Option ${option.option_key} in Tagalog`}
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="assessment-edit-section">
                    <div className="assessment-section-heading">
                      <span className="assessment-section-number">3</span>
                      <div>
                        <h3>Answer explanation</h3>
                        <p>The explanation displayed after answering the question.</p>
                      </div>
                    </div>
                    <div className="assessment-language-grid">
                      <label className="assessment-field">
                        <span>English</span>
                        <AutoResizeTextarea
                          value={question.explanation}
                          onChange={(event) => setRowValue(question.id, 'explanation', event.target.value)}
                          rows={3}
                          aria-label={`Question ${question.question_no} explanation in English`}
                        />
                      </label>
                      <label className="assessment-field">
                        <span>Tagalog</span>
                        <AutoResizeTextarea
                          value={question.explanation_tl}
                          onChange={(event) => setRowValue(question.id, 'explanation_tl', event.target.value)}
                          rows={3}
                          aria-label={`Question ${question.question_no} explanation in Tagalog`}
                        />
                      </label>
                    </div>
                  </section>
                </div>
              </article>
            );
          })}
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

        {hasPendingExit && !pendingDeleteQuestion && (
          <div
            className="assessment-unsaved-overlay app-unsaved-overlay"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="assessment-unsaved-title"
            aria-describedby="assessment-unsaved-description"
          >
            <div className="assessment-unsaved-modal app-unsaved-dialog">
              <div className="assessment-unsaved-icon app-unsaved-icon" aria-hidden="true">
                !
              </div>
              <h3 id="assessment-unsaved-title" className="assessment-unsaved-title app-unsaved-title">
                Unsaved Assessment Questions
              </h3>
              <p id="assessment-unsaved-description" className="assessment-unsaved-message app-unsaved-message">
                You have unsaved changes in this assessment. What would you like to do before leaving this page?
              </p>
              <div className="assessment-unsaved-actions app-unsaved-actions">
                <button
                  type="button"
                  className="assessment-unsaved-btn assessment-unsaved-btn-save app-unsaved-button app-unsaved-button--save"
                  onClick={handleSaveAndContinue}
                  disabled={isSavingAll}
                >
                  {isSavingAll ? 'Saving...' : 'Save All and Continue'}
                </button>
                <button
                  type="button"
                  className="assessment-unsaved-btn assessment-unsaved-btn-leave app-unsaved-button app-unsaved-button--discard"
                  onClick={handleLeaveWithoutSaving}
                  disabled={isSavingAll}
                >
                  Leave Without Saving
                </button>
                <button
                  type="button"
                  className="assessment-unsaved-btn assessment-unsaved-btn-cancel app-unsaved-button app-unsaved-button--cancel"
                  onClick={handleCancelExit}
                  disabled={isSavingAll}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
