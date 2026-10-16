import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

// Point shapes repeat the series identity so it never depends on color alone.
const POINT_STYLES = ['circle', 'rectRot', 'triangle', 'rect', 'star', 'crossRot'];

const TEXT = '#344054';
const MUTED = '#667085';
const FONT = "'Poppins', sans-serif";

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
);

const formatValue = (value, isGain) => {
  if (value === null || value === undefined) return 'no data';
  return isGain ? `${value > 0 ? '+' : ''}${value} pts` : `${value}%`;
};

// Writes the latest value at the end of each visible line, in text ink (never
// the series color). Only used when there are few lines, so labels stay legible.
const endLabelPlugin = {
  id: 'roundEndLabels',
  afterDatasetsDraw(chart, _args, options) {
    if (!options?.enabled) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = TEXT;
    ctx.textBaseline = 'bottom';
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      if (!chart.isDatasetVisible(datasetIndex)) return;
      let index = dataset.data.length - 1;
      while (index >= 0 && (dataset.data[index] === null || dataset.data[index] === undefined)) index -= 1;
      const point = chart.getDatasetMeta(datasetIndex).data[index];
      if (index < 0 || !point) return;
      const text = formatValue(dataset.data[index], options.isGain);
      const width = ctx.measureText(text).width;
      const x = point.x + 8 + width > chartArea.right ? point.x - 8 - width : point.x + 8;
      ctx.fillText(text, x, point.y - 6);
    });
    ctx.restore();
  },
};

/**
 * Line chart with assessment rounds on the x-axis.
 *
 * series: [{ key, label, color, values: number|null[], learners?: number|null[], dashed? }]
 * isGain: values are score-point changes (can be negative) instead of 0-100 scores.
 */
export default function RoundLineChart({
  rounds,
  series,
  isGain = false,
  highlightRound = null,
  directLabels = series.length <= 3,
  ariaLabel,
}) {
  const highlightIndex = highlightRound === null ? -1 : rounds.indexOf(Number(highlightRound));

  const data = {
    labels: rounds.map((roundNo) => `Round ${roundNo}`),
    datasets: series.map((line, index) => {
      const pointStyle = line.dashed ? 'line' : POINT_STYLES[index % POINT_STYLES.length];
      return {
        label: line.label,
        data: line.values,
        learners: line.learners || [],
        borderColor: line.color,
        backgroundColor: line.color,
        pointBackgroundColor: line.dashed ? line.color : '#fff',
        pointBorderColor: line.color,
        pointBorderWidth: 2,
        pointStyle,
        borderWidth: 2,
        borderDash: line.dashed ? [6, 5] : [],
        tension: 0.3,
        spanGaps: true,
        pointRadius: (context) => (context.dataIndex === highlightIndex ? 7 : 4),
        pointHoverRadius: 7,
        pointHitRadius: 14,
      };
    }),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: prefersReducedMotion() ? false : { duration: 750, easing: 'easeOutQuart' },
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 18, right: directLabels ? 12 : 4 } },
    plugins: {
      roundEndLabels: { enabled: directLabels, isGain },
      legend: {
        display: series.length > 1,
        position: 'top',
        align: 'start',
        labels: {
          usePointStyle: true,
          boxWidth: 8,
          boxHeight: 8,
          padding: 14,
          color: '#475467',
          font: { family: FONT, size: 12 },
        },
      },
      tooltip: {
        backgroundColor: '#172033',
        padding: 10,
        cornerRadius: 8,
        usePointStyle: true,
        boxPadding: 4,
        titleFont: { family: FONT, size: 12, weight: '600' },
        bodyFont: { family: FONT, size: 12 },
        callbacks: {
          label: (item) => {
            const learners = item.dataset.learners?.[item.dataIndex];
            const count = learners ? ` · ${learners} learner${learners === 1 ? '' : 's'}` : '';
            return ` ${item.dataset.label}: ${formatValue(item.raw, isGain)}${count}`;
          },
        },
      },
    },
    scales: {
      y: isGain
        ? {
          suggestedMin: -20,
          suggestedMax: 40,
          ticks: { callback: (value) => `${value > 0 ? '+' : ''}${value}`, color: MUTED, font: { family: FONT, size: 11 } },
          grid: {
            color: (context) => (context.tick.value === 0 ? 'rgba(71, 84, 103, 0.45)' : 'rgba(152, 162, 179, 0.16)'),
          },
          border: { display: false },
        }
        : {
          min: 0,
          max: 100,
          ticks: { stepSize: 25, callback: (value) => `${value}%`, color: MUTED, font: { family: FONT, size: 11 } },
          grid: { color: 'rgba(152, 162, 179, 0.16)' },
          border: { display: false },
        },
      x: {
        offset: rounds.length < 2,
        grid: { display: false },
        border: { color: '#eaecf0' },
        ticks: {
          color: (context) => (context.index === highlightIndex ? '#172033' : MUTED),
          font: (context) => ({ family: FONT, size: 11, weight: context.index === highlightIndex ? '700' : '500' }),
        },
      },
    },
  };

  return (
    <Line
      data={data}
      options={options}
      plugins={[endLabelPlugin]}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
