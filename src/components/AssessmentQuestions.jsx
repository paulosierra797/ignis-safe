import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useSearchParams } from 'react-router-dom';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import ToastMessage from './ToastMessage';
import TranslationControls from './TranslationControls';
import Hint from './Hint';
import { gsap } from 'gsap';
import './AssessmentQuestions.css';
import './AppDialog.css';
import { useUser } from '../context/UserContext';
import { logAdminActivity } from '../utils/usersService';
import {
  getAssessmentOptions,
  getQuestionsByAssessment,
  getQuestionsByModule,
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
// Matches the edge function's questionCount cap.
const MAX_AI_REQUEST_COUNT = 14;

// Ticks on its own so the long question list doesn't re-render every second.
const ElapsedSeconds = ({ startedAt }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  if (!startedAt) return null;
  return <span className="assessment-generate-elapsed">({Math.max(0, Math.floor((now - startedAt) / 1000))}s)</span>;
};
const MODULE_TITLE_FALLBACKS = {
  1: 'Fire Extinguisher: Basics, Types, and How to Use',
  2: 'House Fire: How to Get Out Safely During a Fire',
  3: 'Electrical Fire: Causes, Safe Actions, and Prevention',
  4: 'Kitchen Fire: What It Is, Common Types, and What To Do',
  5: 'Tenement Fire: What It Is, Common Causes, and What To Do'
};

const QUESTION_STOP_WORDS = new Set([
  'about', 'after', 'also', 'ang', 'ano', 'are', 'atas', 'bakit', 'before', 'best',
  'both', 'can', 'choose', 'correct', 'dapat', 'does', 'during', 'each', 'from',
  'give', 'habang', 'how', 'into', 'is', 'ito', 'iyon', 'kapag', 'kung', 'may',
  'mga', 'module', 'most', 'ng', 'nito', 'one', 'pag', 'para', 'question', 'sa',
  'should', 'that', 'the', 'their', 'this', 'to', 'tungkol', 'what', 'when',
  'where', 'which', 'why', 'with', 'you', 'your'
]);

const normalizeQuestionText = (value = '') => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const stemQuestionToken = (token = '') => token
  .replace(/(ing|ed|es|s)$/i, '')
  .replace(/(han|hin|in|an)$/i, '');

const tokenizeQuestionText = (value = '') => normalizeQuestionText(value)
  .split(' ')
  .map(stemQuestionToken)
  .filter((token) => token.length > 2 && !QUESTION_STOP_WORDS.has(token));

const buildBigrams = (tokens = []) => {
  const bigrams = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    bigrams.push(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return bigrams;
};

const getSetOverlapScore = (leftItems = [], rightItems = []) => {
  const leftSet = new Set(leftItems);
  const rightSet = new Set(rightItems);
  if (leftSet.size === 0 || rightSet.size === 0) return 0;

  let intersection = 0;
  leftSet.forEach((item) => {
    if (rightSet.has(item)) intersection += 1;
  });

  return intersection / Math.min(leftSet.size, rightSet.size);
};

const getDiceScore = (leftItems = [], rightItems = []) => {
  const leftSet = new Set(leftItems);
  const rightSet = new Set(rightItems);
  if (leftSet.size === 0 || rightSet.size === 0) return 0;

  let intersection = 0;
  leftSet.forEach((item) => {
    if (rightSet.has(item)) intersection += 1;
  });

  return (2 * intersection) / (leftSet.size + rightSet.size);
};

const levenshteinDistance = (left = '', right = '') => {
  const leftLength = left.length;
  const rightLength = right.length;

  if (leftLength === 0) return rightLength;
  if (rightLength === 0) return leftLength;

  const previous = Array.from({ length: rightLength + 1 }, (_, index) => index);
  const current = Array(rightLength + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= leftLength; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= rightLength; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
    }

    for (let index = 0; index <= rightLength; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[rightLength];
};

const getQuestionComparableText = (question = {}) => [
  question.prompt,
  question.prompt_tl,
].filter(Boolean).join(' ');

const getQuestionSimilarityScore = (leftQuestion = {}, rightQuestion = {}) => {
  const leftText = normalizeQuestionText(getQuestionComparableText(leftQuestion));
  const rightText = normalizeQuestionText(getQuestionComparableText(rightQuestion));

  if (!leftText || !rightText) return 0;
  if (leftText === rightText) return 1;

  const shorter = leftText.length <= rightText.length ? leftText : rightText;
  const longer = leftText.length > rightText.length ? leftText : rightText;
  if (shorter.length >= 24 && longer.includes(shorter)) return 0.94;

  const leftTokens = tokenizeQuestionText(leftText);
  const rightTokens = tokenizeQuestionText(rightText);
  const tokenOverlap = getSetOverlapScore(leftTokens, rightTokens);
  const tokenDice = getDiceScore(leftTokens, rightTokens);
  const phraseOverlap = getSetOverlapScore(buildBigrams(leftTokens), buildBigrams(rightTokens));
  const editSimilarity = 1 - (levenshteinDistance(leftText, rightText) / Math.max(leftText.length, rightText.length));

  return Math.max(tokenOverlap, tokenDice, phraseOverlap, editSimilarity);
};

const findSimilarQuestion = (candidate = {}, existingQuestions = [], excludeQuestionId = null) => {
  const candidateText = normalizeQuestionText(getQuestionComparableText(candidate));
  if (!candidateText) return null;

  return (existingQuestions || []).find((existingQuestion) => {
    if (!existingQuestion) return false;
    if (excludeQuestionId && existingQuestion.id === excludeQuestionId) return false;

    const score = getQuestionSimilarityScore(candidate, existingQuestion);
    const candidateTokens = tokenizeQuestionText(candidateText);
    const existingTokens = tokenizeQuestionText(getQuestionComparableText(existingQuestion));
    const enoughSharedTerms = Math.min(candidateTokens.length, existingTokens.length) >= 4;

    return score >= 0.82 || (enoughSharedTerms && score >= 0.72);
  }) || null;
};

const buildExistingQuestionReferences = (questions = []) => (questions || [])
  .map((question) => ({
    question_no: question.question_no || null,
    assessmentType: question.assessment_type_label || question.assessmentType || '',
    prompt: String(question.prompt || '').trim(),
    prompt_tl: String(question.prompt_tl || '').trim(),
  }))
  .filter((question) => question.prompt || question.prompt_tl)
  .slice(0, 40);

const getAssessmentDifficultyGuidance = (assessment = {}) => {
  const label = getAssessmentTypeLabel(assessment).toLowerCase();

  if (label.includes('pre')) {
    return [
      'Pre-Assessment difficulty: easier, foundational, and direct.',
      'Ask recognition or basic knowledge questions that check understanding of key terms, actions, and facts from the module.',
      'Avoid long scenarios and avoid application-heavy analysis for Pre-Assessment questions.',
    ].join(' ');
  }

  if (label.includes('post')) {
    return [
      'Post-Assessment difficulty: clearly harder than Pre-Assessment.',
      'Ask application-based, situational, analytical, or scenario-based questions that test deeper understanding.',
      'Make questions harder through the thinking required, not through length: state any situation in one short clause and keep each question within about 15-25 words.',
      'Do not rephrase Pre-Assessment questions; use new situations, examples, and decision-making contexts.',
    ].join(' ');
  }

  return 'Use practical questions that are distinct from all existing questions in this module.';
};

const formatQuestionConflict = (question = {}, similarQuestion = {}) => {
  const typeLabel = similarQuestion.assessment_type_label || similarQuestion.assessmentType || 'another assessment';
  const questionNo = similarQuestion.question_no ? ` question ${similarQuestion.question_no}` : '';
  return `Question ${question.question_no}: too similar to ${typeLabel}${questionNo}. Please revise or generate a different question.`;
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
  const [searchParams] = useSearchParams();
  const requestedAssessmentId = searchParams.get('assessmentId') || '';
  const requestedModuleId = searchParams.get('moduleId') || '';
  const requestedQuestionId = searchParams.get('questionId') || '';
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
  const panelRef = useRef(null);
  const deleteModalRef = useRef(null);
  const questionHighlightTimeoutRef = useRef(null);
  const handledRecommendationTargetRef = useRef('');
  const moduleContextCacheRef = useRef(new Map());
  const [generationProgress, setGenerationProgress] = useState(null);
  const [generatingRowProgress, setGeneratingRowProgress] = useState({});
  // Synchronous locks: React state updates too late to stop a fast double click from
  // starting a second (duplicate, billed) generation.
  const bulkGenerationLockRef = useRef(false);
  const rowGenerationLocksRef = useRef(new Set());
  // Lets a finished generation detect that the admin switched assessments meanwhile.
  const activeAssessmentIdRef = useRef('');

  useEffect(() => {
    activeAssessmentIdRef.current = selectedAssessmentId;
  }, [selectedAssessmentId]);

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

  // Subtle entrances; skipped for reduced-motion users.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !panelRef.current) return undefined;
    const tween = gsap.fromTo(panelRef.current, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out', clearProps: 'transform,opacity,visibility' });
    return () => tween.kill();
  }, []);

  useEffect(() => {
    if (!pendingDeleteQuestion || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !deleteModalRef.current) return undefined;
    const tween = gsap.fromTo(deleteModalRef.current, { autoAlpha: 0, y: 14, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.25, ease: 'power2.out', clearProps: 'transform,opacity,visibility' });
    return () => tween.kill();
  }, [pendingDeleteQuestion]);

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
        const materialRows = learningMaterialsResult.data || [];
        const loadedTitles = materialRows.reduce((titles, row) => {
          const moduleNo = Number(row.module_no || 0);
          const moduleTitle = String(row.module_title_en || '').trim();
          if (moduleNo > 0 && moduleTitle && !titles[moduleNo]) {
            titles[moduleNo] = moduleTitle;
          }
          return titles;
        }, {});
        setModuleTitles({ ...MODULE_TITLE_FALLBACKS, ...loadedTitles });

        // Prime the per-module learning-context cache from this one full fetch so
        // "Generate Questions" never has to re-fetch materials during this session.
        const moduleNumbers = new Set(
          materialRows.map((row) => Number(row.module_no || 0)).filter(Boolean)
        );
        moduleNumbers.forEach((moduleNo) => {
          const context = buildModuleContext(materialRows, moduleNo);
          if (context) {
            moduleContextCacheRef.current.set(moduleNo, context);
          }
        });
      }

      if (error) {
        setMessage({ type: 'error', text: `Failed to load assessments: ${error}` });
        setAssessments([]);
      } else {
        const loadedAssessments = sortAssessments(data || []);
        setAssessments(loadedAssessments);
        if (loadedAssessments.length > 0) {
          const requestedAssessment = loadedAssessments.find((row) => row.id === requestedAssessmentId);
          const requestedModuleAssessment = loadedAssessments.find((row) => (
            row.module_id === requestedModuleId && isPreferredAssessment(row)
          ));
          const preferred = requestedAssessment
            || requestedModuleAssessment
            || loadedAssessments.find((row) => isPreferredAssessment(row));
          setSelectedAssessmentId(preferred?.id || loadedAssessments[0].id);
        }
      }

      setIsLoadingAssessments(false);
    };

    loadAssessments();
  }, [requestedAssessmentId, requestedModuleId]);

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

  useEffect(() => {
    if (
      isLoadingQuestions
      || !requestedQuestionId
      || handledRecommendationTargetRef.current === requestedQuestionId
      || !questions.some((question) => question.id === requestedQuestionId)
    ) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const questionElement = document.getElementById(`assessment-question-${requestedQuestionId}`);
      if (!questionElement) return;

      handledRecommendationTargetRef.current = requestedQuestionId;
      setFocusedQuestionId(requestedQuestionId);
      questionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setMessage({
        type: 'success',
        text: 'Guided review opened the weakest recorded question. Review it first; no content has been changed.',
      });

      if (questionHighlightTimeoutRef.current) {
        window.clearTimeout(questionHighlightTimeoutRef.current);
      }
      questionHighlightTimeoutRef.current = window.setTimeout(() => {
        setFocusedQuestionId('');
      }, 2400);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isLoadingQuestions, questions, requestedQuestionId]);

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

  const applyQuestionTranslations = (questionId, translatedQuestion) => {
    setQuestions((current) => current.map((question) => (
      question.id === questionId ? translatedQuestion : question
    )));
    markQuestionDirty(questionId);
  };

  // Translate All: swap in the translated list, flagging only questions whose
  // content actually changed. Unsaved edits and correct answers ride along
  // because translation only fills text fields on the latest state.
  const applyAllTranslations = (translatedQuestions) => {
    const previousById = new Map(questions.map((question) => [question.id, JSON.stringify(question)]));
    const changedIds = translatedQuestions
      .filter((question) => previousById.get(question.id) !== JSON.stringify(question))
      .map((question) => question.id);
    setQuestions(translatedQuestions);
    if (changedIds.length === 0) return;
    setDirtyQuestionIds((current) => {
      const next = new Set(current);
      changedIds.forEach((id) => next.add(id));
      return next;
    });
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

  const getModuleLearningContext = async (moduleNo) => {
    if (moduleContextCacheRef.current.has(moduleNo)) {
      return { context: moduleContextCacheRef.current.get(moduleNo), error: null };
    }

    const { data: materialRows, error: materialError } = await getLearningMaterialsAdminView(moduleNo);

    if (materialError) {
      return { context: '', error: materialError };
    }

    const context = buildModuleContext(materialRows || [], moduleNo);
    if (context) {
      moduleContextCacheRef.current.set(moduleNo, context);
    }

    return { context, error: null };
  };

  const buildCurrentAssessmentQuestionPool = (assessment = selectedAssessment, sourceQuestions = questions) => (
    (sourceQuestions || []).map((question) => ({
      ...question,
      assessment_id: question.assessment_id || assessment?.id || selectedAssessmentId,
      assessment_title: assessment?.title || selectedAssessmentLabel || '',
      assessment_type: assessment?.type || '',
      assessment_type_label: getAssessmentTypeLabel(assessment || {}),
      module_id: assessment?.module_id || null,
    }))
  );

  const loadModuleQuestionPool = async (assessment = selectedAssessment, sourceQuestions = questions) => {
    if (!assessment?.module_id) {
      return { data: buildCurrentAssessmentQuestionPool(assessment, sourceQuestions), error: null };
    }

    const { data, error } = await getQuestionsByModule(assessment.module_id);

    if (error) {
      return { data: [], error };
    }

    const currentQuestions = buildCurrentAssessmentQuestionPool(assessment, sourceQuestions);
    const questionById = new Map();

    (data || []).forEach((question) => {
      questionById.set(question.id, question);
    });

    currentQuestions.forEach((question) => {
      questionById.set(question.id, question);
    });

    return { data: Array.from(questionById.values()), error: null };
  };

  const generateUniqueQuestionDrafts = async ({
    assessment,
    moduleNo,
    learningContext,
    moduleQuestionPool = [],
    count,
    existingQuestionsByNumber,
    targetQuestion = null,
    onProgress,
  }) => {
    const acceptedQuestions = [];
    let lastGenerateError = null;
    const assessmentTypeLabel = getAssessmentTypeLabel(assessment);
    const basePayload = {
      assessmentId: selectedAssessmentId,
      assessmentTitle: assessment?.title || selectedAssessmentLabel || `Module ${moduleNo}`,
      assessmentType: assessment?.type_label || assessment?.type || '',
      moduleNo,
      targetQuestionNo: targetQuestion ? Number(targetQuestion.question_no) : undefined,
      existingPrompt: String(targetQuestion?.prompt || '').trim(),
      difficultyGuidance: getAssessmentDifficultyGuidance(assessment),
      context: learningContext,
    };

    // Checks each candidate against the module pool AND the drafts already accepted,
    // since parallel batches cannot see each other's questions.
    const acceptCandidates = (generatedQuestions = []) => {
      generatedQuestions.forEach((generatedQuestion) => {
        if (acceptedQuestions.length >= count) return;

        const candidate = { ...generatedQuestion, assessment_type_label: assessmentTypeLabel };
        if (!findSimilarQuestion(candidate, [...moduleQuestionPool, ...acceptedQuestions])) {
          acceptedQuestions.push(candidate);
        }
      });
    };

    // AI latency grows with the number of questions written, so a full set is split
    // into two parallel batches (10 -> 6 + 6, a 2-question duplicate buffer) that each
    // favour a different half of the material. A single replacement asks for 2.
    const firstRoundTotal = Math.min(MAX_AI_REQUEST_COUNT, count + (count === 1 ? 1 : 2));
    const batchSizes = firstRoundTotal > 6
      ? [Math.ceil(firstRoundTotal / 2), Math.floor(firstRoundTotal / 2)]
      : [firstRoundTotal];
    const existingQuestions = buildExistingQuestionReferences(moduleQuestionPool);
    let completedBatches = 0;
    const describeRound = () => (batchSizes.length > 1
      ? `Writing questions with AI (English + Filipino): ${completedBatches} of ${batchSizes.length} batches done...`
      : 'Writing questions with AI (English + Filipino)...');

    onProgress?.({ label: describeRound() });
    const batchResults = await Promise.all(batchSizes.map((questionCount, batchIndex) => (
      generateAssessmentQuestions({
        ...basePayload,
        questionCount,
        existingQuestions,
        batchFocus: batchSizes.length > 1
          ? `Batch ${batchIndex + 1} of ${batchSizes.length}: draw mainly from the ${batchIndex === 0 ? 'first' : 'second'} half of the source material.`
          : '',
      }).then((result) => {
        completedBatches += 1;
        onProgress?.({ label: describeRound() });
        return result;
      })
    )));

    batchResults.forEach(({ data, error }) => {
      if (error) {
        lastGenerateError = error;
        return;
      }
      acceptCandidates(data?.questions || []);
    });

    // One small top-up only for the shortfall (duplicates filtered, or one batch
    // failed). Skipped when every batch failed, e.g. quota errors, to avoid a second
    // guaranteed failure.
    const remainingCount = count - acceptedQuestions.length;
    const anyBatchSucceeded = batchResults.some(({ error }) => !error);
    if (remainingCount > 0 && anyBatchSucceeded) {
      onProgress?.({ label: `Writing ${remainingCount} more unique question${remainingCount === 1 ? '' : 's'}...` });
      const { data, error } = await generateAssessmentQuestions({
        ...basePayload,
        questionCount: Math.min(MAX_AI_REQUEST_COUNT, remainingCount + 1),
        existingQuestions: buildExistingQuestionReferences([...acceptedQuestions, ...moduleQuestionPool]),
      });
      if (error) {
        lastGenerateError = error;
      } else {
        acceptCandidates(data?.questions || []);
      }
    }

    onProgress?.({ label: 'Finalizing question drafts...' });

    if (acceptedQuestions.length < count) {
      return {
        drafts: [],
        error: lastGenerateError
          ? formatGenerateQuestionsError(lastGenerateError)
          : `The AI could not produce ${count} unique question${count === 1 ? '' : 's'} that were different enough from the existing module questions. Please try Generate again.`,
      };
    }

    const drafts = acceptedQuestions.slice(0, count).map((generatedQuestion, index) => {
      const questionNo = targetQuestion ? Number(targetQuestion.question_no) : index + 1;
      return buildGeneratedQuestionDraft({
        generatedQuestion,
        questionNo,
        assessmentId: selectedAssessmentId,
        existingQuestion: targetQuestion || existingQuestionsByNumber?.get(questionNo) || null,
      });
    });

    return { drafts, error: null };
  };

  const validateQuestionUniquenessBeforeSave = async (question) => {
    const { data: moduleQuestionPool, error } = await loadModuleQuestionPool(selectedAssessment);

    if (error) {
      return { isValid: false, message: `Unable to check existing module questions: ${error}` };
    }

    const similarQuestion = findSimilarQuestion(question, moduleQuestionPool, question.id);

    if (similarQuestion) {
      return {
        isValid: false,
        message: formatQuestionConflict(question, similarQuestion),
      };
    }

    return { isValid: true, message: '' };
  };

  const handleGenerateQuestions = async () => {
    if (isGenerating || bulkGenerationLockRef.current) return;
    if (!selectedAssessmentId) return;
    if (isDirty) {
      setMessage({
        type: 'error',
        text: 'Save or discard the current unsaved question changes before generating a new set.',
      });
      return;
    }

    bulkGenerationLockRef.current = true;
    setIsGenerating(true);
    setMessage({ type: '', text: '' });
    const generationAssessmentId = selectedAssessmentId;
    const startedAt = Date.now();
    const reportProgress = (progress) => setGenerationProgress({ ...progress, startedAt });

    try {
      const selectedAssessment = assessments.find((row) => row.id === selectedAssessmentId);
      const moduleNo = Number(selectedAssessment?.module_no || 0);

      if (!moduleNo) {
        setMessage({ type: 'error', text: 'The selected assessment is not linked to a module.' });
        return;
      }

      const safeCount = 10;

      reportProgress({ label: 'Preparing module materials...' });

      const [
        { context: learningContext, error: materialError },
        { data: moduleQuestionPool, error: moduleQuestionError },
      ] = await Promise.all([
        getModuleLearningContext(moduleNo),
        loadModuleQuestionPool(selectedAssessment),
      ]);

      if (materialError) {
        setMessage({ type: 'error', text: `Unable to load learning materials: ${materialError}` });
        return;
      }

      if (!learningContext) {
        setMessage({ type: 'error', text: `No active learning material content found for Module ${moduleNo}.` });
        return;
      }

      if (moduleQuestionError) {
        setMessage({ type: 'error', text: `Unable to check existing module questions: ${moduleQuestionError}` });
        return;
      }

      const existingQuestionsByNumber = new Map(
        questions.map((question) => [Number(question.question_no), question])
      );
      const { drafts: generatedDrafts, error: generateError } = await generateUniqueQuestionDrafts({
        assessment: selectedAssessment,
        moduleNo,
        learningContext,
        moduleQuestionPool,
        count: safeCount,
        existingQuestionsByNumber,
        onProgress: reportProgress,
      });

      if (activeAssessmentIdRef.current !== generationAssessmentId) {
        setMessage({
          type: 'error',
          text: 'Generated drafts were discarded because a different assessment was selected. Generate again for this assessment.',
        });
        return;
      }

      if (generateError || generatedDrafts.length === 0) {
        setMessage({
          type: 'error',
          text: generateError || 'The AI did not return any usable questions.',
        });
        return;
      }

      const generatedQuestionNumbers = new Set(
        generatedDrafts.map((question) => Number(question.question_no))
      );
      // Merge into the latest list (not the click-time snapshot) so edits made to
      // other questions while the AI was working are kept.
      setQuestions((current) => [
        ...generatedDrafts,
        ...current.filter((question) => !generatedQuestionNumbers.has(Number(question.question_no))),
      ].sort((a, b) => a.question_no - b.question_no));
      setDirtyQuestionIds((current) => {
        const next = new Set(current);
        generatedDrafts.forEach((question) => next.add(question.id));
        return next;
      });
      setMessage({
        type: 'success',
        text: `Generated ${generatedDrafts.length} unsaved question draft${generatedDrafts.length === 1 ? '' : 's'} from Module ${moduleNo} in ${Math.round((Date.now() - startedAt) / 1000)}s. Review them, then use Save question or Save all changes.`,
      });

      // Audit log runs in the background; it must not keep the generator spinning.
      void logAdminActivity({
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
      bulkGenerationLockRef.current = false;
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  };

  const handleGenerateSingleQuestion = async (question) => {
    if (!question?.id || isGenerating || bulkGenerationLockRef.current
      || generatingRowIds[question.id] || rowGenerationLocksRef.current.has(question.id)) return;
    if (dirtyQuestionIds.has(question.id) && !question._isAiGenerated) {
      setMessage({
        type: 'error',
        text: `Save or discard the current edits to question ${question.question_no} before generating a replacement.`,
      });
      return;
    }

    rowGenerationLocksRef.current.add(question.id);
    setGeneratingRowIds((current) => ({ ...current, [question.id]: true }));
    setMessage({ type: '', text: '' });
    const generationAssessmentId = selectedAssessmentId;
    const startedAt = Date.now();

    try {
      const moduleNo = Number(selectedAssessment?.module_no || 0);
      if (!moduleNo) {
        setMessage({ type: 'error', text: 'The selected assessment is not linked to a module.' });
        return;
      }

      const setRowProgress = (progress) => setGeneratingRowProgress((current) => ({
        ...current,
        [question.id]: { ...progress, startedAt },
      }));

      setRowProgress({ label: 'Preparing module materials...' });

      const [
        { context: learningContext, error: materialError },
        { data: moduleQuestionPool, error: moduleQuestionError },
      ] = await Promise.all([
        getModuleLearningContext(moduleNo),
        loadModuleQuestionPool(selectedAssessment),
      ]);

      if (materialError) {
        setMessage({ type: 'error', text: `Unable to load learning materials: ${materialError}` });
        return;
      }

      if (!learningContext) {
        setMessage({ type: 'error', text: `No active learning material content found for Module ${moduleNo}.` });
        return;
      }

      if (moduleQuestionError) {
        setMessage({ type: 'error', text: `Unable to check existing module questions: ${moduleQuestionError}` });
        return;
      }

      const { drafts: generatedDrafts, error: generateError } = await generateUniqueQuestionDrafts({
        assessment: selectedAssessment,
        moduleNo,
        learningContext,
        moduleQuestionPool,
        count: 1,
        targetQuestion: question,
        onProgress: setRowProgress,
      });

      if (activeAssessmentIdRef.current !== generationAssessmentId) return;

      const generatedDraft = generatedDrafts[0];
      if (generateError || !generatedDraft) {
        setMessage({ type: 'error', text: generateError || 'The AI did not return a usable replacement question.' });
        return;
      }

      setQuestions((current) => current.map((item) => (
        item.id === question.id ? generatedDraft : item
      )));
      markQuestionDirty(question.id);
      setMessage({
        type: 'success',
        text: `AI generated an unsaved draft for question ${question.question_no} in ${Math.round((Date.now() - startedAt) / 1000)}s. Review it, then save the question.`,
      });
    } finally {
      rowGenerationLocksRef.current.delete(question.id);
      setGeneratingRowIds((current) => {
        const next = { ...current };
        delete next[question.id];
        return next;
      });
      setGeneratingRowProgress((current) => {
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

    if (!String(question.prompt_tl || '').trim()) {
      setMessage({ type: 'error', text: `Question ${question.question_no}: Filipino prompt is required.` });
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

    if (filledOptions.some((option) => !String(option.option_text_tl || '').trim())) {
      setMessage({ type: 'error', text: `Question ${question.question_no}: add Filipino text for every filled choice.` });
      return false;
    }

    if (correctOptions.length !== 1) {
      setMessage({ type: 'error', text: `Question ${question.question_no}: select exactly one correct answer.` });
      return false;
    }

    const uniquenessCheck = await validateQuestionUniquenessBeforeSave(question);
    if (!uniquenessCheck.isValid) {
      setMessage({ type: 'error', text: uniquenessCheck.message });
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

        <section className="aq-panel" ref={panelRef}>
          <div className="aq-panel-title">
            <span>{selectedAssessmentLabel || 'Select an assessment'}</span>
            <h2 title={selectedModuleTitle}>{selectedModuleTitle}</h2>
          </div>

          <div className="aq-panel-grid">
            <div className="aq-selects">
              <div className="aq-field">
                <label htmlFor="assessment-filter-select">Select Assessment</label>
                <select
                  id="assessment-filter-select"
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

              <div className="aq-field">
                <label htmlFor="assessment-question-jump">Quick Question Access</label>
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

            <div className="aq-tools">
              <div className="aq-tool">
                <Hint
                  className="aq-tool-title"
                  text="Uses the selected module's learning materials to create unsaved drafts for review. Nothing is stored until you save."
                >
                  AI Questions Generator
                </Hint>
                <button
                  className="aq-btn aq-btn--secondary"
                  type="button"
                  onClick={handleGenerateQuestions}
                  disabled={!selectedAssessmentId || isLoadingQuestions || isGenerating}
                >
                  {isGenerating && <span className="assessment-generate-spinner" aria-hidden="true" />}
                  {isGenerating ? 'Generating...' : 'Generate Questions'}
                </button>
                {isGenerating && (
                  <div className="assessment-generate-progress" role="status" aria-live="polite">
                    {generationProgress?.label || 'Generating questions with AI...'}
                    <ElapsedSeconds startedAt={generationProgress?.startedAt} />
                  </div>
                )}
              </div>

              {!isLoadingQuestions && questions.length > 0 && (
                <div className="aq-tool">
                  <TranslationControls
                    key={`${selectedAssessmentId}:${questions.map((question) => question.id).join(',')}`}
                    value={questions}
                    onChange={applyAllTranslations}
                    section="assessment_questions"
                    scopeLabel="Translate All Questions"
                    actionLabel="Translate all"
                    helperText="Translates every question, answer choice and explanation in this assessment. Existing translations are kept unless you edited the source text, and you confirm those first. Correct answers are preserved. Nothing is saved until you save."
                    bulkLabel="Translate All"
                    bare
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        <ToastMessage message={message.text} type={message.type || 'info'} />

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
            className="aq-btn aq-btn--primary"
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
                    {isQuestionDirty && <span className="assessment-dirty-badge">Unsaved changes</span>}
                    {question._isAiGenerated && <span className="assessment-ai-draft-badge">AI draft</span>}
                    {isGeneratingRow && (
                      <span className="assessment-generate-progress assessment-generate-progress-inline" role="status" aria-live="polite">
                        {generatingRowProgress[question.id]?.label || 'Generating...'}
                        <ElapsedSeconds startedAt={generatingRowProgress[question.id]?.startedAt} />
                      </span>
                    )}
                  </div>

                  <div className="assessment-actions">
                    <button
                      type="button"
                      className="aq-btn aq-btn--danger"
                      onClick={() => handleDeleteQuestion(question)}
                      disabled={isSaving || isGeneratingRow}
                    >
                      Delete
                    </button>
                    <span className="aq-actions-gap" aria-hidden="true" />
                    <button
                      type="button"
                      className="aq-btn aq-btn--secondary"
                      onClick={() => handleGenerateSingleQuestion(question)}
                      disabled={isSaving || isGenerating || isGeneratingRow}
                    >
                      {isGeneratingRow && <span className="assessment-generate-spinner" aria-hidden="true" />}
                      {isGeneratingRow
                        ? 'Generating...'
                        : question._isAiGenerated
                          ? 'Regenerate with AI'
                          : 'Generate with AI'}
                    </button>
                    <button
                      type="button"
                      className="aq-btn aq-btn--primary"
                      onClick={() => handleSaveQuestion(question)}
                      disabled={isSaving || isGeneratingRow || !isQuestionDirty}
                    >
                      {isSaving ? 'Saving...' : 'Save question'}
                    </button>
                  </div>
                </header>

                <div className="assessment-question-body">
                  <TranslationControls
                    bare
                    value={question}
                    onChange={(translatedQuestion) => applyQuestionTranslations(question.id, translatedQuestion)}
                    section="assessment_questions"
                    compact
                    actionLabel="Translate question"
                  />
                  <section className="assessment-edit-section">
                    <h3 className="assessment-section-heading"><Hint text="The question shown to personnel during the assessment.">Question prompt</Hint></h3>
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
                        <span>Filipino</span>
                        <AutoResizeTextarea
                          value={question.prompt_tl}
                          onChange={(event) => setRowValue(question.id, 'prompt_tl', event.target.value)}
                          rows={3}
                          aria-label={`Question ${question.question_no} prompt in Filipino`}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="assessment-edit-section">
                    <h3 className="assessment-section-heading"><Hint text="Select one correct answer and review both language versions.">Choices and correct answer</Hint></h3>
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
                              <span>Filipino</span>
                              <AutoResizeTextarea
                                value={option.option_text_tl}
                                onChange={(event) => setOptionValue(question.id, option.option_key, 'option_text_tl', event.target.value)}
                                rows={1}
                                placeholder={`Option ${option.option_key} in Filipino`}
                                aria-label={`Option ${option.option_key} in Filipino`}
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="assessment-edit-section">
                    <h3 className="assessment-section-heading"><Hint text="The explanation displayed after answering the question.">Answer explanation</Hint></h3>
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
                        <span>Filipino</span>
                        <AutoResizeTextarea
                          value={question.explanation_tl}
                          onChange={(event) => setRowValue(question.id, 'explanation_tl', event.target.value)}
                          rows={3}
                          aria-label={`Question ${question.question_no} explanation in Filipino`}
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
          <div className="assessment-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="aq-delete-title">
            <div className="assessment-modal-box" ref={deleteModalRef}>
              <h3 id="aq-delete-title">Delete Question {pendingDeleteQuestion.question_no}?</h3>
              <div className="aq-delete-details">
                <p className="aq-delete-prompt">
                  {pendingDeleteQuestion.prompt || pendingDeleteQuestion.prompt_tl || 'No question text'}
                </p>
                <ul className="aq-delete-options">
                  {(pendingDeleteQuestion.options || []).map((option) => (
                    <li key={option.option_key} className={option.is_correct ? 'is-correct' : ''}>
                      <strong>{option.option_key}</strong>
                      <span>{option.option_text || option.option_text_tl || 'Empty option'}</span>
                      {option.is_correct && <em>Correct</em>}
                    </li>
                  ))}
                </ul>
                {pendingDeleteQuestion.explanation && (
                  <p className="aq-delete-explanation">{pendingDeleteQuestion.explanation}</p>
                )}
              </div>
              <div className="assessment-modal-actions">
                <button
                  type="button"
                  className="aq-btn aq-btn--secondary"
                  onClick={closeDeleteQuestionModal}
                  disabled={Boolean(savingRowIds[pendingDeleteQuestion.id])}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="aq-btn aq-btn--danger-solid"
                  onClick={confirmDeleteQuestion}
                  disabled={Boolean(savingRowIds[pendingDeleteQuestion.id])}
                >
                  {savingRowIds[pendingDeleteQuestion.id] ? 'Deleting...' : 'Delete Question'}
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
                  className="assessment-unsaved-btn assessment-unsaved-btn-cancel app-unsaved-button app-unsaved-button--cancel"
                  onClick={handleCancelExit}
                  disabled={isSavingAll}
                >
                  Cancel
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
                  className="assessment-unsaved-btn assessment-unsaved-btn-save app-unsaved-button app-unsaved-button--save"
                  onClick={handleSaveAndContinue}
                  disabled={isSavingAll}
                >
                  {isSavingAll ? 'Saving...' : 'Save All and Continue'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
