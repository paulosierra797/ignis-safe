import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        boxWidth: 10,
        boxHeight: 10,
        usePointStyle: true,
      },
    },
    tooltip: {
      callbacks: {
        label: (context) => {
          const value = context.parsed || 0;
          return `${context.label}: ${value} learners`;
        },
      },
    },
  },
  cutout: '68%',
};

const fallbackData = {
  labels: ['High', 'Moderate', 'Low'],
  datasets: [
    {
      label: 'Risk Distribution',
      data: [0, 0, 0],
      backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
      borderColor: ['#ffffff', '#ffffff', '#ffffff'],
      borderWidth: 2,
      hoverOffset: 4,
    },
  ],
};

export default function RiskDistributionChart({ chartData }) {
  const liveData = {
    labels: chartData?.labels?.length ? chartData.labels : fallbackData.labels,
    datasets: [
      {
        ...fallbackData.datasets[0],
        data: chartData?.values?.length ? chartData.values : fallbackData.datasets[0].data,
      },
    ],
  };

  const total = (liveData.datasets[0].data || []).reduce((sum, value) => sum + Number(value || 0), 0);

  return (
    <div style={{ position: 'relative', height: '250px' }}>
      <Doughnut data={liveData} options={options} />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111827' }}>{total}</div>
        <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Learners</div>
      </div>
    </div>
  );
}
