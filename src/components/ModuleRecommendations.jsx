import React, { useEffect, useState } from 'react';
import {
  FiAlertTriangle,
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

export default function ModuleRecommendations() {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedModule, setExpandedModule] = useState(null);

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
        <p>Prioritized guidance based on scores, pass rates, and recorded attempts.</p>
      </div>

      <div className="module-recommendations-container">
        {recommendations.map((rec) => {
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
                    <p>{level.summary}</p>
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
                <div className="stat">
                  <span>Evidence</span>
                  <strong>{attemptCount}</strong>
                  <small>{attemptCount === 1 ? 'Recorded attempt' : 'Recorded attempts'}</small>
                </div>
              </div>

              {isExpanded && (
                <div className="recommendation-card-details">
                  <div className="recommendation-focus">
                    <FiTarget aria-hidden="true" />
                    <div>
                      <span>Primary Focus</span>
                      <strong>{level.focus}</strong>
                      <p>
                        This module was flagged from a {formatPercent(rec.averageScore)} average score
                        {' '}and a {formatPercent(rec.passRate)} pass rate across {attemptCount}
                        {attemptCount === 1 ? ' attempt' : ' attempts'}.
                      </p>
                    </div>
                  </div>

                  <div className="recommendation-actions">
                    <h4>Recommended Actions</h4>
                    {actions.length ? (
                      <ol>
                        {actions.map((action, index) => (
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
                    <p><strong>{signal.label}.</strong> {signal.detail}</p>
                  </div>
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
    </div>
  );
}
