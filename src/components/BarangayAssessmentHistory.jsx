import React, { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { FiRefreshCw, FiRotateCcw } from 'react-icons/fi';
import CloseButton from './CloseButton';
import Pagination from './Pagination';
import ToastMessage from './ToastMessage';
import usePagination from '../hooks/usePagination';
import {
  ALL_FILTER,
  buildLearnerComparisons,
  buildRoundTrend,
  filterRecords,
  getCurrentRounds,
  summarizeByBarangay,
  summarizeRecords,
} from '../utils/assessmentHistory';
import {
  describeSkipReason,
  getAssessmentHistoryData,
  openReassessmentRound,
} from '../utils/assessmentHistoryService';
import './BarangayAssessmentHistory.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const MAX_LEARNERS_PER_RESET = 200;
const MAX_REASON_LENGTH = 500;

const formatScore = (value) => (value === null || value === undefined ? '—' : `${value}%`);

const formatPoints = (value) => {
  if (value === null || value === undefined) return '—';
  return `${value > 0 ? '+' : ''}${value} pts`;
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return 'n/a';
  return `${value > 0 ? '+' : ''}${value}%`;
};

const changeTone = (value) => {
  if (value === null || value === undefined || value === 0) return 'is-flat';
  return value > 0 ? 'is-up' : 'is-down';
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

function ScoreComparison({ previous, current, change }) {
  return (
    <div className="bah-compare">
      <span className="bah-compare-scores">
        <span>{formatScore(previous)}</span>
        <span aria-hidden="true">→</span>
        <strong>{formatScore(current)}</strong>
      </span>
      {change.points !== null && (
        <span className={`bah-change ${changeTone(change.points)}`}>
          {formatPoints(change.points)} · {formatPercent(change.percent)}
        </span>
      )}
    </div>
  );
}

function RoundTrendChart({ trend }) {
  const data = {
    labels: trend.map((row) => `Round ${row.roundNo}`),
    datasets: [
      { label: 'Pre-assessment', data: trend.map((row) => row.averagePre), backgroundColor: '#2563eb', borderRadius: 4, barPercentage: 0.8 },
      { label: 'Post-assessment', data: trend.map((row) => row.averagePost), backgroundColor: '#15803d', borderRadius: 4, barPercentage: 0.8 },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item) => `${item.dataset.label}: ${item.raw === null ? 'no data' : `${item.raw}%`}`,
          afterBody: (items) => {
            const row = trend[items[0]?.dataIndex];
            return row ? `Learners: ${row.learners}` : '';
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: { stepSize: 20, callback: (value) => `${value}%`, color: '#667085' },
        grid: { color: 'rgba(152, 162, 179, 0.18)' },
      },
      x: { grid: { display: false } },
    },
  };

  return <Bar data={data} options={options} aria-label="Average pre- and post-assessment scores by round" />;
}

export default function BarangayAssessmentHistory() {
  const [history, setHistory] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  const [barangay, setBarangay] = useState(ALL_FILTER);
  const [moduleId, setModuleId] = useState(ALL_FILTER);
  const [round, setRound] = useState(ALL_FILTER);
  const [learnerQuery, setLearnerQuery] = useState('');

  const [selectedLearnerIds, setSelectedLearnerIds] = useState(() => new Set());
  const [selectedModuleIds, setSelectedModuleIds] = useState(() => new Set());
  const [reason, setReason] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const handleDataChanged = () => setRefreshTick((tick) => tick + 1);
    window.addEventListener('ignis-safe:data-changed', handleDataChanged);
    return () => window.removeEventListener('ignis-safe:data-changed', handleDataChanged);
  }, []);

  useEffect(() => {
    let isMounted = true;

    getAssessmentHistoryData().then(({ data, error }) => {
      if (!isMounted) return;
      setHistory(data);
      setLoadError(error || '');
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [refreshTick]);

  const records = useMemo(() => history?.records || [], [history]);
  const modules = useMemo(() => history?.modules || [], [history]);

  // A filter value that no longer exists after a refresh falls back to "All".
  const activeBarangay = history?.barangays?.includes(barangay) ? barangay : ALL_FILTER;
  const activeModuleId = modules.some((module) => module.id === moduleId) ? moduleId : ALL_FILTER;
  const activeRound = history?.rounds?.includes(Number(round)) ? round : ALL_FILTER;

  const filteredRecords = useMemo(
    () => filterRecords(records, { barangay: activeBarangay, moduleId: activeModuleId, round: activeRound }),
    [records, activeBarangay, activeModuleId, activeRound],
  );
  const allRoundRecords = useMemo(
    () => filterRecords(records, { barangay: activeBarangay, moduleId: activeModuleId }),
    [records, activeBarangay, activeModuleId],
  );

  const overall = useMemo(() => summarizeRecords(filteredRecords), [filteredRecords]);
  const barangayRows = useMemo(
    () => summarizeByBarangay(filteredRecords, allRoundRecords),
    [filteredRecords, allRoundRecords],
  );
  const roundTrend = useMemo(() => buildRoundTrend(allRoundRecords), [allRoundRecords]);
  const comparisons = useMemo(
    () => buildLearnerComparisons(allRoundRecords, { round: activeRound }),
    [allRoundRecords, activeRound],
  );
  const currentRounds = useMemo(() => getCurrentRounds(records), [records]);

  const filterKey = `${activeBarangay}|${activeModuleId}|${activeRound}`;
  const barangayPages = usePagination(barangayRows, filterKey);
  const comparisonPages = usePagination(comparisons, filterKey);

  const normalizedQuery = learnerQuery.trim().toLowerCase();
  const pickableLearners = useMemo(() => (history?.learners || []).filter((learner) => (
    (activeBarangay === ALL_FILTER || learner.barangay === activeBarangay)
    && (!normalizedQuery
      || learner.name.toLowerCase().includes(normalizedQuery)
      || learner.email.toLowerCase().includes(normalizedQuery))
  )), [history, activeBarangay, normalizedQuery]);

  const learnerNameById = useMemo(
    () => new Map((history?.learners || []).map((learner) => [learner.id, learner.name])),
    [history],
  );

  const showToast = (type, message) => setToast((previous) => ({ id: (previous?.id || 0) + 1, type, message }));

  const toggleInSet = (setter, id) => {
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allPickableSelected = pickableLearners.length > 0
    && pickableLearners.every((learner) => selectedLearnerIds.has(learner.id));

  const toggleAllPickable = () => {
    setSelectedLearnerIds((previous) => {
      const next = new Set(previous);
      pickableLearners.forEach((learner) => {
        if (allPickableSelected) next.delete(learner.id);
        else next.add(learner.id);
      });
      return next;
    });
  };

  const tooManyLearners = selectedLearnerIds.size > MAX_LEARNERS_PER_RESET;
  const canSubmit = selectedLearnerIds.size > 0
    && selectedModuleIds.size > 0
    && !tooManyLearners
    && reason.length <= MAX_REASON_LENGTH
    && !isSubmitting;

  const selectedModules = modules.filter((module) => selectedModuleIds.has(module.id));

  const handleConfirmReset = async () => {
    setIsSubmitting(true);
    const { data, error } = await openReassessmentRound({
      userIds: Array.from(selectedLearnerIds),
      moduleIds: Array.from(selectedModuleIds),
      reason,
    });
    setIsSubmitting(false);
    setIsConfirmOpen(false);

    if (error) {
      showToast('error', error);
      return;
    }

    setResetResult(data);
    if (data.opened.length) {
      setSelectedLearnerIds(new Set());
      setSelectedModuleIds(new Set());
      setReason('');
    }
    showToast(
      data.opened.length ? 'success' : 'info',
      data.opened.length
        ? `Opened ${data.opened.length} new assessment round${data.opened.length === 1 ? '' : 's'}. Previous results were kept.`
        : 'No rounds were opened. See the details below.',
    );
  };

  const moduleLabel = (module) => `Module ${module.moduleNo}: ${module.title}`;

  return (
    <section className="bah" aria-labelledby="bah-title">
      {toast && <ToastMessage key={toast.id} type={toast.type} message={toast.message} />}

      <div className="analytics-section-heading bah-heading">
        <div>
          <span>Assessment history</span>
          <h2 id="bah-title">Barangay Assessment History</h2>
          <p>
            Pre- and post-assessment results grouped by barangay and assessment round. Barangay is
            self-declared by learners in the mobile app; it is not verified residency or attendance.
          </p>
        </div>
        <button
          type="button"
          className="bah-refresh"
          onClick={() => { setIsLoading(true); setRefreshTick((tick) => tick + 1); }}
          disabled={isLoading}
        >
          <FiRefreshCw aria-hidden="true" /> Refresh
        </button>
      </div>

      <div className="analytics-filters bah-filters">
        <div className="filter-pill">
          <span className="filter-label">Barangay:</span>
          <select value={activeBarangay} onChange={(event) => setBarangay(event.target.value)} aria-label="Filter assessment history by barangay">
            <option value={ALL_FILTER}>All</option>
            {(history?.barangays || []).map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </div>
        <div className="filter-pill">
          <span className="filter-label">Module:</span>
          <select value={activeModuleId} onChange={(event) => setModuleId(event.target.value)} aria-label="Filter assessment history by module">
            <option value={ALL_FILTER}>All</option>
            {modules.map((module) => <option key={module.id} value={module.id}>{moduleLabel(module)}</option>)}
          </select>
        </div>
        <div className="filter-pill">
          <span className="filter-label">Round:</span>
          <select value={activeRound} onChange={(event) => setRound(event.target.value)} aria-label="Filter assessment history by round">
            <option value={ALL_FILTER}>All</option>
            {(history?.rounds || []).map((roundNo) => <option key={roundNo} value={String(roundNo)}>Round {roundNo}</option>)}
          </select>
        </div>
      </div>

      {loadError && <div className="bah-notice is-error" role="alert">{loadError}</div>}

      {isLoading && !history ? (
        <div className="bah-card bah-empty" role="status">Loading assessment history...</div>
      ) : history && (
        <>
          <div className="bah-stats">
            <div className="bah-stat"><span>Learners</span><strong>{overall.learners}</strong></div>
            <div className="bah-stat"><span>Avg. pre-assessment</span><strong>{formatScore(overall.averagePre)}</strong></div>
            <div className="bah-stat"><span>Avg. post-assessment</span><strong>{formatScore(overall.averagePost)}</strong></div>
            <div className="bah-stat">
              <span>Completion rate</span>
              <strong>{overall.completionRate === null ? '—' : `${overall.completionRate}%`}</strong>
              <small>{overall.completed} of {overall.started} pre-assessments followed by a post-assessment</small>
            </div>
          </div>

          <div className="bah-grid">
            <div className="bah-card">
              <div className="analytics-card-header">
                <div>
                  <h3>Barangay Averages</h3>
                  <p>Group averages per barangay. History shows the average post-assessment score in each round.</p>
                </div>
              </div>
              {barangayRows.length === 0 ? (
                <p className="bah-empty">No submitted assessments match these filters.</p>
              ) : (
                <>
                  <div className="bah-table-wrap">
                    <table className="bah-table">
                      <thead>
                        <tr>
                          <th scope="col">Barangay</th>
                          <th scope="col">Learners</th>
                          <th scope="col">Avg. pre</th>
                          <th scope="col">Avg. post</th>
                          <th scope="col">Avg. gain</th>
                          <th scope="col">Completion</th>
                          <th scope="col">History by round</th>
                        </tr>
                      </thead>
                      <tbody>
                        {barangayPages.items.map((row) => (
                          <tr key={row.barangay}>
                            <th scope="row">{row.barangay}</th>
                            <td>{row.learners}</td>
                            <td>{formatScore(row.averagePre)}</td>
                            <td>{formatScore(row.averagePost)}</td>
                            <td><span className={`bah-change ${changeTone(row.averageGain)}`}>{formatPoints(row.averageGain)}</span></td>
                            <td>{row.completionRate === null ? '—' : `${row.completionRate}%`}</td>
                            <td>
                              <span className="bah-trend">
                                {row.trend.map((point) => (
                                  <span key={point.roundNo} title={`Round ${point.roundNo}: pre ${formatScore(point.averagePre)}, post ${formatScore(point.averagePost)}, ${point.learners} learner(s)`}>
                                    R{point.roundNo} {formatScore(point.averagePost)}
                                  </span>
                                ))}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination {...barangayPages} label="Barangay averages pages" />
                </>
              )}
            </div>

            <div className="bah-card">
              <div className="analytics-card-header">
                <div>
                  <h3>Average Scores by Round</h3>
                  <p>Historical trend for the selected barangay and module across assessment rounds.</p>
                </div>
              </div>
              {roundTrend.length === 0 ? (
                <p className="bah-empty">No round history for these filters yet.</p>
              ) : (
                <>
                  <div className="bah-chart"><RoundTrendChart trend={roundTrend} /></div>
                  <div className="training-legend">
                    <div className="legend-item"><span className="legend-dot" style={{ background: '#2563eb' }}></span><span>Pre-assessment (%)</span></div>
                    <div className="legend-item"><span className="legend-dot" style={{ background: '#15803d' }}></span><span>Post-assessment (%)</span></div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bah-card">
            <div className="analytics-card-header">
              <div>
                <h3>Individual Learner Progress</h3>
                <p>
                  Each learner&apos;s {activeRound === ALL_FILTER ? 'latest round' : `Round ${activeRound}`} compared
                  with the round before it. Changes are score points and percentage change.
                </p>
              </div>
            </div>
            {comparisons.length === 0 ? (
              <p className="bah-empty">No learner results match these filters.</p>
            ) : (
              <>
                <div className="bah-table-wrap">
                  <table className="bah-table">
                    <thead>
                      <tr>
                        <th scope="col">Learner</th>
                        <th scope="col">Barangay</th>
                        <th scope="col">Module</th>
                        <th scope="col">Rounds</th>
                        <th scope="col">Pre-assessment</th>
                        <th scope="col">Post-assessment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonPages.items.map((row) => (
                        <tr key={row.key}>
                          <th scope="row">
                            <span className="bah-learner">{row.learnerName}</span>
                            {row.email && <small>{row.email}</small>}
                          </th>
                          <td>{row.barangay}</td>
                          <td>Module {row.moduleNo}</td>
                          <td>
                            {row.previous ? `Round ${row.previous.roundNo} → ${row.current.roundNo}` : `Round ${row.current.roundNo}`}
                            {row.awaitingRetake && <small className="bah-pill">Awaiting retake</small>}
                            {row.current.roundOpenedAt && (
                              <small>Opened {formatDate(row.current.roundOpenedAt)}{row.current.roundOpenedByName ? ` by ${row.current.roundOpenedByName}` : ''}</small>
                            )}
                          </td>
                          <td><ScoreComparison previous={row.previous?.preScore ?? null} current={row.current.preScore} change={row.preChange} /></td>
                          <td><ScoreComparison previous={row.previous?.postScore ?? null} current={row.current.postScore} change={row.postChange} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination {...comparisonPages} label="Learner progress pages" />
              </>
            )}
          </div>

          <div className="bah-card bah-reassess">
            <div className="analytics-card-header">
              <div>
                <h3>Phase 2 Reassessment</h3>
                <p>
                  Opens the next assessment round for the selected learners and modules. Earlier results are kept
                  and every reset is recorded in the Audit Logs. Learners can take each pre- and post-assessment
                  once per round.
                </p>
              </div>
            </div>

            <div className="bah-reassess-grid">
              <fieldset className="bah-fieldset">
                <legend>Learners {activeBarangay !== ALL_FILTER && <small>in {activeBarangay}</small>}</legend>
                <div className="bah-picker-tools">
                  <input
                    type="search"
                    value={learnerQuery}
                    onChange={(event) => setLearnerQuery(event.target.value)}
                    placeholder="Search name or email"
                    aria-label="Search learners"
                  />
                  <button type="button" className="bah-link" onClick={toggleAllPickable} disabled={pickableLearners.length === 0}>
                    {allPickableSelected ? 'Clear shown' : 'Select shown'}
                  </button>
                </div>
                <ul className="bah-picker" aria-label="Learners">
                  {pickableLearners.length === 0 && <li className="bah-empty">No learners with assessment results match.</li>}
                  {pickableLearners.map((learner) => {
                    const learnerRounds = modules
                      .filter((module) => currentRounds[`${learner.id}:${module.id}`])
                      .map((module) => `M${module.moduleNo} R${currentRounds[`${learner.id}:${module.id}`]}`);
                    return (
                      <li key={learner.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedLearnerIds.has(learner.id)}
                            onChange={() => toggleInSet(setSelectedLearnerIds, learner.id)}
                          />
                          <span>
                            <strong>{learner.name}</strong>
                            <small>{learner.barangay}{learnerRounds.length ? ` · ${learnerRounds.join(', ')}` : ''}</small>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <small className={tooManyLearners ? 'bah-hint is-error' : 'bah-hint'}>
                  {selectedLearnerIds.size} selected{tooManyLearners ? ` - select at most ${MAX_LEARNERS_PER_RESET} per reset` : ''}
                </small>
              </fieldset>

              <div className="bah-reassess-side">
                <fieldset className="bah-fieldset">
                  <legend>Modules</legend>
                  {modules.map((module) => (
                    <label key={module.id} className="bah-check">
                      <input
                        type="checkbox"
                        checked={selectedModuleIds.has(module.id)}
                        onChange={() => toggleInSet(setSelectedModuleIds, module.id)}
                      />
                      <span>{moduleLabel(module)}</span>
                    </label>
                  ))}
                </fieldset>

                <label className="bah-reason">
                  <span>Reason (optional)</span>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={MAX_REASON_LENGTH}
                    rows={3}
                    placeholder="e.g. Phase 2 reassessment"
                  />
                  <small className="bah-hint">{reason.length}/{MAX_REASON_LENGTH}</small>
                </label>

                <button
                  type="button"
                  className="bah-primary"
                  disabled={!canSubmit}
                  onClick={() => setIsConfirmOpen(true)}
                >
                  <FiRotateCcw aria-hidden="true" /> Open new round
                </button>
              </div>
            </div>

            {resetResult && (
              <div className="bah-result" role="status">
                <p>
                  <strong>{resetResult.opened.length}</strong> round{resetResult.opened.length === 1 ? '' : 's'} opened
                  {resetResult.skipped.length > 0 && <>, <strong>{resetResult.skipped.length}</strong> skipped</>}.
                </p>
                {resetResult.skipped.length > 0 && (
                  <ul>
                    {resetResult.skipped.map((item) => (
                      <li key={`${item.user_id}:${item.module_id || 'all'}`}>
                        {item.learner_name || learnerNameById.get(item.user_id) || 'Learner'}
                        {item.module_no ? ` - Module ${item.module_no}` : ''}: {describeSkipReason(item.reason)}
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="bah-link" onClick={() => setResetResult(null)}>Dismiss</button>
              </div>
            )}
          </div>
        </>
      )}

      {isConfirmOpen && (
        <div className="bah-overlay" role="presentation">
          <div className="bah-dialog" role="dialog" aria-modal="true" aria-labelledby="bah-confirm-title">
            <div className="bah-dialog-header">
              <h3 id="bah-confirm-title">Open a new assessment round?</h3>
              <CloseButton onClick={() => setIsConfirmOpen(false)} disabled={isSubmitting} />
            </div>
            <p>
              This unlocks the pre- and post-assessment again for <strong>{selectedLearnerIds.size}</strong> learner
              {selectedLearnerIds.size === 1 ? '' : 's'} in:
            </p>
            <ul>
              {selectedModules.map((module) => <li key={module.id}>{moduleLabel(module)}</li>)}
            </ul>
            <p>
              Current results stay saved as the previous round and are not deleted. Learners without a submitted
              assessment in their current round are skipped. This action is recorded in the Audit Logs.
            </p>
            <div className="bah-dialog-actions">
              <button type="button" className="bah-secondary" onClick={() => setIsConfirmOpen(false)} disabled={isSubmitting}>Cancel</button>
              <button type="button" className="bah-primary" onClick={handleConfirmReset} disabled={isSubmitting}>
                {isSubmitting ? 'Opening...' : 'Open new round'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
