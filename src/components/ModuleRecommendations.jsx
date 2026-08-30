import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  FiAlertTriangle,
  FiArrowRight,
  FiBarChart2,
  FiCheckCircle,
  FiChevronDown,
  FiInfo,
  FiTarget,
  FiTrendingUp,
  FiZap,
} from 'react-icons/fi';
import './ModuleRecommendations.css';
import { getModuleRecommendations } from '../utils/knowledgeAnalyticsService';

const LEVEL_CONFIG = {
  excellent: {
    label: 'Strong',
    focus: 'Maintain and reuse what works',
    summary: 'Learners are performing well. Preserve the effective lesson structure and apply its strongest approaches to weaker modules.',
    icon: FiCheckCircle,
  },
  good: {
    label: 'On Track',
    focus: 'Strengthen practice and examples',
    summary: 'Performance is generally healthy, with room to improve understanding through more examples and targeted practice.',
    icon: FiTrendingUp,
  },
  moderate: {
    label: 'Needs Attention',
    focus: 'Simplify difficult concepts',
    summary: 'Learners may be struggling with complexity. Clarify the hardest sections before adding more content.',
    icon: FiAlertTriangle,
  },
  low: {
    label: 'High Priority',
    focus: 'Review and rebuild weak sections',
    summary: 'Current results show substantial difficulty. Prioritize the most confusing topics and guide learners through them step by step.',
    icon: FiZap,
  },
};

const formatPercent = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0%';
  return `${number.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
};

const cleanRecommendationText = (value) =>
  String(value || '')
    .trim()
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/^URGENT:\s*/i, '')
    .trim();

const getActions = (items = []) => {
  const seen = new Set();

  return items
    .map(cleanRecommendationText)
    .filter((item) => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const getSignal = (attemptCount) => {
  if (attemptCount < 5) {
    return {
      label: 'Early signal',
      detail: 'Use this as an initial guide and review the module again after more learners complete it.',
    };
  }

  if (attemptCount < 15) {
    return {
      label: 'Developing signal',
      detail: 'The pattern is useful, but continue monitoring results as more attempts are recorded.',
    };
  }

  return {
    label: 'Established pattern',
    detail: 'There are enough attempts to treat this performance pattern as a strong basis for revision.',
  };
};

const getFinding = (recommendation) => {
  const affected = Number(recommendation.affectedLearnerCount) || 0;
  const learners = Number(recommendation.learnerCount) || 0;
  const weakQuestion = recommendation.weakQuestions?.[0];

  if (affected > 0 && learners > 0) {
    return `${affected} of ${learners} ${learners === 1 ? 'learner is' : 'learners are'} currently below the 70% target.`;
  }

  if (weakQuestion) {
    return `Question ${weakQuestion.questionNo || ''} has the highest miss rate at ${formatPercent(weakQuestion.missRate)}.`;
  }

  return 'No urgent learner issue is visible in the available results.';
};

const getNextStep = (recommendation, level) => {
  const weakQuestion = recommendation.weakQuestions?.[0];

  if (weakQuestion) {
    return `Review Question ${weakQuestion.questionNo || ''} first, then use the existing AI draft tool only if the wording or coverage needs revision.`;
  }

  return level.focus;
};

export default function ModuleRecommendations() {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedModule, setExpandedModule] = useState(null);
  const [viewMode, setViewMode] = useState('priority');
  const [pendingReview, setPendingReview] = useState(null);

  useEffect(() => {
    const loadRecommendations = async () => {
      try {
        setLoading(true);
        const { data, error: fetchError } = await getModuleRecommendations();
        if (fetchError) {
          setError(fetchError);
          setRecommendations([]);
        } else {
          setRecommendations(data || []);
          setError(null);
        }
      } catch (err) {
        setError(err.message);
        setRecommendations([]);
      } finally {
        setLoading(false);
      }
    };

    loadRecommendations();
  }, []);

  const toggleExpanded = (moduleId) => {
    setExpandedModule((current) => (current === moduleId ? null : moduleId));
  };

  const priorityRecommendations = useMemo(
    () => recommendations.filter((recommendation) => ['low', 'moderate'].includes(recommendation.level)),
    [recommendations]
  );
  const visibleRecommendations = viewMode === 'priority' && priorityRecommendations.length > 0
    ? priorityRecommendations
    : recommendations;

  const openGuidedReview = () => {
    const weakQuestion = pendingReview?.weakQuestions?.[0];
    if (!pendingReview || !weakQuestion) return;

    const params = new URLSearchParams({
      moduleId: String(pendingReview.moduleId),
      assessmentId: String(weakQuestion.assessmentId),
      questionId: String(weakQuestion.questionId),
      source: 'recommendations',
    });

    setPendingReview(null);
    navigate(`/dashboard/assessment-questions?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="module-recommendations">
        <div className="module-recommendations-header">
          <h2><FiZap aria-hidden="true" />AI Module Recommendations</h2>
          <p>Reviewing module performance and learner outcomes.</p>
        </div>
        <div className="module-recommendations-loading">
          <div className="spinner"></div>
          <p>Preparing recommendations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="module-recommendations">
        <div className="module-recommendations-header">
          <h2><FiZap aria-hidden="true" />AI Module Recommendations</h2>
        </div>
        <div className="module-recommendations-error">
          <p>Recommendations could not be loaded: {error}</p>
        </div>
      </div>
    );
  }

  if (!recommendations?.length) {
    return (
      <div className="module-recommendations">
        <div className="module-recommendations-header">
          <h2><FiZap aria-hidden="true" />AI Module Recommendations</h2>
        </div>
        <div className="module-recommendations-empty">
          <p>Recommendations will appear after learners complete assessments.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="module-recommendations">
      <div className="module-recommendations-header">
        <h2><FiZap aria-hidden="true" />AI Module Recommendations</h2>
        <p>Review the most important learning issues first. Details stay hidden until you need them.</p>
      </div>

      <div className="recommendation-view-toolbar">
        <div className="recommendation-view-summary" aria-live="polite">
          <strong>{priorityRecommendations.length}</strong>
          <span>{priorityRecommendations.length === 1 ? 'module needs attention' : 'modules need attention'}</span>
        </div>
        <div className="recommendation-view-toggle" aria-label="Recommendation view">
          <button
            type="button"
            className={viewMode === 'priority' ? 'is-active' : ''}
            onClick={() => setViewMode('priority')}
            disabled={priorityRecommendations.length === 0}
          >
            Needs attention
          </button>
          <button
            type="button"
            className={viewMode === 'all' || priorityRecommendations.length === 0 ? 'is-active' : ''}
            onClick={() => setViewMode('all')}
          >
            All modules
          </button>
        </div>
      </div>

      <div className="module-recommendations-container">
        {visibleRecommendations.map((rec) => {
          const level = LEVEL_CONFIG[rec.level] || LEVEL_CONFIG.moderate;
          const LevelIcon = level.icon;
          const isExpanded = expandedModule === rec.moduleId;
          const actions = getActions(rec.recommendations);
          const attemptCount = Number(rec.attemptCount) || 0;
          const signal = getSignal(attemptCount);

          return (
            <article
              key={rec.moduleId}
              className={`recommendation-card recommendation-card-${rec.level}${isExpanded ? ' is-expanded' : ''}`}
            >
              <div className="recommendation-card-header">
                <div className="recommendation-card-title">
                  <span className="recommendation-level-icon" aria-hidden="true">
                    <LevelIcon />
                  </span>
                  <div className="recommendation-module-info">
                    <h3>{rec.moduleName}</h3>
                    <p>{getFinding(rec)}</p>
                  </div>
                </div>
                <span className="recommendation-level-badge">{level.label}</span>
              </div>

              <div className="recommendation-stats" aria-label={`${rec.moduleName} performance`}>
                <div className="stat">
                  <span>Average Score</span>
                  <strong>{formatPercent(rec.averageScore)}</strong>
                  <small>Target: 70% or higher</small>
                </div>
                <div className="stat">
                  <span>Pass Rate</span>
                  <strong>{formatPercent(rec.passRate)}</strong>
                  <small>Learners who passed</small>
                </div>
              </div>

              {isExpanded && (
                <div className="recommendation-card-details">
                  <div className="recommendation-focus">
                    <FiTarget aria-hidden="true" />
                    <div>
                      <span>Recommended Next Step</span>
                      <strong>{getNextStep(rec, level)}</strong>
                      <p>{level.summary}</p>
                    </div>
                  </div>

                  {rec.weakQuestions?.length > 0 && (
                    <div className="recommendation-weak-areas">
                      <h4>Weakest Recorded Questions</h4>
                      <div className="recommendation-weak-list">
                        {rec.weakQuestions.map((question) => (
                          <div className="recommendation-weak-item" key={question.questionId}>
                            <span>Q{question.questionNo || '?'}</span>
                            <p>{question.prompt}</p>
                            <strong>{formatPercent(question.missRate)} missed</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="recommendation-actions">
                    <h4>Supporting Actions</h4>
                    {actions.length ? (
                      <ol>
                        {actions.slice(0, 2).map((action, index) => (
                          <li key={`${rec.moduleId}-${action}`}>
                            <span aria-hidden="true">{index + 1}</span>
                            <p>{action}</p>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="recommendation-actions-empty">
                        Review assessment results and identify the topics learners miss most often.
                      </p>
                    )}
                  </div>

                  <div className="recommendation-signal">
                    <FiInfo aria-hidden="true" />
                    <p>
                      <strong>{signal.label}.</strong> {signal.detail}
                      {' '}{rec.dataScope || 'Completed results'} from {attemptCount}
                      {attemptCount === 1 ? ' attempt was' : ' attempts were'} used.
                    </p>
                  </div>

                  {rec.weakQuestions?.length > 0 && (
                    <div className="recommendation-guided-action">
                      <div>
                        <span>Admin-approved automation</span>
                        <p>Open the exact weak question in the editor. Nothing is changed or published automatically.</p>
                      </div>
                      <button type="button" onClick={() => setPendingReview(rec)}>
                        Open guided review
                        <FiArrowRight aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="recommendation-card-footer">
                <button
                  type="button"
                  className="recommendation-expand-button"
                  onClick={() => toggleExpanded(rec.moduleId)}
                  aria-expanded={isExpanded}
                >
                  <span>{isExpanded ? 'Show Less' : 'View Action Plan'}</span>
                  <FiChevronDown className={isExpanded ? 'is-open' : ''} aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="module-recommendations-footer">
        <FiBarChart2 aria-hidden="true" />
        <p>
          Start with high-priority modules, apply one change at a time, and compare the next set of learner results.
        </p>
      </div>

      {pendingReview && createPortal((
        <div className="recommendation-confirm-overlay" role="presentation">
          <section
            className="recommendation-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="recommendation-confirm-title"
          >
            <span className="recommendation-confirm-eyebrow">Guided review</span>
            <h3 id="recommendation-confirm-title">Review the weakest question?</h3>
            <p>
              Question {pendingReview.weakQuestions?.[0]?.questionNo || ''} will open in Assessment Questions.
              The system will not edit, replace, or publish anything until you review and save it.
            </p>
            <div className="recommendation-confirm-actions">
              <button type="button" className="secondary" onClick={() => setPendingReview(null)}>Cancel</button>
              <button type="button" className="primary" onClick={openGuidedReview}>
                Open review
                <FiArrowRight aria-hidden="true" />
              </button>
            </div>
          </section>
        </div>
      ), document.body)}
    </div>
  );
}
