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
      beginAtZero: true,
      max: 100,
      ticks: {
        callback: (value) => `${value}%`,
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
      borderColor: '#0ea5e9',
      backgroundColor: 'rgba(14, 165, 233, 0.15)',
      fill: true,
      tension: 0.35,
      pointRadius: 4,
      pointHoverRadius: 5,
      pointBackgroundColor: '#0284c7',
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
