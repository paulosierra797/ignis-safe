import React, { useEffect, useState } from 'react';
import './ModuleRecommendations.css';
import { getModuleRecommendations } from '../utils/knowledgeAnalyticsService';

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
    setExpandedModule(expandedModule === moduleId ? null : moduleId);
  };

  if (loading) {
    return (
      <div className="module-recommendations">
        <div className="module-recommendations-header">
          <h2>🤖 AI Module Recommendations</h2>
          <p>Analyzing module performance...</p>
        </div>
        <div className="module-recommendations-loading">
          <div className="spinner"></div>
          <p>Loading recommendations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="module-recommendations">
        <div className="module-recommendations-header">
          <h2>🤖 AI Module Recommendations</h2>
        </div>
        <div className="module-recommendations-error">
          <p>Unable to load recommendations: {error}</p>
        </div>
      </div>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return (
      <div className="module-recommendations">
        <div className="module-recommendations-header">
          <h2>🤖 AI Module Recommendations</h2>
        </div>
        <div className="module-recommendations-empty">
          <p>No modules with assessment data yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="module-recommendations">
      <div className="module-recommendations-header">
        <h2>🤖 AI Module Recommendations</h2>
        <p>AI-powered insights based on learner performance data</p>
      </div>

      <div className="module-recommendations-container">
        {recommendations.map((rec) => (
          <div
            key={rec.moduleId}
            className={`recommendation-card recommendation-${rec.level}`}
            onClick={() => toggleExpanded(rec.moduleId)}
          >
            <div className="recommendation-card-header">
              <div className="recommendation-card-title">
                <span className="recommendation-emoji">{rec.emoji}</span>
                <div className="recommendation-module-info">
                  <h3>{rec.moduleName}</h3>
                  <div className="recommendation-stats">
                    <span className="stat">
                      <strong>Score:</strong> {rec.averageScore}%
                    </span>
                    <span className="stat">
                      <strong>Pass Rate:</strong> {rec.passRate}%
                    </span>
                    <span className="stat">
                      <strong>Attempts:</strong> {rec.attemptCount}
                    </span>
                  </div>
                </div>
              </div>
              <div className="recommendation-level-badge" style={{ backgroundColor: rec.color }}>
                {rec.level.toUpperCase()}
              </div>
            </div>

            {expandedModule === rec.moduleId && (
              <div className="recommendation-card-details">
                <div className="recommendation-details-content">
                  <h4>🎯 AI Recommendations:</h4>
                  <ul>
                    {rec.recommendations.map((rec_text, idx) => (
                      <li key={idx}>{rec_text}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="recommendation-card-footer">
              <span className="expand-indicator">
                {expandedModule === rec.moduleId ? '▼' : '▶'} 
                {expandedModule === rec.moduleId ? 'Less Details' : 'More Details'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="module-recommendations-footer">
        <p>
          💡 <strong>Tip:</strong> Modules with lower scores should be prioritized for content revision and enhanced learning support.
        </p>
      </div>
    </div>
  );
}
