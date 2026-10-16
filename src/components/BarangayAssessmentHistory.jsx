import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { FiRefreshCw, FiRotateCcw, FiX } from 'react-icons/fi';
import CloseButton from './CloseButton';
import Pagination from './Pagination';
import ToastMessage from './ToastMessage';
import RoundLineChart from './RoundLineChart';
import usePagination from '../hooks/usePagination';
import {
  ALL_FILTER,
  METRIC_FIELDS,
  buildLearnerComparisons,
  buildRoundSeries,
  buildRoundTrend,
  filterRecords,
  getCurrentRounds,
  rankBarangays,
  roundTo,
  summarizeByBarangay,
  summarizeRecords,
} from '../utils/assessmentHistory';
import {
  describeSkipReason,
  getAssessmentHistoryData,
  openReassessmentRound,
} from '../utils/assessmentHistoryService';
import './BarangayAssessmentHistory.css';

gsap.registerPlugin(useGSAP);

const MAX_LEARNERS_PER_RESET = 200;
const MAX_REASON_LENGTH = 500;
const MAX_BARANGAY_LINES = 5;

// Pre/post keep the colors used by the other Analytics charts. Categorical
// slots (validated for color-vision deficiency) follow module number and
// barangay rank, so an entity keeps its color when filters change.
const PRE_COLOR = '#2563eb';
const POST_COLOR = '#15803d';
const REFERENCE_COLOR = '#98a2b3';
const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];

const METRIC_OPTIONS = [
  { value: 'post', label: 'Post-assessment' },
  { value: 'pre', label: 'Pre-assessment' },
  { value: 'gain', label: 'Gain' },
];

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

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
);

// Counts up to a new value. The text is written only here (not as React
// children) so GSAP and React never update the same text node.
function AnimatedFigure({ value, format }) {
  const ref = useRef(null);
  const shown = useRef(0);
  const formatRef = useRef(format);

  useEffect(() => {
    formatRef.current = format;
  });

  useGSAP(() => {
    const element = ref.current;
    if (!element) return;
    const render = (next) => { element.textContent = formatRef.current(next); };

    if (value === null || value === undefined) {
      element.textContent = '—';
      shown.current = 0;
      return;
    }
    if (prefersReducedMotion()) {
      render(value);
      shown.current = value;
      return;
    }

    const state = { current: shown.current };
    shown.current = value;
    gsap.to(state, {
      current: value,
      duration: 0.9,
      ease: 'power3.out',
      onUpdate: () => render(roundTo(state.current, Number.isInteger(value) ? 0 : 1)),
      onComplete: () => render(value),
    });
  }, { dependencies: [value] });

  return <strong ref={ref} className="bah-figure-value" />;
}

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

function ChartBlock({ title, description, scope, className = '', children }) {
  return (
    <section className={`bah-chart-block bah-reveal ${className}`.trim()}>
      <header className="bah-chart-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {scope && <span className={`bah-scope ${scope.tone}`}>{scope.label}</span>}
      </header>
      {children}
    </section>
  );
}

export default function BarangayAssessmentHistory() {
  const rootRef = useRef(null);
  const chartsRef = useRef(null);

  const [history, setHistory] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  const [barangay, setBarangay] = useState(ALL_FILTER);
  const [learnerId, setLearnerId] = useState(ALL_FILTER);
  const [moduleId, setModuleId] = useState(ALL_FILTER);
  const [round, setRound] = useState(ALL_FILTER);
  const [metric, setMetric] = useState('post');
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

  const hasHistory = Boolean(history);

  // Blocks rise into view as they are scrolled to. They are hidden only while
  // motion is allowed; matchMedia.revert() restores them otherwise. An
  // IntersectionObserver (viewport root) is used instead of ScrollTrigger
  // because on narrow screens <body>, not the window, is the scroll container.
  useGSAP(() => {
    if (!hasHistory || typeof IntersectionObserver === 'undefined') return undefined;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', (context) => {
      const blocks = gsap.utils.toArray('.bah-reveal', rootRef.current);
      gsap.set(blocks, { autoAlpha: 0, y: 24 });
      // A named context method, so tweens it starts later (from the observer)
      // still belong to this context and are cleaned up by media.revert().
      context.add('reveal', (targets) => gsap.to(targets, {
        autoAlpha: 1,
        y: 0,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.08,
        overwrite: true,
      }));
      const observer = new IntersectionObserver((entries) => {
        const entering = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target);
        if (!entering.length) return;
        entering.forEach((element) => observer.unobserve(element));
        context.reveal(entering);
      }, { rootMargin: '0px 0px -8% 0px' });
      blocks.forEach((block) => observer.observe(block));
      return () => observer.disconnect();
    });
    return () => media.revert();
  }, { scope: rootRef, dependencies: [hasHistory], revertOnUpdate: true });

  const records = useMemo(() => history?.records || [], [history]);
  const modules = useMemo(() => history?.modules || [], [history]);
  const learners = useMemo(() => history?.learners || [], [history]);

  // A filter value that no longer exists after a refresh falls back to "All".
  const activeBarangay = history?.barangays?.includes(barangay) ? barangay : ALL_FILTER;
  const activeLearnerId = learners.some((learner) => learner.id === learnerId) ? learnerId : ALL_FILTER;
  const activeModuleId = modules.some((module) => module.id === moduleId) ? moduleId : ALL_FILTER;
  const activeRound = history?.rounds?.includes(Number(round)) ? round : ALL_FILTER;
  const activeLearner = learners.find((learner) => learner.id === activeLearnerId) || null;
  const isIndividual = activeLearner !== null;

  // Same filters across every round: the source for round-by-round charts.
  const allRoundRecords = useMemo(
    () => filterRecords(records, { barangay: activeBarangay, userId: activeLearnerId, moduleId: activeModuleId }),
    [records, activeBarangay, activeLearnerId, activeModuleId],
  );
  const filteredRecords = useMemo(
    () => filterRecords(allRoundRecords, { round: activeRound }),
    [allRoundRecords, activeRound],
  );

  const overall = useMemo(() => summarizeRecords(filteredRecords), [filteredRecords]);
  const roundTrend = useMemo(() => buildRoundTrend(allRoundRecords), [allRoundRecords]);
  const comparisons = useMemo(
    () => buildLearnerComparisons(allRoundRecords, { round: activeRound }),
    [allRoundRecords, activeRound],
  );
  const currentRounds = useMemo(() => getCurrentRounds(records), [records]);

  // Barangay chart: always group averages (never one learner) for the selected
  // module. Colors come from each barangay's rank on all data.
  const barangayRank = useMemo(() => rankBarangays(records), [records]);
  const barangaySource = useMemo(
    () => filterRecords(records, { moduleId: activeModuleId }),
    [records, activeModuleId],
  );
  const barangaySeries = useMemo(
    () => buildRoundSeries(barangaySource, (record) => record.barangay),
    [barangaySource],
  );
  const barangayTableRows = useMemo(
    () => summarizeByBarangay(filterRecords(barangaySource, { round: activeRound }), barangaySource),
    [barangaySource, activeRound],
  );

  const moduleSeries = useMemo(
    () => buildRoundSeries(allRoundRecords, (record) => record.moduleNo),
    [allRoundRecords],
  );

  const metricField = METRIC_FIELDS[metric];
  const isGain = metric === 'gain';
  const metricLabel = METRIC_OPTIONS.find((option) => option.value === metric)?.label || '';

  const roundChart = useMemo(() => ({
    rounds: roundTrend.map((point) => point.roundNo),
    series: [
      {
        key: 'pre',
        label: 'Pre-assessment',
        color: PRE_COLOR,
        values: roundTrend.map((point) => point.averagePre),
        learners: roundTrend.map((point) => point.learners),
      },
      {
        key: 'post',
        label: 'Post-assessment',
        color: POST_COLOR,
        values: roundTrend.map((point) => point.averagePost),
        learners: roundTrend.map((point) => point.learners),
      },
    ],
  }), [roundTrend]);

  const barangayChart = useMemo(() => {
    const visible = activeBarangay === ALL_FILTER
      ? barangayRank.slice(0, MAX_BARANGAY_LINES)
      : [activeBarangay];
    const lines = visible
      .map((name) => barangaySeries.series.find((line) => line.key === name))
      .filter(Boolean)
      .map((line) => {
        const rank = barangayRank.indexOf(line.key);
        return {
          key: line.key,
          label: line.key,
          color: SERIES_COLORS[rank >= 0 && rank < SERIES_COLORS.length ? rank : 0],
          values: line.points.map((point) => point?.[metricField] ?? null),
          learners: line.points.map((point) => point?.learners ?? null),
        };
      });

    const allTrend = new Map(buildRoundTrend(barangaySource).map((point) => [point.roundNo, point]));
    const reference = {
      key: 'all',
      label: 'All barangays',
      color: REFERENCE_COLOR,
      dashed: true,
      values: barangaySeries.rounds.map((roundNo) => allTrend.get(roundNo)?.[metricField] ?? null),
      learners: barangaySeries.rounds.map((roundNo) => allTrend.get(roundNo)?.learners ?? null),
    };

    return {
      rounds: barangaySeries.rounds,
      series: lines.length ? [...lines, reference] : [],
      hiddenCount: activeBarangay === ALL_FILTER
        ? Math.max(0, barangaySeries.series.length - lines.length)
        : 0,
    };
  }, [activeBarangay, barangayRank, barangaySeries, barangaySource, metricField]);

  const moduleChart = useMemo(() => ({
    rounds: moduleSeries.rounds,
    series: [...moduleSeries.series]
      .sort((a, b) => a.key - b.key)
      .map((line) => ({
        key: String(line.key),
        label: `Module ${line.key}`,
        color: SERIES_COLORS[(line.key - 1) % SERIES_COLORS.length],
        values: line.points.map((point) => point?.[metricField] ?? null),
        learners: line.points.map((point) => point?.learners ?? null),
      })),
  }), [moduleSeries, metricField]);

  const filterKey = `${activeBarangay}|${activeLearnerId}|${activeModuleId}|${activeRound}`;
  const barangayPages = usePagination(barangayTableRows, `${activeModuleId}|${activeRound}`);
  const comparisonPages = usePagination(comparisons, filterKey);

  const learnerOptions = useMemo(() => learners.filter((learner) => (
    activeBarangay === ALL_FILTER
    || learner.barangay === activeBarangay
    || learner.id === activeLearnerId
  )), [learners, activeBarangay, activeLearnerId]);

  const normalizedQuery = learnerQuery.trim().toLowerCase();
  const pickableLearners = useMemo(() => learners.filter((learner) => (
    (activeBarangay === ALL_FILTER || learner.barangay === activeBarangay)
    && (!normalizedQuery
      || learner.name.toLowerCase().includes(normalizedQuery)
      || learner.email.toLowerCase().includes(normalizedQuery))
  )), [learners, activeBarangay, normalizedQuery]);

  const learnerNameById = useMemo(
    () => new Map(learners.map((learner) => [learner.id, learner.name])),
    [learners],
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

  const focusLearner = (id) => {
    setLearnerId(id);
    chartsRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
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
  const hasActiveFilters = [activeBarangay, activeLearnerId, activeModuleId, activeRound]
    .some((value) => value !== ALL_FILTER);

  const clearFilters = () => {
    setBarangay(ALL_FILTER);
    setLearnerId(ALL_FILTER);
    setModuleId(ALL_FILTER);
    setRound(ALL_FILTER);
  };

  // Every chart states whether it shows a group average or one learner.
  const scope = isIndividual
    ? { tone: 'is-individual', label: `Individual · ${activeLearner.name}` }
    : { tone: 'is-average', label: `Average · ${overall.learners} learner${overall.learners === 1 ? '' : 's'}` };

  const highlightRound = activeRound === ALL_FILTER ? null : activeRound;

  return (
    <section className="bah" aria-labelledby="bah-title" ref={rootRef}>
      {toast && <ToastMessage key={toast.id} type={toast.type} message={toast.message} />}

      <div className="analytics-section-heading bah-heading">
        <div>
          <span>Assessment history</span>
          <h2 id="bah-title">Barangay Assessment History</h2>
          <p>
            Pre- and post-assessment results by barangay, learner, module and assessment round. Barangay is
            self-declared by learners in the mobile app; it is not verified residency or attendance.
          </p>
        </div>
        <button
          type="button"
          className="bah-refresh"
          onClick={() => { setIsLoading(true); setRefreshTick((tick) => tick + 1); }}
          disabled={isLoading}
        >
          <FiRefreshCw aria-hidden="true" className={isLoading ? 'is-spinning' : ''} /> Refresh
        </button>
      </div>

      <div className="analytics-filters bah-filters" ref={chartsRef}>
        <div className="filter-pill">
          <span className="filter-label">Barangay:</span>
          <select value={activeBarangay} onChange={(event) => setBarangay(event.target.value)} aria-label="Filter assessment history by barangay">
            <option value={ALL_FILTER}>All</option>
            {(history?.barangays || []).map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </div>
        <div className="filter-pill">
          <span className="filter-label">Learner:</span>
          <select value={activeLearnerId} onChange={(event) => setLearnerId(event.target.value)} aria-label="Filter assessment history by learner">
            <option value={ALL_FILTER}>All</option>
            {learnerOptions.map((learner) => <option key={learner.id} value={learner.id}>{learner.name}</option>)}
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
        {hasActiveFilters && (
          <button type="button" className="bah-clear" onClick={clearFilters}>
            <FiX aria-hidden="true" /> Clear filters
          </button>
        )}
      </div>

      {loadError && <div className="bah-notice is-error" role="alert">{loadError}</div>}

      {isLoading && !history ? (
        <div className="bah-loading" role="status">
          <span className="analytics-skeleton analytics-skeleton-block" aria-hidden="true" />
          <span className="bah-visually-hidden">Loading assessment history...</span>
        </div>
      ) : history && (
        <>
          <dl
            className="bah-figures bah-reveal"
            aria-label={isIndividual ? `Results for ${activeLearner.name}` : 'Results for the selected filters'}
          >
            <div className="bah-figure">
              <dt>Learners</dt>
              <dd><AnimatedFigure value={overall.learners} format={String} /></dd>
            </div>
            <div className="bah-figure">
              <dt><span className="bah-key" style={{ background: PRE_COLOR }} aria-hidden="true" />Avg. pre-assessment</dt>
              <dd><AnimatedFigure value={overall.averagePre} format={formatScore} /></dd>
            </div>
            <div className="bah-figure">
              <dt><span className="bah-key" style={{ background: POST_COLOR }} aria-hidden="true" />Avg. post-assessment</dt>
              <dd><AnimatedFigure value={overall.averagePost} format={formatScore} /></dd>
            </div>
            <div className="bah-figure">
              <dt>Avg. gain (post − pre)</dt>
              <dd className={`bah-change ${changeTone(overall.averageGain)}`}>
                <AnimatedFigure value={overall.averageGain} format={formatPoints} />
              </dd>
            </div>
            <div className="bah-figure">
              <dt>Completion</dt>
              <dd>
                <AnimatedFigure value={overall.completionRate} format={(value) => `${value}%`} />
                <small>{overall.completed} of {overall.started} pre-assessments followed by a post-assessment</small>
              </dd>
            </div>
          </dl>

          <ChartBlock
            className="bah-chart-hero"
            title="Pre- vs Post-Assessment by Round"
            description={isIndividual
              ? `${activeLearner.name}'s own scores in each round${activeModuleId === ALL_FILTER ? ' (averaged across modules)' : ''}.`
              : 'Average scores of the filtered learners in each round. Hover a round for exact values.'}
            scope={scope}
          >
            {roundChart.rounds.length === 0 ? (
              <p className="bah-empty">No submitted assessments match these filters.</p>
            ) : (
              <>
                <div className="bah-chart bah-chart-lg">
                  <RoundLineChart
                    rounds={roundChart.rounds}
                    series={roundChart.series}
                    highlightRound={highlightRound}
                    ariaLabel="Line chart of pre- and post-assessment scores by assessment round"
                  />
                </div>
                {roundChart.rounds.length === 1 && (
                  <p className="bah-hint">
                    Only Round {roundChart.rounds[0]} has results so far. Lines connect rounds once learners retake
                    assessments after a reassessment round is opened below.
                  </p>
                )}
              </>
            )}
          </ChartBlock>

          <div className="bah-metric-bar bah-reveal">
            <span id="bah-metric-label">Compare trends by</span>
            <div className="bah-segmented" role="radiogroup" aria-labelledby="bah-metric-label">
              {METRIC_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={metric === option.value}
                  className={metric === option.value ? 'is-active' : ''}
                  onClick={() => setMetric(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bah-chart-pair">
            <ChartBlock
              title="Barangay Performance Trend"
              description={`Group average ${metricLabel.toLowerCase()}${isGain ? ' in score points' : ''} per barangay and round, compared with all barangays (dashed). Not affected by the learner filter.`}
              scope={{ tone: 'is-average', label: 'Barangay averages' }}
            >
              {barangayChart.series.length === 0 ? (
                <p className="bah-empty">No barangay results for these filters yet.</p>
              ) : (
                <>
                  <div className="bah-chart">
                    <RoundLineChart
                      rounds={barangayChart.rounds}
                      series={barangayChart.series}
                      isGain={isGain}
                      highlightRound={highlightRound}
                      ariaLabel={`Line chart of barangay average ${metricLabel} by assessment round`}
                    />
                  </div>
                  {barangayChart.hiddenCount > 0 && (
                    <p className="bah-hint">
                      Showing the {MAX_BARANGAY_LINES} barangays with the most learners. Choose a barangay in the
                      filters to plot any other one, or open the barangay table below.
                    </p>
                  )}
                </>
              )}
            </ChartBlock>

            <ChartBlock
              title="Module Performance by Round"
              description={`${isIndividual ? 'Score' : 'Average'} ${metricLabel.toLowerCase()}${isGain ? ' in score points' : ''} for each fire-safety module in every round.`}
              scope={scope}
            >
              {moduleChart.series.length === 0 ? (
                <p className="bah-empty">No module results for these filters yet.</p>
              ) : (
                <div className="bah-chart">
                  <RoundLineChart
                    rounds={moduleChart.rounds}
                    series={moduleChart.series}
                    isGain={isGain}
                    highlightRound={highlightRound}
                    ariaLabel={`Line chart of module ${metricLabel} by assessment round`}
                  />
                </div>
              )}
            </ChartBlock>
          </div>

          <section className="bah-panel bah-reveal" aria-labelledby="bah-learners-title">
            <header className="bah-chart-head">
              <div>
                <h3 id="bah-learners-title">Individual Learner Progress</h3>
                <p>
                  Each learner&apos;s {activeRound === ALL_FILTER ? 'latest round' : `Round ${activeRound}`} compared
                  with the round before it, in score points and percentage change. Select a name to plot that
                  learner in the charts above.
                </p>
              </div>
            </header>
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
                        <tr key={row.key} className={row.userId === activeLearnerId ? 'is-focused' : ''}>
                          <th scope="row">
                            <button
                              type="button"
                              className="bah-learner-link"
                              onClick={() => focusLearner(row.userId)}
                              aria-label={`Show ${row.learnerName} in the charts`}
                            >
                              {row.learnerName}
                            </button>
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
                            {(row.current.postSubmittedAt || row.current.preSubmittedAt) && (
                              <small>Last completed {formatDate(row.current.postSubmittedAt || row.current.preSubmittedAt)}</small>
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
          </section>

          <details className="bah-panel bah-details bah-reveal">
            <summary>
              <span>
                <strong>Barangay averages table</strong>
                <small>
                  Every barangay{activeRound === ALL_FILTER ? '' : ` in Round ${activeRound}`}, with the average
                  post-assessment score in each round.
                </small>
              </span>
            </summary>
            {barangayTableRows.length === 0 ? (
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
                        <th scope="col">Post score by round</th>
                      </tr>
                    </thead>
                    <tbody>
                      {barangayPages.items.map((row) => (
                        <tr key={row.barangay} className={row.barangay === activeBarangay ? 'is-focused' : ''}>
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
          </details>

          <section className="bah-panel bah-reassess bah-reveal" aria-labelledby="bah-reassess-title">
            <header className="bah-chart-head">
              <div>
                <h3 id="bah-reassess-title">Phase 2 Reassessment</h3>
                <p>
                  Opens the next assessment round (pre- and post-assessment) for the selected learners and modules.
                  Earlier scores and answers are kept, and every reset is recorded in the Audit Logs. Learning
                  Material progress, 3D Simulations and medals are not changed. Learners can take each assessment
                  once per round.
                </p>
              </div>
            </header>

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
          </section>
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
            <p className="bah-dialog-note">
              In the current mobile app, the module&apos;s Learning Material opens again after the learner takes the
              new round&apos;s pre-assessment. 3D Simulations stay available.
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
