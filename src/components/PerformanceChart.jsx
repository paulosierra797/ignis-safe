import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { wrapChartLabels } from '../utils/chartLabelUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const options = {
  responsive: true,
  plugins: {
    legend: {
      display: false
    },
    title: {
      display: false
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        precision: 0
      }
    },
    x: {
      ticks: {
        autoSkip: false,
        maxRotation: 0,
        minRotation: 0,
      },
    },
  }
};

const data = {
  labels: [],
  datasets: [
    {
      label: 'Attempts',
      data: [0, 0, 0],
      backgroundColor: '#b91c1c',
      borderRadius: 6,
      barPercentage: 0.5,
      categoryPercentage: 0.5
    }
  ]
};

export default function PerformanceChart({ chartData }) {
  const liveAttempts = chartData?.attempts?.length ? chartData.attempts : data.datasets[0].data;

  const liveData = {
    labels: wrapChartLabels(chartData?.labels?.length ? chartData.labels : data.labels),
    datasets: [
      {
        ...data.datasets[0],
        data: liveAttempts,
      },
    ],
  };

  const maxAttempt = Math.max(...liveAttempts, 0);
  const dynamicMax = maxAttempt > 0 ? Math.ceil(maxAttempt * 1.2) : 5;

  return (
    <div style={{ height: '200px', width: '100%' }}>
      <Bar
        data={liveData}
        options={{
          ...options,
          maintainAspectRatio: false,
          scales: {
            ...options.scales,
            y: {
              ...options.scales.y,
              max: dynamicMax,
            },
          },
        }}
      />
    </div>
  );
}
