import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    title: {
      display: false,
    },
    tooltip: {
      callbacks: {
        label: (context) => `Knowledge Gain: ${context.parsed.y}%`,
      },
    },
  },
  scales: {
    y: {
      suggestedMin: -20,
      suggestedMax: 100,
      ticks: {
        callback: (value) => `${value}%`,
        color: '#667085',
      },
      grid: {
        color: (context) => context.tick.value === 0
          ? 'rgba(71, 84, 103, 0.45)'
          : 'rgba(152, 162, 179, 0.18)',
      },
    },
    x: {
      grid: {
        display: false,
      },
    },
  },
};

const fallbackData = {
  labels: [],
  datasets: [
    {
      label: 'Knowledge Gain',
      data: [],
      borderColor: '#0f766e',
      backgroundColor: 'rgba(15, 118, 110, 0.12)',
      fill: true,
      tension: 0.35,
      pointRadius: 4,
      pointHoverRadius: 5,
      pointBackgroundColor: '#0f766e',
    },
  ],
};

export default function KnowledgeGainTrendChart({ chartData }) {
  const liveData = {
    labels: chartData?.labels?.length ? chartData.labels : fallbackData.labels,
    datasets: [
      {
        ...fallbackData.datasets[0],
        data: chartData?.values?.length ? chartData.values : fallbackData.datasets[0].data,
      },
    ],
  };

  return <Line data={liveData} options={options} />;
}
