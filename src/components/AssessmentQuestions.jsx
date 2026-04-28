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
  deleteAssessmentQuestion,
} from '../utils/assessmentQuestionsService';

const DEFAULT_NEW_QUESTION = {
  question_type: 'multiple_choice',
  prompt: '',
  prompt_tl: '',
  explanation: '',
  explanation_tl: '',
  is_active: true,
};

export default function AssessmentQuestions() {
  const { currentUser } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [assessments, setAssessments] = useState([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [isLoadingAssessments, setIsLoadingAssessments] = useState(true);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [savingRowIds, setSavingRowIds] = useState({});
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const loadAssessments = async () => {
      setIsLoadingAssessments(true);
      const { data, error } = await getAssessmentOptions();

      if (error) {
        setMessage({ type: 'error', text: `Failed to load assessments: ${error}` });
        setAssessments([]);
      } else {
        setAssessments(data || []);
        if ((data || []).length > 0) {
          setSelectedAssessmentId(data[0].id);
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

      setIsLoadingQuestions(false);
    };

    loadQuestions();
  }, [selectedAssessmentId]);

  const selectedAssessmentLabel = useMemo(() => {
    const selected = assessments.find((row) => row.id === selectedAssessmentId);
    if (!selected) return '';
    return `${selected.title}${selected.type ? ` (${selected.type})` : ''}`;
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

  const nextQuestionNo = useMemo(() => {
    if (questions.length === 0) return 1;
    return Math.max(...questions.map((item) => Number(item.question_no || 0))) + 1;
  }, [questions]);

  const setRowValue = (id, field, value) => {
    setQuestions((prev) => prev.map((item) => (
      item.id === id ? { ...item, [field]: value } : item
    )));
  };

  const setRowSaving = (id, isSaving) => {
    setSavingRowIds((prev) => ({ ...prev, [id]: isSaving }));
  };

  const handleAddQuestion = async () => {
    if (!selectedAssessmentId || isAdding) return;

    setIsAdding(true);
    setMessage({ type: '', text: '' });

    const payload = {
      assessment_id: selectedAssessmentId,
      question_no: nextQuestionNo,
      ...DEFAULT_NEW_QUESTION,
    };

    const { data, error } = await createAssessmentQuestion(payload);

    if (error) {
      setMessage({ type: 'error', text: `Unable to add question: ${error}` });
    } else {
      setQuestions((prev) => [...prev, data].sort((a, b) => a.question_no - b.question_no));
      setMessage({ type: 'success', text: `Question ${data.question_no} added.` });

      await logAdminActivity({
        actorId: currentUser?.admin_id || null,
        actorName: currentUser?.name || currentUser?.email || 'Admin User',
        action: 'Assessment Question Created',
        actionType: 'create',
        details: `Added question ${data.question_no} in ${selectedAssessmentLabel || selectedAssessmentId}.`,
        metadata: {
          assessment_id: selectedAssessmentId,
          question_id: data.id,
          question_no: data.question_no,
        },
      });
    }

    setIsAdding(false);
  };

  const handleSaveQuestion = async (question) => {
    if (!question?.id) return;
    if (!question.prompt.trim()) {
      setMessage({ type: 'error', text: `Question ${question.question_no}: prompt is required.` });
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
      question_type: question.question_type,
      is_active: Boolean(question.is_active),
    };

    const { data, error } = await updateAssessmentQuestion(question.id, payload);

    if (error) {
      setMessage({ type: 'error', text: `Unable to save question ${question.question_no}: ${error}` });
    } else {
      setQuestions((prev) => prev
        .map((item) => (item.id === data.id ? data : item))
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

    const confirmed = window.confirm(`Delete question ${question.question_no}?`);
    if (!confirmed) return;

    setRowSaving(question.id, true);
    setMessage({ type: '', text: '' });

    const { error } = await deleteAssessmentQuestion(question.id);

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
              disabled={isLoadingAssessments || assessments.length === 0}
            >
              {isLoadingAssessments ? (
                <option>Loading...</option>
              ) : assessments.length === 0 ? (
                <option value="">No assessments found</option>
              ) : (
                assessments.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title} {row.type ? `(${row.type})` : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            className="assessment-add-button"
            type="button"
            onClick={handleAddQuestion}
            disabled={!selectedAssessmentId || isLoadingQuestions || isAdding}
          >
            {isAdding ? 'Adding...' : 'Add Question'}
          </button>
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
                <th>Type</th>
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
                  <td colSpan="8" className="assessment-empty-row">Loading questions...</td>
                </tr>
              ) : filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan="8" className="assessment-empty-row">No questions found for this assessment.</td>
                </tr>
              ) : filteredQuestions.map((question) => {
                const isSaving = Boolean(savingRowIds[question.id]);

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
                      <select
                        value={question.question_type}
                        onChange={(event) => setRowValue(question.id, 'question_type', event.target.value)}
                      >
                        <option value="multiple_choice">Multiple Choice</option>
                        <option value="essay">Essay</option>
                      </select>
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
                      />
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
      </div>
    </div>
  );
}
