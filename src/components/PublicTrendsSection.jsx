import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
} from 'chart.js';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { FiBarChart2, FiRefreshCw, FiShield } from 'react-icons/fi';
import { useLandingContent } from '../context/LandingContentContext';
import { getPublicTrends } from '../utils/publicContentService';
import { MANILA_TIME_ZONE } from '../utils/dateUtils';
import './PublicTrendsSection.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip);
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
    module: 'Module',
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
      shows: 'Each month’s count of completed learning actions (submitted pre-tests and post-tests, finished lessons, and completed simulations), together with how many different learners took part.',
      means: 'A rising line means more residents are actively learning with IGNIS SAFE. A dip means there was less activity that month.',
      read: 'Read from left (oldest) to right (newest). Hover over or tap a month to see its exact numbers. The latest month is still in progress, so its count can still grow.',
    },
    registrations: {
      title: 'Registered learners over time',
      subtitle: 'Running total of verified accounts',
      series: 'Registered learners',
      shows: 'The running total of residents who created and verified an IGNIS SAFE account, month by month.',
      means: 'Growth shows the program reaching more people. Because it is a running total, the line can only stay level or go up.',
      read: 'The right end of the line is today’s total. Steeper parts mean more people signed up that month.',
    },
    barangays: {
      title: 'Barangays represented',
      subtitle: 'Barangays with at least one registered learner',
      series: 'Barangays represented',
      coverage: (count, total, percent) => `${count} of ${total} official barangays (${percent}%)`,
      shows: 'How many of the official barangays of Dasmariñas have at least one registered learner, based on the barangay each learner entered in their profile.',
      means: 'More barangays means fire safety learning is spreading across the city instead of staying in a few areas.',
      read: 'Each step up means a new barangay joined. The bar underneath compares today’s total with all official barangays.',
    },
    modules: {
      title: 'Module activity',
      subtitle: 'Learners who started and completed each module',
      started: 'Started (took the pre-test)',
      completed: 'Completed',
      shows: 'For each module, how many learners took the pre-test and how many finished the whole module: pre-test, lesson, and post-test.',
      means: 'Longer bars mean more learners are taking that module. A large gap between the two bars means many learners have started but not finished yet.',
      read: 'Compare the blue bar (started) with the red bar (completed) on each row. Hover over or tap a bar for the exact count.',
    },
    assessment: {
      title: 'Average assessment difference',
      subtitle: 'Average pre-test score compared with post-test score',
      pre: 'Pre-test average',
      post: 'Post-test average',
      overall: 'All modules',
      headline: (pre, post, records) => `Post-test average ${post} vs. pre-test average ${pre}, from ${records} comparable results.`,
      waiting: (count, min) => `This graph appears once at least ${min} learners have completed both the pre-test and the post-test of a module, so that no one’s individual score can be identified. Comparable results so far: ${count} of ${min}.`,
      axis: 'Average score (out of 100)',
      shows: 'The average score before studying a module (pre-test) beside the average score after it (post-test). Only learners who completed both tests for the same module are counted.',
      means: 'When the post-test bar is taller, learners scored higher after the lesson, a sign the modules are helping. The difference is in percentage points.',
      read: 'Scores are out of 100. A module appears only when at least 5 learners have both scores, so no individual result can be identified.',
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
    module: 'Module',
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
      shows: 'Ang bilang ng mga natapos na gawain sa pag-aaral bawat buwan (naipasang pre-test at post-test, natapos na aralin, at natapos na simulation), kasama kung ilang magkakaibang mag-aaral ang lumahok.',
      means: 'Kapag tumataas ang linya, mas maraming residente ang aktibong nag-aaral gamit ang IGNIS SAFE. Kapag bumaba, mas kaunti ang naging gawain sa buwang iyon.',
      read: 'Basahin mula kaliwa (pinakaluma) pakanan (pinakabago). I-hover o i-tap ang isang buwan para makita ang eksaktong bilang. Hindi pa tapos ang pinakahuling buwan kaya maaari pang tumaas ang bilang nito.',
    },
    registrations: {
      title: 'Mga rehistradong mag-aaral sa paglipas ng panahon',
      subtitle: 'Tumatakbong kabuuan ng mga beripikadong account',
      series: 'Mga rehistradong mag-aaral',
      shows: 'Ang tumatakbong kabuuan ng mga residenteng gumawa at nag-verify ng IGNIS SAFE account, buwan-buwan.',
      means: 'Ipinapakita ng paglago na mas maraming tao ang naaabot ng programa. Dahil tumatakbong kabuuan ito, maaari lamang manatili o tumaas ang linya.',
      read: 'Ang dulong kanan ng linya ang kabuuan ngayon. Ang mas matarik na bahagi ay nangangahulugang mas maraming nag-sign up sa buwang iyon.',
    },
    barangays: {
      title: 'Mga barangay na kinakatawan',
      subtitle: 'Mga barangay na may kahit isang rehistradong mag-aaral',
      series: 'Mga barangay na kinakatawan',
      coverage: (count, total, percent) => `${count} sa ${total} opisyal na barangay (${percent}%)`,
      shows: 'Kung ilan sa mga opisyal na barangay ng Dasmariñas ang may kahit isang rehistradong mag-aaral, batay sa barangay na inilagay ng bawat mag-aaral sa kanilang profile.',
      means: 'Kapag mas maraming barangay, mas lumalaganap ang pag-aaral tungkol sa kaligtasan sa sunog sa buong lungsod at hindi lamang sa iilang lugar.',
      read: 'Bawat pagtaas ng linya ay nangangahulugang may bagong barangay na sumali. Inihahambing ng bar sa ibaba ang kabuuan ngayon sa lahat ng opisyal na barangay.',
    },
    modules: {
      title: 'Aktibidad sa bawat module',
      subtitle: 'Mga mag-aaral na nagsimula at nakatapos ng bawat module',
      started: 'Nagsimula (kumuha ng pre-test)',
      completed: 'Natapos',
      shows: 'Para sa bawat module, kung ilang mag-aaral ang kumuha ng pre-test at kung ilan ang nakatapos ng buong module: pre-test, aralin, at post-test.',
      means: 'Ang mas mahabang bar ay nangangahulugang mas maraming mag-aaral ang kumukuha ng module na iyon. Kapag malaki ang agwat ng dalawang bar, marami ang nagsimula pero hindi pa nakakatapos.',
      read: 'Ihambing ang asul na bar (nagsimula) at pulang bar (natapos) sa bawat hanay. I-hover o i-tap ang bar para sa eksaktong bilang.',
    },
    assessment: {
      title: 'Average na pagbabago sa assessment',
      subtitle: 'Average na score sa pre-test kumpara sa post-test',
      pre: 'Average sa pre-test',
      post: 'Average sa post-test',
      overall: 'Lahat ng module',
      headline: (pre, post, records) => `Average sa post-test na ${post} kumpara sa average sa pre-test na ${pre}, mula sa ${records} maihahambing na resulta.`,
      waiting: (count, min) => `Lalabas ang graph na ito kapag hindi bababa sa ${min} mag-aaral ang nakatapos ng pre-test at post-test ng isang module, para walang indibidwal na score na matukoy. Maihahambing na resulta sa ngayon: ${count} sa ${min}.`,
      axis: 'Average na score (sa 100)',
      shows: 'Ang average na score bago pag-aralan ang module (pre-test) katabi ng average na score pagkatapos nito (post-test). Binibilang lamang ang mga mag-aaral na nakatapos ng parehong test sa iisang module.',
      means: 'Kapag mas mataas ang bar ng post-test, mas mataas ang nakuha ng mga mag-aaral pagkatapos ng aralin, palatandaan na nakatutulong ang mga module. Nasa percentage points ang pagbabago.',
      read: 'Ang mga score ay mula 0 hanggang 100. Lumalabas lamang ang isang module kapag hindi bababa sa 5 mag-aaral ang may parehong score, kaya walang indibidwal na resulta na matutukoy.',
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

// "Module 1 - Fire Extinguisher: Basics, Types, and How to Use" -> "Fire Extinguisher"
const getModuleTopic = (title) => {
  const afterDash = String(title || '').split(' - ').slice(1).join(' - ');
  return afterDash.split(':')[0].trim();
};

const getModuleLabel = (module) => {
  const topic = getModuleTopic(module.title);
  return topic ? [`Module ${module.moduleNo}`, topic] : [`Module ${module.moduleNo}`];
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

const BAR_BASE = {
  borderRadius: 4,
  borderSkipped: 'start',
  categoryPercentage: 0.7,
  barPercentage: 0.86,
};

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

function TrendsLegend({ items }) {
  return (
    <ul className="trends-legend" aria-hidden="true">
      {items.map((item) => (
        <li key={item.label}>
          <span className={`trends-legend-swatch is-${item.shape || 'line'}`} style={{ '--swatch': item.color }} />
          {item.label}
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

function TrendsExplanation({ copy, section }) {
  return (
    <dl className="trends-explain">
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

function TrendsFigure({ index, title, subtitle, className = '', explanation, children }) {
  return (
    <article className={`trends-figure ${className}`.trim()} data-trends-reveal>
      <div className="trends-figure-main">
        <header className="trends-figure-header">
          <span className="trends-figure-index" aria-hidden="true">{String(index).padStart(2, '0')}</span>
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
        </header>
        {children}
      </div>
      {explanation}
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
    const barAnimation = reduceMotion ? false : { duration: 1000, easing: 'easeOutQuart' };

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

    const moduleLabels = data.modules.map(getModuleLabel);
    const modules = {
      hasData: data.modules.some((module) => module.started > 0 || module.completed > 0),
      data: {
        labels: moduleLabels,
        datasets: [
          { ...BAR_BASE, maxBarThickness: 16, label: copy.modules.started, data: data.modules.map((m) => m.started), backgroundColor: SERIES_BLUE },
          { ...BAR_BASE, maxBarThickness: 16, label: copy.modules.completed, data: data.modules.map((m) => m.completed), backgroundColor: SERIES_RED },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: barAnimation,
        interaction: { mode: 'index', axis: 'y', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: { title: (items) => (items[0] ? moduleLabels[items[0].dataIndex].join(' · ') : '') },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            suggestedMax: 4,
            grid: { color: GRID },
            border: { display: false },
            ticks: { ...AXIS_TICKS, precision: 0, maxTicksLimit: 5 },
          },
          y: { grid: { display: false }, border: { color: GRID }, ticks: { ...AXIS_TICKS, color: INK } },
        },
      },
    };

    const assessmentGroups = data.assessment.averageDifference === null
      ? []
      : [
        { label: copy.assessment.overall, pre: data.assessment.averagePre, post: data.assessment.averagePost },
        ...data.assessmentByModule.map((row) => ({
          label: `Module ${row.moduleNo}`,
          pre: row.averagePre,
          post: row.averagePost,
        })),
      ];

    const assessment = {
      hasData: assessmentGroups.length > 0,
      groups: assessmentGroups,
      data: {
        labels: assessmentGroups.map((group) => group.label),
        datasets: [
          { ...BAR_BASE, maxBarThickness: 28, label: copy.assessment.pre, data: assessmentGroups.map((g) => g.pre), backgroundColor: SERIES_BLUE },
          { ...BAR_BASE, maxBarThickness: 28, label: copy.assessment.post, data: assessmentGroups.map((g) => g.post), backgroundColor: SERIES_RED },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: barAnimation,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              label: (item) => ` ${item.dataset.label}: ${formatScore(item.parsed.y, locale)}`,
              footer: (items) => {
                const group = assessmentGroups[items[0]?.dataIndex];
                return group ? `${formatSignedScore(group.post - group.pre, locale)} ${copy.points}` : '';
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { color: GRID }, ticks: { ...AXIS_TICKS, color: INK } },
          y: {
            min: 0,
            max: 100,
            grid: { color: GRID },
            border: { display: false },
            ticks: { ...AXIS_TICKS, stepSize: 25 },
            title: { display: true, text: copy.assessment.axis, color: MUTED, font: { family: 'Poppins', size: 11 } },
          },
        },
      },
    };

    return { lineOptions, participation, registrations, barangays, modules, assessment };
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
                className="is-wide"
                explanation={<TrendsExplanation copy={copy} section={copy.participation} />}
              >
                {charts.participation.hasData ? (
                  <TrendsLegend items={[
                    { label: copy.participation.activities, color: SERIES_RED },
                    { label: copy.participation.learners, color: SERIES_BLUE, shape: 'dash' },
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
                explanation={<TrendsExplanation copy={copy} section={copy.registrations} />}
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
                explanation={<TrendsExplanation copy={copy} section={copy.barangays} />}
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
                    <p>
                      {copy.barangays.coverage(
                        formatCount(data.barangays.represented),
                        formatCount(data.barangays.officialTotal),
                        coveragePercent,
                      )}
                    </p>
                  </div>
                ) : null}
                <TrendsTable
                  caption={`${copy.barangays.title}: ${copy.tableCaption}`}
                  columns={[copy.month, copy.barangays.series]}
                  rows={monthRows(data.barangays.byMonth, ['total'])}
                />
              </TrendsFigure>

              <TrendsFigure
                index={4}
                title={copy.modules.title}
                subtitle={copy.modules.subtitle}
                className="is-modules"
                explanation={<TrendsExplanation copy={copy} section={copy.modules} />}
              >
                {charts.modules.hasData ? (
                  <TrendsLegend items={[
                    { label: copy.modules.started, color: SERIES_BLUE, shape: 'bar' },
                    { label: copy.modules.completed, color: SERIES_RED, shape: 'bar' },
                  ]}
                  />
                ) : null}
                {renderChart(charts.modules.hasData, (
                  <Bar
                    data={charts.modules.data}
                    options={charts.modules.options}
                    role="img"
                    aria-label={`${copy.modules.title}. ${copy.modules.subtitle}.`}
                  />
                ))}
                <TrendsTable
                  caption={`${copy.modules.title}: ${copy.tableCaption}`}
                  columns={[copy.module, copy.modules.started, copy.modules.completed]}
                  rows={data.modules.map((module) => [
                    getModuleLabel(module).join(' · '),
                    formatCount(module.started),
                    formatCount(module.completed),
                  ])}
                />
              </TrendsFigure>

              <TrendsFigure
                index={5}
                title={copy.assessment.title}
                subtitle={copy.assessment.subtitle}
                explanation={<TrendsExplanation copy={copy} section={copy.assessment} />}
              >
                {charts.assessment.hasData ? (
                  <>
                    <p className="trends-assessment-headline">
                      <strong>
                        {formatSignedScore(data.assessment.averageDifference, locale)}
                        <small>{copy.points}</small>
                      </strong>
                      <span>
                        {copy.assessment.headline(
                          formatScore(data.assessment.averagePre, locale),
                          formatScore(data.assessment.averagePost, locale),
                          formatCount(data.assessment.comparableRecords),
                        )}
                      </span>
                    </p>
                    <TrendsLegend items={[
                      { label: copy.assessment.pre, color: SERIES_BLUE, shape: 'bar' },
                      { label: copy.assessment.post, color: SERIES_RED, shape: 'bar' },
                    ]}
                    />
                  </>
                ) : null}
                {renderChart(
                  charts.assessment.hasData,
                  (
                    <Bar
                      data={charts.assessment.data}
                      options={charts.assessment.options}
                      role="img"
                      aria-label={`${copy.assessment.title}. ${copy.assessment.subtitle}.`}
                    />
                  ),
                  <TrendsEmpty
                    title={copy.emptyTitle}
                    text={copy.assessment.waiting(
                      formatCount(data.assessment.comparableRecords),
                      formatCount(data.minGroupSize),
                    )}
                  />,
                )}
                {charts.assessment.hasData ? (
                  <TrendsTable
                    caption={`${copy.assessment.title}: ${copy.tableCaption}`}
                    columns={[copy.module, copy.assessment.pre, copy.assessment.post]}
                    rows={charts.assessment.groups.map((group) => [
                      group.label,
                      formatScore(group.pre, locale),
                      formatScore(group.post, locale),
                    ])}
                  />
                ) : null}
              </TrendsFigure>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
