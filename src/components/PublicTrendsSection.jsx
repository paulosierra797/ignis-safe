import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { FiBarChart2, FiInfo, FiRefreshCw, FiShield } from 'react-icons/fi';
import { useLandingContent } from '../context/LandingContentContext';
import { getPublicTrends } from '../utils/publicContentService';
import { MANILA_TIME_ZONE } from '../utils/dateUtils';
import './PublicTrendsSection.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);
gsap.registerPlugin(useGSAP);

// Validated categorical pair (CVD separation and contrast pass on white).
const SERIES_RED = '#b42318';
const SERIES_BLUE = '#2e6fae';
const INK = '#172033';
const MUTED = '#667085';
const GRID = 'rgba(23, 32, 51, 0.07)';

const COPY = {
  english: {
    locale: 'en-PH',
    eyebrow: 'Community Trends',
    title: 'How Dasmariñas is learning fire safety',
    intro: 'Live totals from IGNIS SAFE learning records. Every number here is counted directly from the database and describes groups of learners, never individual people.',
    updated: 'Updated',
    privacy: 'Only combined totals are published. No names, contact details, birthdays, or individual scores are ever shown.',
    loading: 'Loading community trends…',
    errorTitle: 'Trends are temporarily unavailable',
    errorText: 'We could not load the latest records. Please try again in a moment.',
    retry: 'Try again',
    emptyTitle: 'Not enough data yet',
    emptyText: 'This graph will appear once there are valid records to show.',
    explainShows: 'What it shows',
    explainMeans: 'What it means',
    explainRead: 'How to read it',
    tableCaption: 'Data table',
    month: 'Month',
    points: 'pts',
    stats: {
      learners: { label: 'Registered learners', hint: 'Verified mobile app accounts' },
      barangays: { label: 'Barangays represented', hint: 'Official barangays of Dasmariñas', of: 'of' },
      modules: { label: 'Completed modules', hint: 'Pre-test, lesson, and post-test finished' },
      difference: { label: 'Average assessment difference', hint: 'Post-test average minus pre-test average', empty: 'Not enough data yet' },
    },
    participation: {
      title: 'Participation over time',
      subtitle: 'Valid learning activities each month',
      activities: 'Learning activities',
      learners: 'Active learners',
      activitiesHint: 'Tests, lessons, and simulations finished that month.',
      learnersHint: 'Different people who took part that month.',
      shows: 'How much learning happened each month.',
      means: 'A higher line means more people are learning.',
      read: 'Go left to right, oldest to newest. Tap a point for the numbers. The last month is still counting.',
    },
    registrations: {
      title: 'Registered learners over time',
      subtitle: 'Running total of verified accounts',
      series: 'Registered learners',
      shows: 'How many people have signed up so far.',
      means: 'A rising line means the program is reaching more people.',
      read: 'The far right is today’s total. A steeper climb means more sign-ups.',
    },
    barangays: {
      title: 'Barangays represented',
      subtitle: 'Barangays with at least one registered learner',
      series: 'Barangays represented',
      coverage: (count, total, percent) => `${count} of ${total} official barangays (${percent}%)`,
      coverageHint: 'Barangays with a learner, out of all barangays in the city.',
      shows: 'How many barangays have at least one learner.',
      means: 'More barangays means learning is spreading across the city.',
      read: 'Each step up is a new barangay. The bar below shows how close we are to all of them.',
    },
  },
  tagalog: {
    locale: 'fil-PH',
    eyebrow: 'Mga Trend sa Komunidad',
    title: 'Paano natututo ng kaligtasan sa sunog ang Dasmariñas',
    intro: 'Mga kasalukuyang kabuuan mula sa mga talaan ng pag-aaral sa IGNIS SAFE. Bawat numero rito ay direktang binilang mula sa database at naglalarawan ng grupo ng mga mag-aaral, hindi ng iisang tao.',
    updated: 'Na-update',
    privacy: 'Pinagsamang kabuuan lamang ang inilalathala. Hindi kailanman ipinapakita ang pangalan, contact details, kaarawan, o indibidwal na score.',
    loading: 'Kinukuha ang mga trend sa komunidad…',
    errorTitle: 'Pansamantalang hindi makita ang mga trend',
    errorText: 'Hindi namin makuha ang pinakabagong talaan. Pakisubukang muli mamaya.',
    retry: 'Subukang muli',
    emptyTitle: 'Kulang pa ang datos',
    emptyText: 'Lalabas ang graph na ito kapag may sapat at beripikadong talaan na.',
    explainShows: 'Ano ang ipinapakita',
    explainMeans: 'Ano ang ibig sabihin',
    explainRead: 'Paano ito basahin',
    tableCaption: 'Talahanayan ng datos',
    month: 'Buwan',
    points: 'puntos',
    stats: {
      learners: { label: 'Mga rehistradong mag-aaral', hint: 'Beripikadong account sa mobile app' },
      barangays: { label: 'Mga barangay na kinakatawan', hint: 'Opisyal na mga barangay ng Dasmariñas', of: 'sa' },
      modules: { label: 'Mga natapos na module', hint: 'Tapos ang pre-test, aralin, at post-test' },
      difference: { label: 'Average na pagbabago sa assessment', hint: 'Average ng post-test bawas ang average ng pre-test', empty: 'Kulang pa ang datos' },
    },
    participation: {
      title: 'Pakikilahok sa paglipas ng panahon',
      subtitle: 'Mga beripikadong gawain sa pag-aaral bawat buwan',
      activities: 'Mga gawain sa pag-aaral',
      learners: 'Mga aktibong mag-aaral',
      activitiesHint: 'Mga test, aralin, at simulation na natapos sa buwang iyon.',
      learnersHint: 'Mga magkakaibang taong lumahok sa buwang iyon.',
      shows: 'Gaano karaming pag-aaral ang nangyari bawat buwan.',
      means: 'Kapag mas mataas ang linya, mas maraming tao ang nag-aaral.',
      read: 'Basahin mula kaliwa pakanan, pinakaluma hanggang pinakabago. I-tap ang tuldok para sa bilang. Bilang pa rin ang huling buwan.',
    },
    registrations: {
      title: 'Mga rehistradong mag-aaral sa paglipas ng panahon',
      subtitle: 'Tumatakbong kabuuan ng mga beripikadong account',
      series: 'Mga rehistradong mag-aaral',
      shows: 'Ilang tao na ang nag-sign up hanggang ngayon.',
      means: 'Kapag tumataas ang linya, mas maraming tao ang naaabot ng programa.',
      read: 'Ang dulong kanan ang kabuuan ngayon. Mas matarik, mas maraming nag-sign up.',
    },
    barangays: {
      title: 'Mga barangay na kinakatawan',
      subtitle: 'Mga barangay na may kahit isang rehistradong mag-aaral',
      series: 'Mga barangay na kinakatawan',
      coverage: (count, total, percent) => `${count} sa ${total} opisyal na barangay (${percent}%)`,
      coverageHint: 'Mga barangay na may mag-aaral, mula sa lahat ng barangay sa lungsod.',
      shows: 'Ilang barangay ang may kahit isang mag-aaral.',
      means: 'Kapag mas maraming barangay, mas lumalaganap ang pag-aaral sa buong lungsod.',
      read: 'Bawat pagtaas ay bagong barangay. Ipinapakita ng bar sa ibaba kung gaano na tayo kalapit sa lahat.',
    },
  },
};

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

// Month keys are calendar months already bucketed in Manila time by the
// database, so they are formatted as UTC dates to avoid any timezone shift.
const monthDate = (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
};

const formatMonth = (monthKey, locale) => new Intl.DateTimeFormat(locale, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
}).format(monthDate(monthKey));

const formatShortMonth = (monthKey, locale) => new Intl.DateTimeFormat(locale, {
  month: 'short',
  timeZone: 'UTC',
}).format(monthDate(monthKey));

const formatUpdatedAt = (value, locale) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: MANILA_TIME_ZONE,
  }).format(date);
};

const formatScore = (value, locale) => new Intl.NumberFormat(locale, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
}).format(value);

const formatSignedScore = (value, locale) => {
  const formatted = formatScore(Math.abs(value), locale);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
};

const hexToRgb = (hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(', ');

const areaGradient = (hex) => (context) => {
  const { ctx, chartArea } = context.chart;
  if (!chartArea) return 'transparent';
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, `rgba(${hexToRgb(hex)}, 0.16)`);
  gradient.addColorStop(1, `rgba(${hexToRgb(hex)}, 0)`);
  return gradient;
};

const TOOLTIP_STYLE = {
  backgroundColor: INK,
  titleColor: '#ffffff',
  bodyColor: 'rgba(255, 255, 255, 0.86)',
  footerColor: '#ffffff',
  titleFont: { family: 'Poppins', size: 12, weight: '600' },
  bodyFont: { family: 'Poppins', size: 12 },
  footerFont: { family: 'Poppins', size: 12, weight: '600' },
  padding: 12,
  cornerRadius: 8,
  boxPadding: 5,
  usePointStyle: true,
  caretSize: 5,
};

const AXIS_TICKS = { color: MUTED, font: { family: 'Poppins', size: 11 } };

const lineDataset = (label, values, color, overrides = {}) => ({
  label,
  data: values,
  borderColor: color,
  backgroundColor: areaGradient(color),
  pointBackgroundColor: color,
  pointBorderColor: '#ffffff',
  pointBorderWidth: 2,
  pointRadius: 3.5,
  pointHoverRadius: 6,
  pointHitRadius: 14,
  borderWidth: 2,
  // Monotone curves never overshoot between months, so the line never implies
  // a value above or below what was actually recorded.
  cubicInterpolationMode: 'monotone',
  fill: 'origin',
  ...overrides,
});

const buildLineOptions = ({ locale, reduceMotion }) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: reduceMotion ? false : { duration: 1100, easing: 'easeOutQuart' },
  interaction: { mode: 'index', intersect: false },
  layout: { padding: { top: 6, right: 6 } },
  plugins: {
    legend: { display: false },
    tooltip: {
      ...TOOLTIP_STYLE,
      callbacks: { title: (items) => (items[0] ? formatMonth(items[0].label, locale) : '') },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      border: { color: GRID },
      ticks: {
        ...AXIS_TICKS,
        maxRotation: 0,
        autoSkipPadding: 12,
        callback(value) { return formatShortMonth(this.getLabelForValue(value), locale); },
      },
    },
    y: {
      beginAtZero: true,
      suggestedMax: 4,
      grid: { color: GRID },
      border: { display: false },
      ticks: { ...AXIS_TICKS, precision: 0, maxTicksLimit: 5 },
    },
  },
});

// Only one tip is open at a time; opening one tells the others to close.
const TIP_OPEN_EVENT = 'trends-tip-open';
const TIP_EDGE = 8;

// Small on-demand tooltip. It opens on hover (mouse), keyboard focus, or tap/click,
// and closes on Escape, a second tap, or a tap anywhere outside. It is never shown on its own.
function TrendsTip({ content, className = '', bubbleClassName = '', expandable = false, children }) {
  const id = useId();
  const rootRef = useRef(null);
  const bubbleRef = useRef(null);
  const wasOpen = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || focused || pinned;

  const close = useCallback(() => {
    setHovered(false);
    setFocused(false);
    setPinned(false);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) close();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };
    const onOtherOpen = (event) => {
      if (event.detail !== id) close();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener(TIP_OPEN_EVENT, onOtherOpen);
    window.dispatchEvent(new CustomEvent(TIP_OPEN_EVENT, { detail: id }));
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(TIP_OPEN_EVENT, onOtherOpen);
    };
  }, [open, close, id]);

  // Fade/slide in and out, and keep the bubble inside the viewport.
  useEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) return undefined;
    if (!open && !wasOpen.current) return undefined;
    wasOpen.current = open;

    const quick = prefersReducedMotion();
    gsap.killTweensOf(bubble);

    if (open) {
      bubble.style.marginLeft = '0px';
      const rect = bubble.getBoundingClientRect();
      const maxRight = document.documentElement.clientWidth - TIP_EDGE;
      let shift = 0;
      if (rect.right > maxRight) shift = maxRight - rect.right;
      if (rect.left + shift < TIP_EDGE) shift = TIP_EDGE - rect.left;
      bubble.style.marginLeft = `${Math.round(shift)}px`;

      gsap.fromTo(
        bubble,
        { autoAlpha: 0, y: quick ? 0 : 6, scale: quick ? 1 : 0.97 },
        { autoAlpha: 1, y: 0, scale: 1, duration: quick ? 0 : 0.24, ease: 'power3.out' },
      );
    } else {
      gsap.to(bubble, { autoAlpha: 0, y: quick ? 0 : 4, duration: quick ? 0 : 0.16, ease: 'power2.in' });
    }
    return () => gsap.killTweensOf(bubble);
  }, [open]);

  const triggerProps = {
    'aria-describedby': id,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onClick: () => {
      if (pinned) close();
      else setPinned(true);
    },
  };
  if (expandable) triggerProps['aria-expanded'] = open;

  return (
    <span
      ref={rootRef}
      className={`trends-tip ${className}`.trim()}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true); }}
      onPointerLeave={(event) => { if (event.pointerType === 'mouse') setHovered(false); }}
    >
      {children(triggerProps)}
      <span ref={bubbleRef} id={id} role="tooltip" className={`trends-tip-bubble ${bubbleClassName}`.trim()}>
        {content}
      </span>
    </span>
  );
}

function TrendsLegend({ items }) {
  return (
    <ul className="trends-legend">
      {items.map((item) => (
        <li key={item.label}>
          <TrendsTip content={item.hint} bubbleClassName="is-small">
            {(tipProps) => (
              <button type="button" className="trends-legend-item" {...tipProps}>
                <span className={`trends-legend-swatch is-${item.shape || 'line'}`} style={{ '--swatch': item.color }} />
                {item.label}
              </button>
            )}
          </TrendsTip>
        </li>
      ))}
    </ul>
  );
}

function TrendsEmpty({ title, text }) {
  return (
    <div className="trends-empty" role="status">
      <FiBarChart2 aria-hidden="true" />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

// Screen-reader table view of each graph, so the numbers never depend on the canvas.
function TrendsTable({ caption, columns, rows }) {
  return (
    <table className="trends-sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[0]}>
            <th scope="row">{row[0]}</th>
            {row.slice(1).map((cell, index) => <td key={columns[index + 1]}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrendsInfo({ copy, section }) {
  return (
    <dl className="trends-info">
      <div>
        <dt>{copy.explainShows}</dt>
        <dd>{section.shows}</dd>
      </div>
      <div>
        <dt>{copy.explainMeans}</dt>
        <dd>{section.means}</dd>
      </div>
      <div>
        <dt>{copy.explainRead}</dt>
        <dd>{section.read}</dd>
      </div>
    </dl>
  );
}

function TrendsFigure({ index, title, subtitle, copy, section, children }) {
  return (
    <article className="trends-figure" data-trends-reveal>
      <header className="trends-figure-header">
        <span className="trends-figure-index" aria-hidden="true">{String(index).padStart(2, '0')}</span>
        <div>
          <h3>
            <TrendsTip content={<TrendsInfo copy={copy} section={section} />} bubbleClassName="is-info" expandable>
              {(tipProps) => (
                <button type="button" className="trends-title-button" {...tipProps}>
                  <span>{title}</span>
                  <FiInfo aria-hidden="true" />
                </button>
              )}
            </TrendsTip>
          </h3>
          <p>{subtitle}</p>
        </div>
      </header>
      {children}
    </article>
  );
}

function TrendsStat({ label, hint, value, countTo, suffix, muted = false }) {
  return (
    <div className={`trends-stat${muted ? ' is-muted' : ''}`}>
      <dt>{label}</dt>
      <dd>
        <span className="trends-stat-value">
          <span data-count-to={countTo}>{value}</span>
          {suffix ? <small>{suffix}</small> : null}
        </span>
        <span className="trends-stat-hint">{hint}</span>
      </dd>
    </div>
  );
}

function TrendsSkeleton({ label }) {
  return (
    <div className="trends-skeleton" role="status" aria-label={label}>
      <div className="trends-skeleton-stats">
        {[0, 1, 2, 3].map((item) => <span key={item} />)}
      </div>
      <div className="trends-skeleton-chart" />
    </div>
  );
}

const toLoadedState = ({ data, error }) => (
  error || !data ? { status: 'error', data: null } : { status: 'ready', data }
);

export default function PublicTrendsSection() {
  const { language } = useLandingContent();
  const copy = COPY[language] || COPY.english;
  const { locale } = copy;
  const sectionRef = useRef(null);
  const [state, setState] = useState({ status: 'loading', data: null });
  const [chartsInView, setChartsInView] = useState(() => typeof IntersectionObserver === 'undefined');
  const [reduceMotion] = useState(prefersReducedMotion);

  useEffect(() => {
    let active = true;
    getPublicTrends().then((result) => {
      if (active) setState(toLoadedState(result));
    });
    return () => { active = false; };
  }, []);

  const retry = useCallback(async () => {
    setState({ status: 'loading', data: null });
    setState(toLoadedState(await getPublicTrends()));
  }, []);

  // Charts mount only once the section nears the viewport, so their draw-in
  // animation is actually seen and the landing page does no chart work up front.
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || chartsInView) return undefined;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setChartsInView(true);
      observer.disconnect();
    }, { rootMargin: '0px 0px 120px 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [chartsInView]);

  // Scroll reveal: each block rises in as it enters the viewport, and headline
  // numbers count up to their real value (the DOM always holds the final value).
  useGSAP((context, contextSafe) => {
    const root = sectionRef.current;
    if (!root || state.status === 'loading') return undefined;

    const targets = gsap.utils.toArray('[data-trends-reveal]', root);
    if (targets.length === 0) return undefined;

    const media = gsap.matchMedia();
    let observer;

    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.set(targets, { autoAlpha: 0, y: 28 });

      const countUp = (container) => {
        container.querySelectorAll('[data-count-to]').forEach((element) => {
          const textNode = element.firstChild;
          const finalValue = Number(element.dataset.countTo);
          if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !Number.isFinite(finalValue)) return;

          const finalText = textNode.nodeValue;
          const counter = { value: 0 };
          gsap.to(counter, {
            value: finalValue,
            duration: 1.2,
            ease: 'power2.out',
            onUpdate: () => { textNode.nodeValue = String(Math.round(counter.value)); },
            onComplete: () => { textNode.nodeValue = finalText; },
          });
        });
      };

      const reveal = contextSafe((elements) => {
        gsap.to(elements, {
          autoAlpha: 1,
          y: 0,
          duration: 0.75,
          stagger: 0.09,
          ease: 'power3.out',
          clearProps: 'opacity,visibility,transform',
        });
        elements.forEach(countUp);
      });

      observer = new IntersectionObserver((entries) => {
        const entering = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target);
        if (entering.length === 0) return;
        entering.forEach((target) => observer.unobserve(target));
        reveal(entering);
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

      targets.forEach((target) => observer.observe(target));
      return () => observer?.disconnect();
    });

    return () => {
      observer?.disconnect();
      media.revert();
    };
  }, { scope: sectionRef, dependencies: [state.status], revertOnUpdate: true });

  const data = state.data;

  const charts = useMemo(() => {
    if (!data) return null;

    const lineOptions = buildLineOptions({ locale, reduceMotion });

    const participation = {
      hasData: data.participationByMonth.some((point) => point.activities > 0),
      data: {
        labels: data.participationByMonth.map((point) => point.month),
        datasets: [
          lineDataset(copy.participation.activities, data.participationByMonth.map((p) => p.activities), SERIES_RED),
          lineDataset(copy.participation.learners, data.participationByMonth.map((p) => p.active_learners), SERIES_BLUE, {
            fill: false,
            borderDash: [6, 4],
            backgroundColor: SERIES_BLUE,
          }),
        ],
      },
    };

    const registrations = {
      hasData: data.registeredLearners > 0 && data.registrationsByMonth.length > 0,
      data: {
        labels: data.registrationsByMonth.map((point) => point.month),
        datasets: [lineDataset(copy.registrations.series, data.registrationsByMonth.map((p) => p.total), SERIES_RED)],
      },
    };

    const barangays = {
      hasData: data.barangays.represented > 0 && data.barangays.byMonth.length > 0,
      data: {
        labels: data.barangays.byMonth.map((point) => point.month),
        datasets: [lineDataset(copy.barangays.series, data.barangays.byMonth.map((p) => p.total), SERIES_RED, {
          stepped: 'before',
          tension: 0,
        })],
      },
    };

    return { lineOptions, participation, registrations, barangays };
  }, [copy, data, locale, reduceMotion]);

  const formatCount = (value) => new Intl.NumberFormat(locale).format(value);
  const monthRows = (series, fields) => series.map((point) => [
    formatMonth(point.month, locale),
    ...fields.map((field) => formatCount(point[field])),
  ]);

  const renderChart = (hasData, chart, fallback) => {
    if (!hasData) return fallback || <TrendsEmpty title={copy.emptyTitle} text={copy.emptyText} />;
    return <div className="trends-chart">{chartsInView ? chart : null}</div>;
  };

  const coveragePercent = data && data.barangays.officialTotal > 0
    ? Math.min(100, Math.round((data.barangays.represented / data.barangays.officialTotal) * 100))
    : 0;

  return (
    <section className="trends" id="trends" aria-labelledby="trends-title" ref={sectionRef}>
      <div className="trends-container">
        <header className="trends-heading" data-trends-reveal>
          <div>
            <p className="trends-eyebrow">{copy.eyebrow}</p>
            <h2 id="trends-title">{copy.title}</h2>
            <p className="trends-intro">{copy.intro}</p>
          </div>
          <div className="trends-meta">
            <p className="trends-privacy">
              <FiShield aria-hidden="true" />
              <span>{copy.privacy}</span>
            </p>
            {data?.generatedAt ? (
              <p className="trends-updated">
                <span className="trends-live-dot" aria-hidden="true" />
                {copy.updated} {formatUpdatedAt(data.generatedAt, locale)}
              </p>
            ) : null}
          </div>
        </header>

        {state.status === 'loading' ? <TrendsSkeleton label={copy.loading} /> : null}

        {state.status === 'error' ? (
          <div className="trends-error" role="alert" data-trends-reveal>
            <strong>{copy.errorTitle}</strong>
            <span>{copy.errorText}</span>
            <button type="button" onClick={retry}>
              <FiRefreshCw aria-hidden="true" />
              {copy.retry}
            </button>
          </div>
        ) : null}

        {state.status === 'ready' && data && charts ? (
          <>
            <dl className="trends-stats" data-trends-reveal>
              <TrendsStat
                label={copy.stats.learners.label}
                hint={copy.stats.learners.hint}
                value={formatCount(data.registeredLearners)}
                countTo={data.registeredLearners}
              />
              <TrendsStat
                label={copy.stats.barangays.label}
                hint={copy.stats.barangays.hint}
                value={formatCount(data.barangays.represented)}
                countTo={data.barangays.represented}
                suffix={data.barangays.officialTotal > 0
                  ? `${copy.stats.barangays.of} ${formatCount(data.barangays.officialTotal)}`
                  : null}
              />
              <TrendsStat
                label={copy.stats.modules.label}
                hint={copy.stats.modules.hint}
                value={formatCount(data.completedModules)}
                countTo={data.completedModules}
              />
              {data.assessment.averageDifference === null ? (
                <TrendsStat
                  label={copy.stats.difference.label}
                  hint={copy.stats.difference.hint}
                  value={copy.stats.difference.empty}
                  muted
                />
              ) : (
                <TrendsStat
                  label={copy.stats.difference.label}
                  hint={copy.stats.difference.hint}
                  value={formatSignedScore(data.assessment.averageDifference, locale)}
                  suffix={copy.points}
                />
              )}
            </dl>

            <div className="trends-grid">
              <TrendsFigure
                index={1}
                title={copy.participation.title}
                subtitle={copy.participation.subtitle}
                copy={copy}
                section={copy.participation}
              >
                {charts.participation.hasData ? (
                  <TrendsLegend items={[
                    { label: copy.participation.activities, hint: copy.participation.activitiesHint, color: SERIES_RED },
                    { label: copy.participation.learners, hint: copy.participation.learnersHint, color: SERIES_BLUE, shape: 'dash' },
                  ]}
                  />
                ) : null}
                {renderChart(charts.participation.hasData, (
                  <Line
                    data={charts.participation.data}
                    options={charts.lineOptions}
                    role="img"
                    aria-label={`${copy.participation.title}. ${copy.participation.subtitle}.`}
                  />
                ))}
                <TrendsTable
                  caption={`${copy.participation.title}: ${copy.tableCaption}`}
                  columns={[copy.month, copy.participation.activities, copy.participation.learners]}
                  rows={monthRows(data.participationByMonth, ['activities', 'active_learners'])}
                />
              </TrendsFigure>

              <TrendsFigure
                index={2}
                title={copy.registrations.title}
                subtitle={copy.registrations.subtitle}
                copy={copy}
                section={copy.registrations}
              >
                {renderChart(charts.registrations.hasData, (
                  <Line
                    data={charts.registrations.data}
                    options={charts.lineOptions}
                    role="img"
                    aria-label={`${copy.registrations.title}. ${copy.registrations.subtitle}.`}
                  />
                ))}
                <TrendsTable
                  caption={`${copy.registrations.title}: ${copy.tableCaption}`}
                  columns={[copy.month, copy.registrations.series]}
                  rows={monthRows(data.registrationsByMonth, ['total'])}
                />
              </TrendsFigure>

              <TrendsFigure
                index={3}
                title={copy.barangays.title}
                subtitle={copy.barangays.subtitle}
                copy={copy}
                section={copy.barangays}
              >
                {renderChart(charts.barangays.hasData, (
                  <Line
                    data={charts.barangays.data}
                    options={charts.lineOptions}
                    role="img"
                    aria-label={`${copy.barangays.title}. ${copy.barangays.subtitle}.`}
                  />
                ))}
                {charts.barangays.hasData && data.barangays.officialTotal > 0 ? (
                  <div className="trends-coverage">
                    <div
                      className="trends-coverage-track"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={data.barangays.officialTotal}
                      aria-valuenow={data.barangays.represented}
                      aria-label={copy.barangays.title}
                    >
                      <span style={{ width: `${coveragePercent}%` }} />
                    </div>
                    <TrendsTip content={copy.barangays.coverageHint} bubbleClassName="is-small">
                      {(tipProps) => (
                        <button type="button" className="trends-coverage-label" {...tipProps}>
                          {copy.barangays.coverage(
                            formatCount(data.barangays.represented),
                            formatCount(data.barangays.officialTotal),
                            coveragePercent,
                          )}
                        </button>
                      )}
                    </TrendsTip>
                  </div>
                ) : null}
                <TrendsTable
                  caption={`${copy.barangays.title}: ${copy.tableCaption}`}
                  columns={[copy.month, copy.barangays.series]}
                  rows={monthRows(data.barangays.byMonth, ['total'])}
                />
              </TrendsFigure>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
