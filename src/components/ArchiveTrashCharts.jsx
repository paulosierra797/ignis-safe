import { Bar, Line } from 'react-chartjs-2';
import { formatBytes } from '../utils/archiveService';
import { storageLabel } from '../utils/storageLabels';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(BarElement, CategoryScale, Filler, LinearScale, LineElement, PointElement, Tooltip, Legend);

// Categorical slots in fixed order (validated: CVD ΔE 9.2, normal ΔE 27.6 on
// white). Slot 3 is under 3:1 contrast, so every chart ships a legend or
// title plus a data table.
const SERIES = {
  archived: '#2a78d6',
  deleted: '#eb6834',
  restored: '#1baf7a'
};
const SINGLE_SERIES = SERIES.archived;
const INK = { primary: '#172033', secondary: '#475467', muted: '#667085', grid: 'rgba(152, 162, 179, 0.18)' };

const tooltip = {
  backgroundColor: '#172033',
  titleFont: { family: 'Poppins', size: 12, weight: '600' },
  bodyFont: { family: 'Poppins', size: 12 },
  padding: 10,
  cornerRadius: 8,
  boxPadding: 4,
  usePointStyle: true
};

const axisTicks = { color: INK.muted, font: { family: 'Poppins', size: 11 } };

const legend = {
  display: true,
  position: 'top',
  align: 'start',
  labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, color: INK.secondary, font: { family: 'Poppins', size: 11 } }
};

function ChartFigure({ title, caption, children, table }) {
  return (
    <figure className="at-chart">
      <figcaption>
        <h3>{title}</h3>
        {caption && <p>{caption}</p>}
      </figcaption>
      <div className="at-chart-canvas">{children}</div>
      <details className="at-chart-data">
        <summary>View data</summary>
        {table}
      </details>
    </figure>
  );
}

function DataTable({ head, rows }) {
  return (
    <div className="at-chart-table-wrap">
      <table className="at-chart-table">
        <thead><tr>{head.map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={head.length}>No data yet.</td></tr>
            : rows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

const monthLabel = (month) => {
  const [year, value] = String(month).split('-').map(Number);
  return new Date(year, value - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

export function StorageGrowthChart({ growth = [] }) {
  const labels = growth.map((point) => monthLabel(point.month));
  const values = growth.map((point) => Number(point.bytes) || 0);
  return (
    <ChartFigure
      title="File storage growth"
      caption="Cumulative Supabase Storage usage, last 12 months"
      table={<DataTable head={['Month', 'Total files']} rows={growth.map((point) => [monthLabel(point.month), formatBytes(point.bytes)])} />}
    >
      <Line
        aria-label="Line chart of cumulative file storage by month"
        role="img"
        data={{
          labels,
          datasets: [{
            label: 'File storage',
            data: values,
            borderColor: SINGLE_SERIES,
            backgroundColor: 'rgba(42, 120, 214, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHitRadius: 16,
            pointBackgroundColor: SINGLE_SERIES,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2
          }]
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: { ...tooltip, callbacks: { label: (context) => ` ${formatBytes(context.parsed.y)}` } }
          },
          scales: {
            x: { grid: { display: false }, ticks: axisTicks },
            y: { beginAtZero: true, grid: { color: INK.grid }, border: { display: false }, ticks: { ...axisTicks, maxTicksLimit: 5, callback: (value) => formatBytes(value) } }
          }
        }}
      />
    </ChartFigure>
  );
}

export function StorageCompositionChart({ databaseBytes = 0, buckets = [] }) {
  const rows = [
    { label: 'Database', bytes: Number(databaseBytes) || 0 },
    ...buckets.map((bucket) => ({ label: storageLabel(bucket.bucket), bytes: Number(bucket.bytes) || 0, objects: bucket.objects }))
  ].sort((left, right) => right.bytes - left.bytes);

  return (
    <ChartFigure
      title="Storage usage"
      caption="Space used by records, backups, and uploaded files"
      table={<DataTable head={['Location', 'Size', 'Files']} rows={rows.map((row) => [row.label, formatBytes(row.bytes), row.objects ?? '—'])} />}
    >
      <Bar
        aria-label="Bar chart of storage used by the database and each bucket"
        role="img"
        data={{
          labels: rows.map((row) => row.label),
          datasets: [{
            label: 'Size',
            data: rows.map((row) => row.bytes),
            backgroundColor: SINGLE_SERIES,
            borderRadius: 4,
            borderSkipped: 'start',
            barThickness: 12
          }]
        }}
        options={{
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...tooltip,
              callbacks: {
                label: (context) => {
                  const row = rows[context.dataIndex];
                  return ` ${formatBytes(row.bytes)}${row.objects != null ? ` · ${row.objects} files` : ''}`;
                }
              }
            }
          },
          scales: {
            x: { beginAtZero: true, grid: { color: INK.grid }, border: { display: false }, ticks: { ...axisTicks, maxTicksLimit: 4, callback: (value) => formatBytes(value) } },
            y: { grid: { display: false }, ticks: { ...axisTicks, color: INK.secondary } }
          }
        }}
      />
    </ChartFigure>
  );
}

export function ArchiveActivityChart({ trend = [] }) {
  const byDay = new Map(trend.map((point) => [point.date, point]));
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - index));
    const key = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const point = byDay.get(key) || {};
    return {
      key,
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      archived: Number(point.archived) || 0,
      restored: Number(point.restored) || 0,
      deleted: Number(point.deleted) || 0
    };
  });

  const series = [
    { key: 'archived', label: 'Archived', color: SERIES.archived },
    { key: 'deleted', label: 'Deleted', color: SERIES.deleted },
    { key: 'restored', label: 'Restored', color: SERIES.restored }
  ];

  return (
    <ChartFigure
      title="Archive activity"
      caption="Archive, restore, and deletion events, last 30 days"
      table={<DataTable head={['Day', 'Archived', 'Deleted', 'Restored']} rows={days.filter((day) => day.archived || day.deleted || day.restored).map((day) => [day.label, day.archived, day.deleted, day.restored])} />}
    >
      <Bar
        aria-label="Stacked bar chart of archive, deletion, and restore events per day"
        role="img"
        data={{
          labels: days.map((day) => day.label),
          datasets: series.map((entry) => ({
            label: entry.label,
            data: days.map((day) => day[entry.key]),
            backgroundColor: entry.color,
            borderColor: '#ffffff',
            borderWidth: { top: 2, bottom: 0, left: 0, right: 0 },
            borderRadius: 4,
            borderSkipped: 'start',
            barPercentage: 0.7,
            categoryPercentage: 0.9
          }))
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend, tooltip },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { ...axisTicks, maxTicksLimit: 6, maxRotation: 0 } },
            y: { stacked: true, beginAtZero: true, grid: { color: INK.grid }, border: { display: false }, ticks: { ...axisTicks, precision: 0, maxTicksLimit: 5 } }
          }
        }}
      />
    </ChartFigure>
  );
}

const COUNTDOWN_BUCKETS = [
  { label: 'Due now', min: 0, max: 0 },
  { label: '1–7 days', min: 1, max: 7 },
  { label: '8–14 days', min: 8, max: 14 },
  { label: '15–21 days', min: 15, max: 21 },
  { label: '22–30 days', min: 22, max: Infinity }
];

export function DeletionCountdownChart({ remainingDays = [] }) {
  const counts = COUNTDOWN_BUCKETS.map((bucket) => remainingDays.filter((days) => days >= bucket.min && days <= bucket.max).length);
  return (
    <ChartFigure
      title="Deletion countdown"
      caption="Items in Trash by days left before permanent deletion"
      table={<DataTable head={['Days left', 'Items']} rows={COUNTDOWN_BUCKETS.map((bucket, index) => [bucket.label, counts[index]])} />}
    >
      <Bar
        aria-label="Bar chart of Trash items grouped by days remaining"
        role="img"
        data={{
          labels: COUNTDOWN_BUCKETS.map((bucket) => bucket.label),
          datasets: [{
            label: 'Items',
            data: counts,
            backgroundColor: SINGLE_SERIES,
            borderRadius: 4,
            borderSkipped: 'start',
            barPercentage: 0.55
          }]
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: { label: (context) => ` ${context.parsed.y} item${context.parsed.y === 1 ? '' : 's'}` } } },
          scales: {
            x: { grid: { display: false }, ticks: { ...axisTicks, maxRotation: 0 } },
            y: { beginAtZero: true, grid: { color: INK.grid }, border: { display: false }, ticks: { ...axisTicks, precision: 0, maxTicksLimit: 5 } }
          }
        }}
      />
    </ChartFigure>
  );
}
